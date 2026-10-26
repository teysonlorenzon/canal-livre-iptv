'use strict';
/**
 * Calibração da abertura em segundo plano: quando um episódio começa, um vídeo auxiliar
 * escondido, mudo e acelerado (8×) ouve os primeiros minutos de outro episódio da mesma
 * temporada (se ainda não há referência) e depois o próprio episódio, à frente do que o
 * usuário está vendo. No modo decodificado (TV LG), em vez do vídeo auxiliar o arquivo é
 * baixado e decodificado (`intro-audio-decode.js`). A comparação de `intro-audio.js` acha a abertura antes de ela tocar e
 * guarda o som dela como o padrão da temporada; com o padrão, o auxiliar só procura a abertura
 * à frente e para assim que a acha.
 *
 * Proteções: o auxiliar abre uma segunda conexão com o servidor, então não roda em contas
 * Xtream de uma conexão só, nem em rede móvel (consumo de dados). Se o vídeo principal falhar
 * ou travar enquanto o auxiliar baixa, ou se o servidor recusar o auxiliar, a calibração é
 * cancelada na hora e fica pausada nesta lista por um dia.
 */

/** @type {number} Velocidade do vídeo auxiliar (o áudio capturado continua legível até 16×). */
const INTRO_CALIBRATION_PLAYBACK_RATE = 8;
/** @type {number} Intervalo (ms) entre as leituras do espectro do vídeo auxiliar. */
const INTRO_CALIBRATION_SAMPLE_MS = 15;
/** @type {number} Tempo (ms) para o vídeo auxiliar começar a tocar antes de desistir. */
const INTRO_CALIBRATION_START_TIMEOUT_MS = 20000;
/** @type {number} Tempo (ms) com o vídeo principal travado (carregando) que cancela a calibração. */
const INTRO_CALIBRATION_MAIN_STALL_MS = 6000;
/** @type {number} Por quanto tempo (ms) a calibração fica pausada na lista depois de um problema de conexão. */
const INTRO_CALIBRATION_PAUSE_MS = 24 * 60 * 60 * 1000;

/** @type {boolean} Se a plataforma permite abrir o vídeo auxiliar. */
let introCalibrationPlatformAllowed = true;

/**
 * Um episódio a ser ouvido pelo vídeo auxiliar.
 * @typedef {Object} PassoCalibracao
 * @property {string} url URL original do episódio.
 * @property {number} startAt Posição (s) de onde começar.
 * @property {LeiturasAudio} frameData Onde somar as leituras (as do próprio episódio em reprodução, no caso dele).
 * @property {boolean} isPlayingEpisode Se é o episódio em reprodução (ouvido à frente).
 */

/**
 * Calibração em andamento.
 * @typedef {Object} CalibracaoAbertura
 * @property {AnaliseAudioAbertura} session Análise do episódio em reprodução.
 * @property {PassoCalibracao[]} queue Episódios ainda a ouvir.
 * @property {PassoCalibracao|null} step Episódio sendo ouvido.
 * @property {HTMLVideoElement|null} element Vídeo auxiliar.
 * @property {OuvinteAudio|null} listener Ouvinte do vídeo auxiliar.
 * @property {number} timer Intervalo das leituras.
 * @property {number} startTimer Limite para o vídeo auxiliar começar.
 * @property {number} mainStallStartedAt Quando o vídeo principal começou a travar (0 = tocando bem).
 * @property {AbortController|null} abortController Cancela o download do modo decodificado.
 */
/** @type {CalibracaoAbertura|null} Calibração em andamento. */
let introCalibration = null;

/**
 * Desliga a calibração em segundo plano nesta plataforma (o vídeo auxiliar disputaria o
 * decodificador ou a conexão).
 * @returns {void}
 */
function disableIntroCalibration(){ introCalibrationPlatformAllowed = false; stopIntroCalibration(); }

/**
 * Indica se a conta permite uma segunda conexão e a rede não é móvel.
 * @returns {boolean} `true` se o vídeo auxiliar pode ser aberto.
 */
function canOpenCalibrationConnection(){
  if (!introCalibrationPlatformAllowed || !activePlaylist) return false;
  const networkConnection = navigator.connection;
  if (networkConnection && (networkConnection.saveData || networkConnection.type === 'cellular')) return false;
  const userInfo = activePlaylist.type === 'xtream' && catalog && catalog.info && catalog.info.user_info;
  if (userInfo && +userInfo.max_connections > 0 && +userInfo.max_connections < 2) return false;
  return Date.now() >= (loadIntroPrints().calibrationPausedUntil || 0);
}

/**
 * Outro episódio da mesma temporada para servir de referência: o seguinte, o anterior e assim por diante.
 * @param {Object} media Mídia em reprodução (`currentMedia`).
 * @returns {{url: string}|null} Episódio, ou `null` se a temporada só tem este.
 */
function neighbourEpisodeFor(media){
  const seriesContext = media.ctx; if (!seriesContext || !Array.isArray(seriesContext.flat)) return null;
  const episodeList = seriesContext.flat, playingIndex = seriesContext.i, season = String(media.desc.season);
  for (let distance = 1; distance < episodeList.length; distance++) {
    for (const candidateIndex of [playingIndex + distance, playingIndex - distance]) {
      const candidate = episodeList[candidateIndex];
      if (candidate && String(candidate.season) === season && candidate.url) return candidate;
    }
  }
  return null;
}

/**
 * Começa a calibração para o episódio que começou a tocar: sem referência nem padrão, ouve
 * antes um episódio vizinho; depois ouve o próprio episódio à frente da posição atual.
 * @param {AnaliseAudioAbertura} session Análise do episódio.
 * @returns {void}
 */
function startIntroCalibration(session){
  stopIntroCalibration();
  if (!canOpenCalibrationConnection()) return;
  const queue = [];
  if (!session.previousFrames && !session.patternFrames) {
    const neighbourEpisode = neighbourEpisodeFor(session.media); if (!neighbourEpisode) return;
    queue.push({ url:neighbourEpisode.url, startAt:0, frameData:createIntroFrameData(), isPlayingEpisode:false });
  }
  queue.push({ url:session.sourceUrl, startAt:0, frameData:session.frameData, isPlayingEpisode:true });
  introCalibration = { session, queue, step:null, element:null, listener:null, timer:0, startTimer:0, mainStallStartedAt:0, abortController:null };
  runNextCalibrationStep();
}

/**
 * Solta o vídeo auxiliar e o ouvinte do passo atual.
 * @param {CalibracaoAbertura} calibration Calibração.
 * @returns {void}
 */
function releaseCalibrationStep(calibration){
  clearInterval(calibration.timer); clearTimeout(calibration.startTimer); calibration.timer = calibration.startTimer = 0;
  if (calibration.abortController) { calibration.abortController.abort(); calibration.abortController = null; }
  if (calibration.listener) { disposeIntroAudioListener(calibration.listener); calibration.listener = null; }
  if (calibration.element) {
    const element = calibration.element; calibration.element = null;
    element.onerror = element.onplaying = null;
    element.pause(); element.removeAttribute('src'); element.load(); element.remove();
  }
}

/**
 * Encerra a calibração em andamento.
 * @returns {void}
 */
function stopIntroCalibration(){
  const calibration = introCalibration; if (!calibration) return;
  introCalibration = null;
  releaseCalibrationStep(calibration);
}

/**
 * Cancela a calibração por problema de conexão e a pausa nesta lista por um dia.
 * @returns {void}
 */
function pauseIntroCalibration(){
  stopIntroCalibration();
  if (!activePlaylist) return;
  const savedPrints = loadIntroPrints();
  savedPrints.calibrationPausedUntil = Date.now() + INTRO_CALIBRATION_PAUSE_MS;
  store.set(introPrintsKey(), savedPrints);
}

/**
 * Abre o vídeo auxiliar no próximo episódio da fila.
 * @returns {void}
 */
function runNextCalibrationStep(){
  const calibration = introCalibration; if (!calibration) return;
  releaseCalibrationStep(calibration);
  const step = calibration.step = calibration.queue.shift(); if (!step) { stopIntroCalibration(); return; }
  if (step.isPlayingEpisode) step.startAt = Math.max(0, video.currentTime);
  if (introAudioDecodedMode) { runDecodedCalibrationStep(calibration, step); return; }
  const element = calibration.element = document.createElement('video');
  element.muted = true; element.playsInline = true; element.preload = 'auto';
  element.setAttribute('playsinline', ''); element.setAttribute('aria-hidden', 'true');
  element.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
  calibration.listener = createIntroAudioListener(element, step.frameData);
  if (!calibration.listener) { stopIntroCalibration(); return; }
  element.onerror = pauseIntroCalibration;
  element.onplaying = () => { clearTimeout(calibration.startTimer); element.playbackRate = INTRO_CALIBRATION_PLAYBACK_RATE; };
  element.addEventListener('loadedmetadata', () => { if (step.startAt > 0) element.currentTime = step.startAt; }, { once:true });
  calibration.startTimer = setTimeout(pauseIntroCalibration, INTRO_CALIBRATION_START_TIMEOUT_MS);
  document.body.appendChild(element);
  element.src = mediaUrlForAudioAnalysis(step.url);
  element.playbackRate = INTRO_CALIBRATION_PLAYBACK_RATE;
  element.play().catch(() => {});
  calibration.timer = setInterval(sampleIntroCalibration, INTRO_CALIBRATION_SAMPLE_MS, calibration);
}

/**
 * Ouve um episódio baixando e decodificando o áudio dele. No episódio em reprodução, para
 * assim que a abertura é achada. Falha de rede ou pedido recusado pausa a calibração; formato
 * sem suporte só a encerra.
 * @param {CalibracaoAbertura} calibration Calibração.
 * @param {PassoCalibracao} step Episódio.
 * @returns {void}
 */
function runDecodedCalibrationStep(calibration, step){
  const abortController = calibration.abortController = new AbortController(), session = calibration.session;
  let isStepDone = false;
  /**
   * Procura a abertura com o que já foi decodificado e confere o vídeo principal.
   * @returns {void}
   */
  const checkProgress = () => {
    if (calibration !== introCalibration || calibration.step !== step) return;
    if (session !== introAudioSession) { stopIntroCalibration(); return; }
    if (isMainVideoStalled(calibration)) { pauseIntroCalibration(); return; }
    if (step.isPlayingEpisode) runIntroDetection(session, false);
    if (step.isPlayingEpisode && session.detectedRange) { isStepDone = true; abortController.abort(); }
  };
  calibration.timer = setInterval(checkProgress, 500);
  decodeIntroAudio(mediaUrlForAudioAnalysis(step.url), step.frameData, { fromTime:step.startAt, untilTime:INTRO_AUDIO_ANALYSIS_SECONDS, signal:abortController.signal, onProgress:checkProgress })
    .then(() => { isStepDone = true; })
    .catch(error => { if (!isStepDone && calibration === introCalibration && calibration.step === step) { if (error instanceof TypeError || /intervalo|indisponível/.test(error.message)) pauseIntroCalibration(); else stopIntroCalibration(); } })
    .then(() => { if (isStepDone && calibration === introCalibration && calibration.step === step) finishCalibrationStep(calibration); });
}

/**
 * Indica se o vídeo principal está travado há tempo demais (carregando sem seek nem pausa).
 * @param {CalibracaoAbertura} calibration Calibração.
 * @returns {boolean} `true` se a calibração deve ser cancelada.
 */
function isMainVideoStalled(calibration){
  const isStalled = !video.paused && !video.seeking && video.readyState < 3;
  if (!isStalled) { calibration.mainStallStartedAt = 0; return false; }
  if (!calibration.mainStallStartedAt) calibration.mainStallStartedAt = Date.now();
  return Date.now() - calibration.mainStallStartedAt > INTRO_CALIBRATION_MAIN_STALL_MS;
}

/**
 * Lê o áudio do vídeo auxiliar e passa ao próximo episódio ao chegar aos 6 min (ou, no
 * episódio em reprodução, assim que a abertura é achada).
 * @param {CalibracaoAbertura} calibration Calibração.
 * @returns {void}
 */
function sampleIntroCalibration(calibration){
  if (calibration !== introCalibration) return;
  const session = calibration.session, step = calibration.step, element = calibration.element;
  if (session !== introAudioSession) { stopIntroCalibration(); return; }
  if (isMainVideoStalled(calibration)) { pauseIntroCalibration(); return; }
  const isPlayingEpisodeDone = step.isPlayingEpisode && session.detectedRange;
  if (element.ended || element.currentTime >= INTRO_AUDIO_ANALYSIS_SECONDS - INTRO_AUDIO_FRAME_SECONDS || isPlayingEpisodeDone) { finishCalibrationStep(calibration); return; }
  const sampleResult = sampleIntroAudioListener(calibration.listener, INTRO_CALIBRATION_SAMPLE_MS, true);
  if (sampleResult === 'blocked') { stopIntroCalibration(); return; }
  if (step.isPlayingEpisode) runIntroDetection(session, false);
}

/**
 * Termina o episódio ouvido: um vizinho vira a referência de comparação do episódio em
 * reprodução. Depois segue para o próximo da fila.
 * @param {CalibracaoAbertura} calibration Calibração.
 * @returns {void}
 */
function finishCalibrationStep(calibration){
  const step = calibration.step;
  if (!step.isPlayingEpisode) {
    const frames = buildIntroFrames(step.frameData);
    let soundFrameCount = 0; frames.forEach(frame => { if (frame !== INTRO_AUDIO_MISSING_FRAME) soundFrameCount++; });
    if (soundFrameCount < INTRO_AUDIO_MIN_STORED_FRAMES) { stopIntroCalibration(); return; }
    useCalibrationReference(calibration.session, frames);
  }
  runNextCalibrationStep();
}

/**
 * Cancela a calibração se o vídeo principal falhar enquanto o auxiliar baixa (o servidor
 * pode ter derrubado a conexão principal).
 */
video.addEventListener('error', () => { if (introCalibration && introCalibration.element) pauseIntroCalibration(); });
