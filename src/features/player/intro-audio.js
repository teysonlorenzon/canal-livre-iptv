'use strict';
/**
 * Detecção da abertura pelo som (estilo "intro skipper"): nos primeiros 6 min de cada episódio,
 * gera uma impressão digital compacta do áudio (um número de 15 bits a cada 0,5 s, com o formato
 * do espectro em 16 bandas) e compara com a de outro episódio da mesma temporada. O maior
 * trecho em comum entre 15 s e 150 s é a abertura, salva com `source:'audio'`.
 *
 * Achada a abertura, o som dela vira o padrão da temporada (impressão digital da abertura e
 * duração): nos episódios seguintes, assim que esse som começa a tocar, o botão "Pular abertura"
 * aparece com o fim calculado pela duração, mesmo que a abertura comece em outro ponto.
 * A calibração em segundo plano (`intro-calibration.js`) adianta isso ouvindo outros episódios.
 *
 * O áudio é lido por `captureStream()`, que não desvia o som do player (diferente de
 * `createMediaElementSource`): se a fonte for de outro domínio sem CORS, a captura é recusada
 * ou fica em silêncio e a detecção desliga só para aquela fonte, sem afetar a reprodução. As
 * plataformas podem servir o vídeo pela origem do app (`mediaUrlForAudioAnalysis`).
 */

/** @type {number} Duração (s) de cada passo da impressão digital. */
const INTRO_AUDIO_FRAME_SECONDS = 0.5;
/** @type {number} Trecho (s) do começo do episódio que é analisado. */
const INTRO_AUDIO_ANALYSIS_SECONDS = 360;
/** @type {number} Quantidade de passos analisados por episódio. */
const INTRO_AUDIO_FRAME_COUNT = INTRO_AUDIO_ANALYSIS_SECONDS / INTRO_AUDIO_FRAME_SECONDS;
/** @type {number} Intervalo (ms) entre as leituras do espectro do vídeo em reprodução. */
const INTRO_AUDIO_SAMPLE_MS = 50;
/** @type {number} Bandas de frequência de cada leitura (geram 15 bits por passo). */
const INTRO_AUDIO_BAND_COUNT = 16;
/** @type {number} Frequência (Hz) da primeira banda. */
const INTRO_AUDIO_LOWEST_HZ = 150;
/** @type {number} Frequência (Hz) do fim da última banda. */
const INTRO_AUDIO_HIGHEST_HZ = 6000;
/** @type {number} Valor que marca um passo sem dado ou em silêncio. */
const INTRO_AUDIO_MISSING_FRAME = 0xFFFF;
/** @type {number} Nível médio (0–255) abaixo do qual o passo é tratado como silêncio. */
const INTRO_AUDIO_SILENT_LEVEL = 6;
/** @type {number} Bits diferentes aceitos para dois passos serem considerados o mesmo som. */
const INTRO_AUDIO_MAX_DIFFERENT_BITS = 3;
/** @type {number} Passos seguidos com som diferente tolerados dentro de um trecho em comum. */
const INTRO_AUDIO_MAX_GAP_FRAMES = 4;
/** @type {number} Passos com som olhados em cada borda do trecho para confirmar que a coincidência é firme. */
const INTRO_AUDIO_EDGE_WINDOW_FRAMES = 4;
/** @type {number} Coincidências mínimas nessa janela para a borda valer. */
const INTRO_AUDIO_EDGE_MIN_MATCHES = 3;
/** @type {number} Fração mínima de passos coincidentes dentro do trecho em comum. */
const INTRO_AUDIO_MIN_MATCH_DENSITY = 0.6;
/** @type {number} Duração (s) mínima de uma abertura detectada. */
const INTRO_AUDIO_MIN_INTRO_SECONDS = 15;
/** @type {number} Duração (s) máxima de uma abertura detectada. */
const INTRO_AUDIO_MAX_INTRO_SECONDS = 150;
/** @type {number} A cada quantos passos novos a comparação com o outro episódio é refeita. */
const INTRO_AUDIO_MATCH_EVERY_FRAMES = 10;
/** @type {number} A cada quantos passos novos o padrão da abertura é procurado. */
const INTRO_AUDIO_PATTERN_EVERY_FRAMES = 2;
/** @type {number} Passos com som do começo do padrão comparados para reconhecer a abertura. */
const INTRO_AUDIO_PATTERN_CHECK_FRAMES = 24;
/** @type {number} Passos com som mínimos comparados para reconhecer a abertura pelo padrão (6 s). */
const INTRO_AUDIO_PATTERN_MIN_FRAMES = 12;
/** @type {number} Fração mínima de passos coincidentes com o padrão. */
const INTRO_AUDIO_PATTERN_MIN_DENSITY = 0.75;
/** @type {number} Segundos que a análise continua depois do fim da abertura achada (para a impressão digital guardar a abertura inteira). */
const INTRO_AUDIO_KEEP_AFTER_INTRO_SECONDS = 5;
/** @type {number} Passos mínimos com som para guardar a impressão digital do episódio. */
const INTRO_AUDIO_MIN_STORED_FRAMES = 60;
/** @type {number} Tempo (ms) tocando com som ligado e captura sempre zerada para concluir que o áudio está bloqueado. */
const INTRO_AUDIO_BLOCKED_AFTER_MS = 8000;
/** @type {number} Temporadas com impressão digital guardada por lista (as mais antigas são descartadas). */
const INTRO_AUDIO_MAX_STORED_SEASONS = 12;

/** @type {boolean} Se a plataforma permite a detecção pelo som. */
let introAudioPlatformAllowed = true;
/** @type {boolean} Se o áudio é lido baixando e decodificando o arquivo (`intro-audio-decode.js`) em vez de capturado do vídeo. */
let introAudioDecodedMode = false;
/** @type {AudioContext|null} Contexto de áudio compartilhado (criado na primeira análise). */
let introAudioContext = null;
/** @type {GainNode|null} Saída muda à qual os analisadores se ligam (o navegador só processa nós ligados à saída). */
let introAudioSilentOutput = null;
/** @type {Array<[number, number]>} Faixas de índices do analisador de cada banda. */
let introAudioBandRangeList = [];
/** @type {Set<string>} Fontes cujo áudio não pode ser lido (outro domínio sem CORS). */
const blockedIntroAudioSources = new Set();

/**
 * URL usada para tocar uma mídia cujo áudio será analisado. As plataformas que conseguem servir
 * o vídeo pela origem do app (proxy do Android, serviço da TV) trocam esta função; sem isso a
 * URL é a original.
 * @param {string} url URL original.
 * @returns {string} URL a tocar.
 */
let mediaUrlForAudioAnalysis = url => url;

/**
 * Leituras do espectro somadas por passo de um episódio.
 * @typedef {Object} LeiturasAudio
 * @property {Float32Array} bandSums Soma dos níveis por passo e banda.
 * @property {Uint16Array} sampleCounts Leituras somadas em cada passo.
 * @property {number} heardFrameCount Passos que já receberam alguma leitura (conta cada passo uma vez).
 */

/**
 * Ouvinte do áudio de um elemento de vídeo (o player ou um vídeo auxiliar da calibração).
 * @typedef {Object} OuvinteAudio
 * @property {HTMLMediaElement} element Vídeo ouvido.
 * @property {AnalyserNode} analyser Analisador de espectro.
 * @property {Uint8Array} levels Níveis lidos (reaproveitado a cada leitura).
 * @property {LeiturasAudio} frameData Onde as leituras são somadas.
 * @property {MediaStream|null} capturedStream Captura do vídeo em uso.
 * @property {MediaStreamAudioSourceNode|null} sourceNode Nó de áudio da captura.
 * @property {number} silentMs Tempo seguido tocando com a captura zerada.
 * @property {boolean} heardAudio Se a captura já trouxe algum som.
 */

/**
 * Análise do áudio do episódio em reprodução.
 * @typedef {Object} AnaliseAudioAbertura
 * @property {Object} media Mídia (`currentMedia`) analisada.
 * @property {string} seasonKey Temporada (`series:<k>:<temporada>`).
 * @property {string} episodeId Id do episódio.
 * @property {string} sourceUrl URL do episódio.
 * @property {LeiturasAudio} frameData Leituras do episódio (do player e da calibração adiantada).
 * @property {OuvinteAudio|null} listener Ouvinte do player (`null` no modo decodificado).
 * @property {Uint16Array|null} previousFrames Impressão digital de outro episódio da temporada.
 * @property {{start: number, end: number}|null} previousIntro Abertura desse outro episódio, no tempo dele (se conhecida).
 * @property {Uint16Array|null} patternFrames Padrão da abertura da temporada (impressão digital só da abertura).
 * @property {number} patternSeconds Duração (s) da abertura do padrão.
 * @property {{start: number, end: number}|null} detectedRange Abertura achada neste episódio, no tempo dele.
 * @property {number} patternCheckedAt Passos ouvidos na última busca pelo padrão.
 * @property {number} compareCheckedAt Passos ouvidos na última comparação com outro episódio.
 * @property {boolean} calibrationStarted Se a calibração em segundo plano já foi iniciada.
 * @property {number} timer Intervalo das leituras (0 = parado).
 */
/** @type {AnaliseAudioAbertura|null} Análise em andamento. */
let introAudioSession = null;

/**
 * Desliga a detecção pelo som nesta plataforma. O aprendizado por temporada continua.
 * @returns {void}
 */
function disableIntroAudioDetection(){ introAudioPlatformAllowed = false; stopIntroAudioSession(false); }

/**
 * Passa a ler o áudio baixando e decodificando o arquivo, sem capturar o vídeo (plataformas em
 * que o som do vídeo não chega ao navegador, como a TV LG). Sem WebCodecs, desliga a detecção.
 * @returns {void}
 */
function useDecodedIntroAnalysis(){ if (isIntroAudioDecodingSupported()) introAudioDecodedMode = true; else disableIntroAudioDetection(); }

/**
 * Indica se o navegador e a plataforma permitem detectar a abertura pelo som.
 * @returns {boolean} `true` se suportado.
 */
const isIntroAudioDetectionSupported = () => introAudioPlatformAllowed && (introAudioDecodedMode ? isIntroAudioDecodingSupported() : typeof video.captureStream === 'function' && !!(window.AudioContext || window.webkitAudioContext));

/**
 * Indica se a detecção pelo som está ligada (suportada e não desligada nas Configurações).
 * @returns {boolean} `true` se ligada.
 */
const isIntroAudioDetectionEnabled = () => isIntroAudioDetectionSupported() && options.introAudio !== '0';

/**
 * Chave de armazenamento das impressões digitais da lista ativa.
 * @returns {string} Chave no formato `fp_<id>`.
 */
const introPrintsKey = () => 'fp_' + activePlaylist.id;

/**
 * Impressões digitais guardadas da lista ativa.
 * @typedef {Object} ImpressoesAbertura
 * @property {string[]} order Temporadas, a mais recente primeiro.
 * @property {Object<string, {ep: string, frames: string, intro: ?{start: number, end: number}, pattern: ?{frames: string, seconds: number}}>} prints
 *   Por temporada: o último episódio analisado, a abertura dele (no tempo dele), se conhecida, e o padrão da abertura.
 * @property {number} [calibrationPausedUntil] Até quando (timestamp em ms) a calibração em segundo plano fica pausada nesta lista.
 */

/**
 * Impressões digitais guardadas da lista ativa.
 * @returns {ImpressoesAbertura} Impressões.
 */
function loadIntroPrints(){
  const savedPrints = activePlaylist ? store.get(introPrintsKey(), null) : null;
  return savedPrints && Array.isArray(savedPrints.order) && savedPrints.prints ? savedPrints : { order:[], prints:{} };
}

/**
 * Grava as impressões digitais, mantendo no máximo 12 temporadas (a temporada dada vira a mais recente).
 * @param {ImpressoesAbertura} savedPrints Impressões.
 * @param {string} seasonKey Temporada alterada.
 * @returns {void}
 */
function saveIntroPrints(savedPrints, seasonKey){
  savedPrints.order = [seasonKey, ...savedPrints.order.filter(storedKey => storedKey !== seasonKey)].slice(0, INTRO_AUDIO_MAX_STORED_SEASONS);
  Object.keys(savedPrints.prints).forEach(storedKey => { if (!savedPrints.order.includes(storedKey)) delete savedPrints.prints[storedKey]; });
  store.set(introPrintsKey(), savedPrints);
}

/**
 * Apaga as impressões digitais da lista ativa e descarta a análise em andamento.
 * @returns {void}
 */
function forgetIntroPrints(){ stopIntroAudioSession(false); if (activePlaylist) store.del(introPrintsKey()); }

/**
 * Converte a impressão digital em texto (4 dígitos hexadecimais por passo).
 * @param {Uint16Array} frames Passos.
 * @returns {string} Texto sem os passos vazios do fim.
 */
function encodeIntroFrames(frames){
  let lastFrameIndex = frames.length - 1;
  while (lastFrameIndex >= 0 && frames[lastFrameIndex] === INTRO_AUDIO_MISSING_FRAME) lastFrameIndex--;
  let encodedText = '';
  for (let frameIndex = 0; frameIndex <= lastFrameIndex; frameIndex++) encodedText += ('000' + frames[frameIndex].toString(16)).slice(-4);
  return encodedText;
}

/**
 * Lê a impressão digital salva em texto.
 * @param {string} encodedText Texto de `encodeIntroFrames`.
 * @returns {Uint16Array} Passos (os que faltam ficam vazios).
 */
function decodeIntroFrames(encodedText){
  const frames = new Uint16Array(INTRO_AUDIO_FRAME_COUNT).fill(INTRO_AUDIO_MISSING_FRAME);
  const frameTotal = Math.min(INTRO_AUDIO_FRAME_COUNT, Math.floor((encodedText || '').length / 4));
  for (let frameIndex = 0; frameIndex < frameTotal; frameIndex++) frames[frameIndex] = parseInt(encodedText.substr(frameIndex * 4, 4), 16);
  return frames;
}

/**
 * Guarda a impressão digital do episódio como a mais recente da temporada (o padrão da
 * abertura da temporada é mantido).
 * @param {string} seasonKey Temporada.
 * @param {string} episodeId Id do episódio.
 * @param {Uint16Array} frames Passos.
 * @param {{start: number, end: number}|null} episodeIntro Abertura deste episódio (no tempo dele), se conhecida.
 * @returns {void}
 */
function storeIntroPrint(seasonKey, episodeId, frames, episodeIntro){
  if (!activePlaylist) return;
  const savedPrints = loadIntroPrints(), previousPrint = savedPrints.prints[seasonKey];
  savedPrints.prints[seasonKey] = { ep:episodeId, frames:encodeIntroFrames(frames), intro: episodeIntro ? { start:episodeIntro.start, end:episodeIntro.end } : null, pattern: previousPrint && previousPrint.pattern || null };
  saveIntroPrints(savedPrints, seasonKey);
}

/**
 * Guarda o padrão da abertura da temporada: a impressão digital só do trecho da abertura e a
 * duração dela.
 * @param {string} seasonKey Temporada.
 * @param {Uint16Array} frames Passos do episódio em que a abertura foi achada.
 * @param {{start: number, end: number}} introRange Abertura nesse episódio.
 * @returns {void}
 */
function storeIntroPattern(seasonKey, frames, introRange){
  if (!activePlaylist) return;
  const firstFrame = Math.max(0, Math.round(introRange.start / INTRO_AUDIO_FRAME_SECONDS));
  const lastFrame = Math.min(frames.length - 1, Math.round(introRange.end / INTRO_AUDIO_FRAME_SECONDS) - 1);
  if (lastFrame - firstFrame + 1 < INTRO_AUDIO_PATTERN_CHECK_FRAMES) return;
  const savedPrints = loadIntroPrints();
  const seasonPrint = savedPrints.prints[seasonKey] || { ep:'', frames:'', intro:null };
  seasonPrint.pattern = { frames:encodeIntroFrames(frames.subarray(firstFrame, lastFrame + 1)), seconds:Math.round((introRange.end - introRange.start) * 10) / 10 };
  savedPrints.prints[seasonKey] = seasonPrint;
  saveIntroPrints(savedPrints, seasonKey);
}

/**
 * Padrão da abertura guardado para a temporada.
 * @param {string} seasonKey Temporada.
 * @returns {{frames: Uint16Array, seconds: number}|null} Padrão, ou `null` se a temporada ainda não foi calibrada.
 */
function introPatternFor(seasonKey){
  const seasonPrint = loadIntroPrints().prints[seasonKey], pattern = seasonPrint && seasonPrint.pattern;
  if (!pattern || !pattern.frames || !(pattern.seconds > 0)) return null;
  const patternFrames = decodeIntroFrames(pattern.frames).subarray(0, Math.floor(pattern.frames.length / 4));
  return { frames:patternFrames, seconds:pattern.seconds };
}

/**
 * Faixas do analisador (índices de início e fim) de cada banda, em escala logarítmica.
 * @param {AnalyserNode} analyser Analisador.
 * @returns {Array<[number, number]>} Faixas de índices.
 */
function introAudioBandRanges(analyser){
  const hertzPerBin = analyser.context.sampleRate / analyser.fftSize, bandRanges = [];
  const frequencyRatio = Math.pow(INTRO_AUDIO_HIGHEST_HZ / INTRO_AUDIO_LOWEST_HZ, 1 / INTRO_AUDIO_BAND_COUNT);
  for (let bandIndex = 0; bandIndex < INTRO_AUDIO_BAND_COUNT; bandIndex++) {
    const firstBin = Math.floor(INTRO_AUDIO_LOWEST_HZ * Math.pow(frequencyRatio, bandIndex) / hertzPerBin);
    const lastBin = Math.max(firstBin + 1, Math.floor(INTRO_AUDIO_LOWEST_HZ * Math.pow(frequencyRatio, bandIndex + 1) / hertzPerBin));
    bandRanges.push([firstBin, lastBin]);
  }
  return bandRanges;
}

/**
 * Cria (uma vez) o contexto de áudio e a saída muda dos analisadores. O som dos vídeos
 * continua saindo pelos próprios vídeos.
 * @returns {boolean} `true` se o contexto está pronto.
 */
function ensureIntroAudioContext(){
  if (introAudioContext) return true;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    introAudioContext = new AudioContextClass();
    introAudioSilentOutput = introAudioContext.createGain(); introAudioSilentOutput.gain.value = 0;
    introAudioSilentOutput.connect(introAudioContext.destination);
    return true;
  } catch { introAudioPlatformAllowed = false; return false; }
}

/**
 * Retoma o contexto de áudio se o navegador o deixou suspenso (precisa de um gesto do usuário).
 * @returns {void}
 */
function resumeIntroAudioContext(){ if (introAudioContext && introAudioContext.state === 'suspended') introAudioContext.resume().catch(() => {}); }
['click', 'keydown', 'touchend'].forEach(eventName => document.addEventListener(eventName, resumeIntroAudioContext, { passive:true }));

/**
 * Cria leituras vazias para um episódio.
 * @returns {LeiturasAudio} Leituras.
 */
const createIntroFrameData = () => ({ bandSums:new Float32Array(INTRO_AUDIO_FRAME_COUNT * INTRO_AUDIO_BAND_COUNT), sampleCounts:new Uint16Array(INTRO_AUDIO_FRAME_COUNT), heardFrameCount:0 });

/**
 * Cria um ouvinte para o áudio de um vídeo, com o próprio analisador.
 * @param {HTMLMediaElement} element Vídeo.
 * @param {LeiturasAudio} frameData Onde somar as leituras.
 * @returns {OuvinteAudio|null} Ouvinte, ou `null` se não há contexto de áudio.
 */
function createIntroAudioListener(element, frameData){
  if (!ensureIntroAudioContext()) return null;
  const analyser = introAudioContext.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0;
  analyser.connect(introAudioSilentOutput);
  if (!introAudioBandRangeList.length) introAudioBandRangeList = introAudioBandRanges(analyser);
  return { element, analyser, levels:new Uint8Array(analyser.frequencyBinCount), frameData, capturedStream:null, sourceNode:null, silentMs:0, heardAudio:false };
}

/**
 * Solta a captura do vídeo (nó de áudio e faixas). O ouvinte pode capturar de novo depois.
 * @param {OuvinteAudio} listener Ouvinte.
 * @returns {void}
 */
function releaseIntroAudioCapture(listener){
  if (listener.sourceNode) { try { listener.sourceNode.disconnect(); } catch {} listener.sourceNode = null; }
  if (listener.capturedStream) { listener.capturedStream.getTracks().forEach(track => track.stop()); listener.capturedStream = null; }
}

/**
 * Descarta o ouvinte (captura e analisador).
 * @param {OuvinteAudio} listener Ouvinte.
 * @returns {void}
 */
function disposeIntroAudioListener(listener){ releaseIntroAudioCapture(listener); try { listener.analyser.disconnect(); } catch {} }

/**
 * Captura o áudio do vídeo para o analisador do ouvinte (de novo a cada troca de fonte).
 * @param {OuvinteAudio} listener Ouvinte.
 * @returns {boolean} `false` se o navegador recusou a captura (fonte de outro domínio).
 */
function attachIntroAudioCapture(listener){
  if (listener.sourceNode) return true;
  try {
    if (!listener.capturedStream) listener.capturedStream = listener.element.captureStream();
    const audioTracks = listener.capturedStream.getAudioTracks(); if (!audioTracks.length) return true;
    listener.sourceNode = introAudioContext.createMediaStreamSource(new MediaStream([audioTracks[0]]));
    listener.sourceNode.connect(listener.analyser);
    return true;
  } catch { return false; }
}

/**
 * Lê o espectro uma vez e soma as bandas no passo da posição atual do vídeo do ouvinte.
 * Também percebe o áudio bloqueado: captura recusada, ou sempre zerada por 8 s tocando.
 * @param {OuvinteAudio} listener Ouvinte.
 * @param {number} elapsedMs Tempo (ms) desde a leitura anterior.
 * @param {boolean} countsSilence Se a captura zerada conta como possível bloqueio (som ligado ou vídeo auxiliar).
 * @returns {'sampled'|'idle'|'blocked'} Resultado da leitura.
 */
function sampleIntroAudioListener(listener, elapsedMs, countsSilence){
  const element = listener.element;
  if (element.paused || element.seeking || element.readyState < 3 || introAudioContext.state !== 'running') return 'idle';
  if (!attachIntroAudioCapture(listener)) return 'blocked';
  const levels = listener.levels;
  if (listener.sourceNode) listener.analyser.getByteFrequencyData(levels); else levels.fill(0);
  let loudestLevel = 0; for (let binIndex = 0; binIndex < levels.length; binIndex++) if (levels[binIndex] > loudestLevel) loudestLevel = levels[binIndex];
  if (loudestLevel === 0) {
    if (countsSilence) listener.silentMs += elapsedMs;
    return !listener.heardAudio && listener.silentMs >= INTRO_AUDIO_BLOCKED_AFTER_MS ? 'blocked' : 'idle';
  }
  listener.silentMs = 0; listener.heardAudio = true;
  return addIntroAudioLevels(listener.frameData, element.currentTime, levels, introAudioBandRangeList) ? 'sampled' : 'idle';
}

/**
 * Soma uma leitura do espectro nas bandas do passo da posição dada.
 * @param {LeiturasAudio} frameData Onde somar.
 * @param {number} position Posição (s) da leitura no episódio.
 * @param {Uint8Array} levels Níveis (0–255) por faixa de frequência.
 * @param {Array<[number, number]>} bandRanges Faixas de cada banda.
 * @returns {boolean} `false` se a posição está fora do trecho analisado.
 */
function addIntroAudioLevels(frameData, position, levels, bandRanges){
  const frameIndex = Math.floor(position / INTRO_AUDIO_FRAME_SECONDS); if (frameIndex < 0 || frameIndex >= INTRO_AUDIO_FRAME_COUNT) return false;
  if (frameData.sampleCounts[frameIndex] === 0) frameData.heardFrameCount++;
  bandRanges.forEach(([firstBin, lastBin], bandIndex) => {
    let levelSum = 0; for (let binIndex = firstBin; binIndex < lastBin; binIndex++) levelSum += levels[binIndex];
    frameData.bandSums[frameIndex * INTRO_AUDIO_BAND_COUNT + bandIndex] += levelSum / (lastBin - firstBin);
  });
  frameData.sampleCounts[frameIndex]++;
  return true;
}

/**
 * Monta a impressão digital: cada passo usa 1 s de som (o próprio passo e o seguinte), o que
 * tolera o desalinhamento entre episódios, e vira 15 bits dizendo se cada banda é mais forte
 * que a seguinte. Passos sem leitura ou em silêncio ficam vazios.
 * @param {LeiturasAudio} frameData Leituras somadas do episódio.
 * @returns {Uint16Array} Passos.
 */
function buildIntroFrames(frameData){
  const frames = new Uint16Array(INTRO_AUDIO_FRAME_COUNT).fill(INTRO_AUDIO_MISSING_FRAME);
  const bandLevels = new Float32Array(INTRO_AUDIO_BAND_COUNT);
  for (let frameIndex = 0; frameIndex < INTRO_AUDIO_FRAME_COUNT; frameIndex++) {
    const neighbourIndex = Math.min(frameIndex + 1, INTRO_AUDIO_FRAME_COUNT - 1);
    const sampleTotal = frameData.sampleCounts[frameIndex] + (neighbourIndex !== frameIndex ? frameData.sampleCounts[neighbourIndex] : 0);
    if (!sampleTotal) continue;
    let levelTotal = 0;
    for (let bandIndex = 0; bandIndex < INTRO_AUDIO_BAND_COUNT; bandIndex++) {
      const neighbourSum = neighbourIndex !== frameIndex ? frameData.bandSums[neighbourIndex * INTRO_AUDIO_BAND_COUNT + bandIndex] : 0;
      bandLevels[bandIndex] = (frameData.bandSums[frameIndex * INTRO_AUDIO_BAND_COUNT + bandIndex] + neighbourSum) / sampleTotal;
      levelTotal += bandLevels[bandIndex];
    }
    if (levelTotal / INTRO_AUDIO_BAND_COUNT < INTRO_AUDIO_SILENT_LEVEL) continue;
    let frameBits = 0;
    for (let bandIndex = 0; bandIndex < INTRO_AUDIO_BAND_COUNT - 1; bandIndex++) if (bandLevels[bandIndex] > bandLevels[bandIndex + 1]) frameBits |= 1 << bandIndex;
    frames[frameIndex] = frameBits;
  }
  return frames;
}

/**
 * Quantidade de bits diferentes entre dois passos.
 * @param {number} firstFrame Passo.
 * @param {number} secondFrame Outro passo.
 * @returns {number} Bits diferentes.
 */
function countDifferentBits(firstFrame, secondFrame){ let differentBits = firstFrame ^ secondFrame, bitCount = 0; while (differentBits) { differentBits &= differentBits - 1; bitCount++; } return bitCount; }

/**
 * Trecho de som em comum entre dois episódios.
 * @typedef {Object} TrechoEmComum
 * @property {number} firstFrame Primeiro passo coincidente (episódio atual).
 * @property {number} lastFrame Último passo coincidente (episódio atual).
 * @property {number} frameShift Deslocamento: passo atual = passo anterior + deslocamento.
 * @property {boolean} closed Se o trecho já terminou antes do último passo lido.
 */

/**
 * Procura o maior trecho de som em comum entre o episódio atual e o anterior, testando todos
 * os deslocamentos entre eles. Um trecho tolera até 4 passos seguidos diferentes e passos sem
 * leitura (página em segundo plano), e precisa ter 15–150 s com maioria de passos coincidentes.
 * @param {Uint16Array} currentFrames Passos do episódio atual.
 * @param {Uint16Array} previousFrames Passos do episódio anterior.
 * @returns {TrechoEmComum|null} Melhor trecho, ou `null` se não houver.
 */
function findSharedAudioRun(currentFrames, previousFrames){
  let lastCurrentFrame = currentFrames.length - 1;
  while (lastCurrentFrame >= 0 && currentFrames[lastCurrentFrame] === INTRO_AUDIO_MISSING_FRAME) lastCurrentFrame--;
  const minFrames = INTRO_AUDIO_MIN_INTRO_SECONDS / INTRO_AUDIO_FRAME_SECONDS, maxFrames = INTRO_AUDIO_MAX_INTRO_SECONDS / INTRO_AUDIO_FRAME_SECONDS;
  let bestRun = null, bestMatchCount = 0;
  /**
   * Avalia um trecho de coincidências e guarda o melhor.
   * @param {number} firstFrame Primeiro passo coincidente (episódio atual).
   * @param {number} lastFrame Último passo coincidente.
   * @param {number} matchCount Passos coincidentes no trecho.
   * @param {number} comparedCount Passos do trecho com som nos dois episódios (os sem leitura não contam).
   * @param {number} frameShift Deslocamento entre os episódios.
   * @returns {void}
   */
  const considerRun = (firstFrame, lastFrame, matchCount, comparedCount, frameShift) => {
    const runLength = lastFrame - firstFrame + 1;
    if (runLength < minFrames || runLength > maxFrames || matchCount / comparedCount < INTRO_AUDIO_MIN_MATCH_DENSITY || matchCount <= bestMatchCount) return;
    bestMatchCount = matchCount;
    bestRun = { firstFrame, lastFrame, frameShift, closed: lastFrame < lastCurrentFrame - INTRO_AUDIO_MAX_GAP_FRAMES - 1 };
  };
  for (let frameShift = -(previousFrames.length - 1); frameShift < currentFrames.length; frameShift++) {
    let runFirstFrame = -1, runLastFrame = -1, runMatchCount = 0, runComparedCount = 0, mismatchStreak = 0;
    const firstIndex = Math.max(0, frameShift), lastIndex = Math.min(lastCurrentFrame, previousFrames.length - 1 + frameShift);
    for (let currentIndex = firstIndex; currentIndex <= lastIndex; currentIndex++) {
      const currentFrame = currentFrames[currentIndex], previousFrame = previousFrames[currentIndex - frameShift];
      if (currentFrame === INTRO_AUDIO_MISSING_FRAME || previousFrame === INTRO_AUDIO_MISSING_FRAME) continue;
      if (countDifferentBits(currentFrame, previousFrame) > INTRO_AUDIO_MAX_DIFFERENT_BITS) {
        if (runFirstFrame < 0) continue;
        runComparedCount++;
        if (++mismatchStreak > INTRO_AUDIO_MAX_GAP_FRAMES) { considerRun(runFirstFrame, runLastFrame, runMatchCount, runComparedCount - mismatchStreak, frameShift); runFirstFrame = -1; }
        continue;
      }
      if (runFirstFrame < 0) { runFirstFrame = currentIndex; runMatchCount = 0; runComparedCount = 0; }
      runLastFrame = currentIndex; runMatchCount++; runComparedCount++; mismatchStreak = 0;
    }
    if (runFirstFrame >= 0) considerRun(runFirstFrame, runLastFrame, runMatchCount, runComparedCount - mismatchStreak, frameShift);
  }
  return bestRun;
}

/**
 * Indica se um passo do episódio atual coincide com o passo correspondente do anterior.
 * @param {Uint16Array} currentFrames Passos do episódio atual.
 * @param {Uint16Array} previousFrames Passos do episódio anterior.
 * @param {number} currentIndex Passo do episódio atual.
 * @param {number} frameShift Deslocamento entre os episódios.
 * @returns {boolean|null} `true`/`false`, ou `null` se algum dos dois não tem som.
 */
function framesMatchAt(currentFrames, previousFrames, currentIndex, frameShift){
  const previousIndex = currentIndex - frameShift;
  if (previousIndex < 0 || previousIndex >= previousFrames.length) return null;
  const currentFrame = currentFrames[currentIndex], previousFrame = previousFrames[previousIndex];
  if (currentFrame === INTRO_AUDIO_MISSING_FRAME || previousFrame === INTRO_AUDIO_MISSING_FRAME) return null;
  return countDifferentBits(currentFrame, previousFrame) <= INTRO_AUDIO_MAX_DIFFERENT_BITS;
}

/**
 * Indica se a borda do trecho é firme: dos próximos 4 passos com som (na direção dada), ao
 * menos 3 coincidem. Evita que coincidências soltas antes ou depois da abertura a alonguem.
 * @param {Uint16Array} currentFrames Passos do episódio atual.
 * @param {Uint16Array} previousFrames Passos do episódio anterior.
 * @param {number} edgeIndex Passo candidato a borda.
 * @param {number} frameShift Deslocamento entre os episódios.
 * @param {number} direction 1 para a borda inicial (olha para frente), -1 para a final.
 * @param {number} limitIndex Passo até onde olhar.
 * @returns {boolean} `true` se a borda é firme.
 */
function isSolidRunEdge(currentFrames, previousFrames, edgeIndex, frameShift, direction, limitIndex){
  let comparedCount = 0, matchCount = 0;
  for (let frameIndex = edgeIndex; comparedCount < INTRO_AUDIO_EDGE_WINDOW_FRAMES && (direction > 0 ? frameIndex <= limitIndex : frameIndex >= limitIndex); frameIndex += direction) {
    const isMatch = framesMatchAt(currentFrames, previousFrames, frameIndex, frameShift);
    if (isMatch === null) continue;
    comparedCount++; if (isMatch) matchCount++;
  }
  return matchCount >= Math.min(INTRO_AUDIO_EDGE_MIN_MATCHES, comparedCount);
}

/**
 * Apara as bordas do trecho em comum até começarem e terminarem em coincidências firmes.
 * @param {Uint16Array} currentFrames Passos do episódio atual.
 * @param {Uint16Array} previousFrames Passos do episódio anterior.
 * @param {TrechoEmComum} sharedRun Trecho em comum.
 * @returns {TrechoEmComum} Trecho aparado.
 */
function trimSharedRun(currentFrames, previousFrames, sharedRun){
  let firstFrame = sharedRun.firstFrame, lastFrame = sharedRun.lastFrame;
  const isEdgeMatch = frameIndex => framesMatchAt(currentFrames, previousFrames, frameIndex, sharedRun.frameShift) === true;
  while (firstFrame < lastFrame && !(isEdgeMatch(firstFrame) && isSolidRunEdge(currentFrames, previousFrames, firstFrame, sharedRun.frameShift, 1, lastFrame))) firstFrame++;
  while (lastFrame > firstFrame && !(isEdgeMatch(lastFrame) && isSolidRunEdge(currentFrames, previousFrames, lastFrame, sharedRun.frameShift, -1, firstFrame))) lastFrame--;
  return Object.assign({}, sharedRun, { firstFrame, lastFrame });
}

/**
 * Converte o trecho em comum na abertura do episódio atual. Se a abertura do episódio
 * anterior é conhecida, basta o começo do trecho (já com 15 s) para projetá-la pelo
 * deslocamento: assim o botão aparece ainda durante a abertura, mesmo que ela comece em
 * outro ponto (cena antes da abertura). Sem isso, espera o trecho terminar.
 * @param {TrechoEmComum} sharedRun Trecho em comum.
 * @param {{start: number, end: number}|null} previousIntro Abertura do episódio anterior.
 * @param {boolean} isFinal Se é a última comparação (aceita trecho que vai até o fim do que foi lido).
 * @returns {{start: number, end: number}|null} Abertura no tempo do episódio atual.
 */
function introFromSharedRun(sharedRun, previousIntro, isFinal){
  const runStart = sharedRun.firstFrame * INTRO_AUDIO_FRAME_SECONDS, runEnd = (sharedRun.lastFrame + 1) * INTRO_AUDIO_FRAME_SECONDS;
  if (previousIntro) {
    const shiftSeconds = sharedRun.frameShift * INTRO_AUDIO_FRAME_SECONDS;
    const projectedStart = previousIntro.start + shiftSeconds, projectedEnd = previousIntro.end + shiftSeconds;
    if (projectedStart >= 0 && projectedStart < runEnd && projectedEnd > runStart) return { start:projectedStart, end:projectedEnd };
  }
  return sharedRun.closed || isFinal ? { start:runStart, end:runEnd } : null;
}

/**
 * Procura no episódio o começo do padrão da abertura da temporada: o ponto em que os primeiros
 * passos com som do padrão (até 24) coincidem em pelo menos 75%, com ao menos 12 comparados.
 * @param {Uint16Array} currentFrames Passos do episódio.
 * @param {Uint16Array} patternFrames Padrão da abertura.
 * @returns {number} Passo em que a abertura começa no episódio, ou -1 se não foi reconhecida.
 */
function findIntroPatternStart(currentFrames, patternFrames){
  let bestStartFrame = -1, bestMatchCount = 0;
  for (let startFrame = 0; startFrame < currentFrames.length; startFrame++) {
    let comparedCount = 0, matchCount = 0;
    for (let patternIndex = 0; patternIndex < patternFrames.length && comparedCount < INTRO_AUDIO_PATTERN_CHECK_FRAMES; patternIndex++) {
      const currentIndex = startFrame + patternIndex; if (currentIndex >= currentFrames.length) break;
      const currentFrame = currentFrames[currentIndex], patternFrame = patternFrames[patternIndex];
      if (currentFrame === INTRO_AUDIO_MISSING_FRAME || patternFrame === INTRO_AUDIO_MISSING_FRAME) continue;
      comparedCount++; if (countDifferentBits(currentFrame, patternFrame) <= INTRO_AUDIO_MAX_DIFFERENT_BITS) matchCount++;
    }
    if (comparedCount >= INTRO_AUDIO_PATTERN_MIN_FRAMES && matchCount / comparedCount >= INTRO_AUDIO_PATTERN_MIN_DENSITY && matchCount > bestMatchCount) { bestMatchCount = matchCount; bestStartFrame = startFrame; }
  }
  return bestStartFrame;
}

/**
 * Salva a abertura achada neste episódio para a temporada (se o usuário não ensinou outra).
 * @param {AnaliseAudioAbertura} session Análise.
 * @param {{start: number, end: number}} detectedRange Abertura no tempo do episódio.
 * @returns {void}
 */
function applyDetectedIntro(session, detectedRange){
  session.detectedRange = detectedRange;
  saveDetectedIntroRange(session.seasonKey, detectedRange.start, detectedRange.end);
}

/**
 * Reconhece a abertura pelo padrão da temporada: o fim vem da duração do padrão.
 * @param {AnaliseAudioAbertura} session Análise.
 * @param {Uint16Array} currentFrames Passos do episódio.
 * @returns {boolean} `true` se achou.
 */
function detectIntroFromPattern(session, currentFrames){
  const startFrame = findIntroPatternStart(currentFrames, session.patternFrames); if (startFrame < 0) return false;
  const start = startFrame * INTRO_AUDIO_FRAME_SECONDS;
  applyDetectedIntro(session, { start, end:start + session.patternSeconds });
  return true;
}

/**
 * Compara o episódio com outro da temporada e, achando a abertura, salva o trecho para a
 * temporada e o som dela como o padrão da temporada.
 * @param {AnaliseAudioAbertura} session Análise.
 * @param {Uint16Array} currentFrames Passos do episódio.
 * @param {boolean} isFinal Se é a última comparação.
 * @returns {void}
 */
function detectIntroFromSharedRun(session, currentFrames, isFinal){
  const untrimmedRun = findSharedAudioRun(currentFrames, session.previousFrames); if (!untrimmedRun) return;
  const sharedRun = trimSharedRun(currentFrames, session.previousFrames, untrimmedRun);
  if ((sharedRun.lastFrame - sharedRun.firstFrame + 1) * INTRO_AUDIO_FRAME_SECONDS < INTRO_AUDIO_MIN_INTRO_SECONDS) return;
  const detectedRange = introFromSharedRun(sharedRun, session.previousIntro, isFinal); if (!detectedRange) return;
  applyDetectedIntro(session, detectedRange);
  storeIntroPattern(session.seasonKey, currentFrames, detectedRange);
}

/**
 * Procura a abertura no que já foi ouvido do episódio: primeiro pelo padrão da temporada
 * (a cada 1 s novo de som), depois comparando com outro episódio (a cada 5 s novos).
 * A análise continua até 5 s depois do fim dela, para a impressão digital guardar a abertura inteira.
 * @param {AnaliseAudioAbertura} session Análise.
 * @param {boolean} isFinal Se é a última comparação.
 * @returns {void}
 */
function runIntroDetection(session, isFinal){
  if (session.detectedRange) return;
  const heardFrameCount = session.frameData.heardFrameCount;
  const isPatternDue = !!session.patternFrames && (isFinal || heardFrameCount - session.patternCheckedAt >= INTRO_AUDIO_PATTERN_EVERY_FRAMES);
  const isCompareDue = !!session.previousFrames && (isFinal || heardFrameCount - session.compareCheckedAt >= INTRO_AUDIO_MATCH_EVERY_FRAMES);
  if (!isPatternDue && !isCompareDue) return;
  const currentFrames = buildIntroFrames(session.frameData);
  if (isPatternDue) { session.patternCheckedAt = heardFrameCount; if (detectIntroFromPattern(session, currentFrames)) return; }
  if (isCompareDue) { session.compareCheckedAt = heardFrameCount; detectIntroFromSharedRun(session, currentFrames, isFinal); }
}

/**
 * Indica se a abertura deste episódio ainda está sendo procurada pelo padrão da temporada.
 * Enquanto isso, o botão não usa o trecho do episódio anterior (o início pode variar).
 * @returns {boolean} `true` se a busca pelo padrão está em andamento.
 */
const isIntroPatternSearchPending = () => !!(introAudioSession && introAudioSession.media === currentMedia && introAudioSession.patternFrames && !introAudioSession.detectedRange);

/**
 * Marca a fonte como bloqueada (áudio ilegível) e encerra a análise sem guardar nada.
 * @param {AnaliseAudioAbertura} session Análise.
 * @returns {void}
 */
function markIntroAudioBlocked(session){ blockedIntroAudioSources.add(session.sourceUrl); stopIntroAudioSession(false); }

/**
 * Lê o áudio do player e procura a abertura; a calibração em segundo plano só começa depois
 * que o áudio do player foi lido (onde ele é bloqueado, não abre a segunda conexão). Encerra ao passar dos 6 min, ao passar do fim da
 * abertura achada ou se o usuário ensinou a abertura da temporada.
 * @param {AnaliseAudioAbertura} session Análise.
 * @returns {void}
 */
function sampleIntroAudio(session){
  if (session !== introAudioSession || currentMedia !== session.media) return;
  const seasonRange = introRangeFor(session.seasonKey), detectedRange = session.detectedRange;
  const isPastDetectedIntro = detectedRange && video.currentTime > detectedRange.end + INTRO_AUDIO_KEEP_AFTER_INTRO_SECONDS;
  if (isPastDetectedIntro || video.currentTime >= INTRO_AUDIO_ANALYSIS_SECONDS || (seasonRange && seasonRange.source === 'user')) { stopIntroAudioSession(true); return; }
  if (!session.listener) { runIntroDetection(session, false); return; }
  const sampleResult = sampleIntroAudioListener(session.listener, INTRO_AUDIO_SAMPLE_MS, !video.muted && video.volume > 0);
  if (sampleResult === 'blocked') { markIntroAudioBlocked(session); return; }
  if (sampleResult === 'sampled' && !session.calibrationStarted) { session.calibrationStarted = true; startIntroCalibration(session); }
  runIntroDetection(session, false);
}

/**
 * Usa a impressão digital de outro episódio da temporada, ouvido pela calibração, como
 * referência de comparação (se a análise ainda não tem uma).
 * @param {AnaliseAudioAbertura} session Análise.
 * @param {Uint16Array} frames Passos do outro episódio.
 * @returns {void}
 */
function useCalibrationReference(session, frames){
  if (session !== introAudioSession || session.previousFrames) return;
  session.previousFrames = frames; session.previousIntro = null;
  session.compareCheckedAt = -INTRO_AUDIO_MATCH_EVERY_FRAMES;
  runIntroDetection(session, false);
}

/**
 * Encerra a análise em andamento (e a calibração em segundo plano), guardando (se pedido) a
 * impressão digital do episódio como a mais recente da temporada e o som da abertura achada
 * como o padrão da temporada.
 * @param {boolean} keepPrint Se guarda a impressão digital.
 * @returns {void}
 */
function stopIntroAudioSession(keepPrint){
  const session = introAudioSession; if (!session) return;
  introAudioSession = null;
  clearInterval(session.timer); session.timer = 0;
  stopIntroCalibration();
  if (session.listener) disposeIntroAudioListener(session.listener);
  if (!keepPrint) return;
  runIntroDetection(session, true);
  const frames = buildIntroFrames(session.frameData);
  let soundFrameCount = 0; frames.forEach(frame => { if (frame !== INTRO_AUDIO_MISSING_FRAME) soundFrameCount++; });
  if (soundFrameCount < INTRO_AUDIO_MIN_STORED_FRAMES) return;
  const episodeIntro = session.detectedRange || userIntroOfEpisode(session);
  storeIntroPrint(session.seasonKey, session.episodeId, frames, episodeIntro);
  if (episodeIntro && !session.patternFrames) storeIntroPattern(session.seasonKey, frames, episodeIntro);
}

/**
 * Abertura ensinada pelo usuário durante este episódio (pulo ou avanço manual), no tempo dele.
 * @param {AnaliseAudioAbertura} session Análise.
 * @returns {{start: number, end: number}|null} Abertura, ou `null`.
 */
function userIntroOfEpisode(session){
  if (skipIntroState.media !== session.media || !skipIntroState.learnedFromBehavior) return null;
  const seasonRange = introRangeFor(session.seasonKey);
  return seasonRange && seasonRange.source === 'user' ? seasonRange : null;
}

/**
 * Começa (ou retoma, depois de uma troca de fonte do mesmo episódio) a análise do som quando
 * um episódio começa a tocar, se a temporada não tem uma abertura ensinada pelo usuário.
 * Com o padrão da temporada, a abertura é reconhecida pelo som dela; sem ele, por comparação
 * com o último episódio ouvido da temporada. A calibração em segundo plano ouve outros
 * episódios (ou este, adiantado) para achar a abertura antes de ela tocar.
 * @returns {void}
 */
function startIntroAudioAnalysis(){
  if (introAudioSession && introAudioSession.media === currentMedia) { if (!introAudioSession.timer) introAudioSession.timer = setInterval(sampleIntroAudio, INTRO_AUDIO_SAMPLE_MS, introAudioSession); return; }
  stopIntroAudioSession(true);
  const seasonKey = playingSeasonKey(), sourceUrl = currentMedia && currentMedia.url;
  const seasonRange = seasonKey ? introRangeFor(seasonKey) : null;
  if (!seasonKey || !isIntroAudioDetectionEnabled() || (seasonRange && seasonRange.source === 'user') || blockedIntroAudioSources.has(sourceUrl)) return;
  if (video.currentTime >= INTRO_AUDIO_ANALYSIS_SECONDS) return;
  const frameData = createIntroFrameData(), listener = introAudioDecodedMode ? null : createIntroAudioListener(video, frameData);
  if (!listener && !introAudioDecodedMode) return;
  resumeIntroAudioContext();
  const episodeId = String(currentMedia.desc.epId || currentMedia.desc.ref), previousPrint = loadIntroPrints().prints[seasonKey], pattern = introPatternFor(seasonKey);
  const hasUsablePreviousPrint = !!(previousPrint && previousPrint.ep !== episodeId && previousPrint.frames);
  introAudioSession = { media:currentMedia, seasonKey, episodeId, sourceUrl, frameData, listener,
    previousFrames: hasUsablePreviousPrint ? decodeIntroFrames(previousPrint.frames) : null,
    previousIntro: hasUsablePreviousPrint && previousPrint.intro ? previousPrint.intro : null,
    patternFrames: pattern ? pattern.frames : null, patternSeconds: pattern ? pattern.seconds : 0,
    patternCheckedAt:0, compareCheckedAt:0, detectedRange:null, calibrationStarted:introAudioDecodedMode, timer:0 };
  introAudioSession.timer = setInterval(sampleIntroAudio, INTRO_AUDIO_SAMPLE_MS, introAudioSession);
  if (introAudioDecodedMode) startIntroCalibration(introAudioSession);
}

/**
 * Quando o vídeo é descarregado: se outro conteúdo assumiu (ou o player fechou), encerra a
 * análise guardando a impressão digital; se é o mesmo episódio trocando de fonte, só solta a
 * captura para refazê-la quando voltar a tocar.
 * @returns {void}
 */
function handleIntroAudioEmptied(){
  const session = introAudioSession; if (!session) return;
  if (currentMedia !== session.media) { stopIntroAudioSession(true); return; }
  clearInterval(session.timer); session.timer = 0;
  if (session.listener) releaseIntroAudioCapture(session.listener);
}

/**
 * Começa ou retoma a análise do som quando o vídeo começa a tocar.
 */
video.addEventListener('playing', startIntroAudioAnalysis);
/**
 * Encerra ou pausa a análise quando o vídeo é trocado ou descarregado.
 */
video.addEventListener('emptied', handleIntroAudioEmptied);
