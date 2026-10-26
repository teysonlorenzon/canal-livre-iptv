'use strict';
/**
 * Detecção da abertura pelo som (estilo "intro skipper"): nos primeiros 6 min de cada episódio,
 * gera uma impressão digital compacta do áudio (um número de 15 bits a cada 0,5 s, com o formato
 * do espectro em 16 bandas) e compara com a do episódio anterior da mesma temporada. O maior
 * trecho em comum entre 15 s e 150 s é a abertura, salva com `source:'audio'`.
 *
 * O áudio é lido por `video.captureStream()`, que não desvia o som do player (diferente de
 * `createMediaElementSource`): se a fonte for de outro domínio sem CORS, a captura é recusada
 * ou fica em silêncio e a detecção desliga só para aquela fonte, sem afetar a reprodução.
 * A TV LG desliga a detecção (`disableIntroAudioDetection` em apps/tv-webos/tv.js).
 */

/** @type {number} Duração (s) de cada passo da impressão digital. */
const INTRO_AUDIO_FRAME_SECONDS = 0.5;
/** @type {number} Trecho (s) do começo do episódio que é analisado. */
const INTRO_AUDIO_ANALYSIS_SECONDS = 360;
/** @type {number} Quantidade de passos analisados por episódio. */
const INTRO_AUDIO_FRAME_COUNT = INTRO_AUDIO_ANALYSIS_SECONDS / INTRO_AUDIO_FRAME_SECONDS;
/** @type {number} Intervalo (ms) entre as leituras do espectro. */
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
/** @type {number} A cada quantos passos novos a comparação com o episódio anterior é refeita. */
const INTRO_AUDIO_MATCH_EVERY_FRAMES = 10;
/** @type {number} Segundos que a análise continua depois do fim da abertura achada (para a impressão digital guardar a abertura inteira). */
const INTRO_AUDIO_KEEP_AFTER_INTRO_SECONDS = 5;
/** @type {number} Passos mínimos com som para guardar a impressão digital do episódio. */
const INTRO_AUDIO_MIN_STORED_FRAMES = 60;
/** @type {number} Tempo (ms) tocando com som ligado e captura sempre zerada para concluir que o áudio está bloqueado. */
const INTRO_AUDIO_BLOCKED_AFTER_MS = 8000;
/** @type {number} Temporadas com impressão digital guardada por lista (as mais antigas são descartadas). */
const INTRO_AUDIO_MAX_STORED_SEASONS = 12;

/** @type {boolean} Se a plataforma permite a detecção pelo som (a TV LG desliga). */
let introAudioPlatformAllowed = true;
/** @type {AudioContext|null} Contexto de áudio compartilhado (criado na primeira análise). */
let introAudioContext = null;
/** @type {AnalyserNode|null} Analisador de espectro ligado à captura do vídeo. */
let introAudioAnalyser = null;
/** @type {Array<[number, number]>} Faixas de índices do analisador de cada banda. */
let introAudioBandRangeList = [];
/** @type {Uint8Array} Níveis lidos do analisador (reaproveitado a cada leitura). */
let introAudioLevels = new Uint8Array(0);
/** @type {Set<string>} Fontes cujo áudio não pode ser lido (outro domínio sem CORS). */
const blockedIntroAudioSources = new Set();

/**
 * Análise do áudio de um episódio.
 * @typedef {Object} AnaliseAudioAbertura
 * @property {Object} media Mídia (`currentMedia`) analisada.
 * @property {string} seasonKey Temporada (`series:<k>:<temporada>`).
 * @property {string} episodeId Id do episódio.
 * @property {string} sourceUrl URL tocada.
 * @property {Float32Array} bandSums Soma dos níveis por passo e banda.
 * @property {Uint16Array} sampleCounts Leituras somadas em cada passo.
 * @property {Uint16Array|null} previousFrames Impressão digital do episódio anterior da temporada.
 * @property {{start: number, end: number}|null} previousIntro Abertura do episódio anterior, no tempo dele (se conhecida).
 * @property {{start: number, end: number}|null} detectedRange Abertura achada neste episódio, no tempo dele.
 * @property {MediaStream|null} capturedStream Captura do vídeo em uso.
 * @property {MediaStreamAudioSourceNode|null} sourceNode Nó de áudio da captura.
 * @property {number} timer Intervalo das leituras (0 = parado).
 * @property {number} silentMs Tempo seguido tocando com a captura zerada.
 * @property {boolean} heardAudio Se a captura já trouxe algum som.
 * @property {number} framesSinceMatch Passos novos desde a última comparação.
 */
/** @type {AnaliseAudioAbertura|null} Análise em andamento. */
let introAudioSession = null;

/**
 * Desliga a detecção pelo som nesta plataforma (usado pela TV LG, cujo decodificador de
 * hardware não deve ter o áudio capturado). O aprendizado por temporada continua.
 * @returns {void}
 */
function disableIntroAudioDetection(){ introAudioPlatformAllowed = false; stopIntroAudioSession(false); }

/**
 * Indica se o navegador e a plataforma permitem detectar a abertura pelo som.
 * @returns {boolean} `true` se suportado.
 */
const isIntroAudioDetectionSupported = () => introAudioPlatformAllowed && typeof video.captureStream === 'function' && !!(window.AudioContext || window.webkitAudioContext);

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
 * @returns {{order: string[], prints: Object<string, {ep: string, frames: string, intro: ?{start: number, end: number}}>}} Temporadas (mais recente primeiro) e impressões, com a abertura de cada episódio guardado (no tempo dele), se conhecida.
 */
function loadIntroPrints(){
  const savedPrints = activePlaylist ? store.get(introPrintsKey(), null) : null;
  return savedPrints && Array.isArray(savedPrints.order) && savedPrints.prints ? savedPrints : { order:[], prints:{} };
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
 * Guarda a impressão digital do episódio como a mais recente da temporada, mantendo no
 * máximo 12 temporadas por lista.
 * @param {string} seasonKey Temporada.
 * @param {string} episodeId Id do episódio.
 * @param {Uint16Array} frames Passos.
 * @param {{start: number, end: number}|null} episodeIntro Abertura deste episódio (no tempo dele), se conhecida.
 * @returns {void}
 */
function storeIntroPrint(seasonKey, episodeId, frames, episodeIntro){
  if (!activePlaylist) return;
  const savedPrints = loadIntroPrints();
  savedPrints.prints[seasonKey] = { ep:episodeId, frames:encodeIntroFrames(frames), intro: episodeIntro ? { start:episodeIntro.start, end:episodeIntro.end } : null };
  savedPrints.order = [seasonKey, ...savedPrints.order.filter(storedKey => storedKey !== seasonKey)].slice(0, INTRO_AUDIO_MAX_STORED_SEASONS);
  Object.keys(savedPrints.prints).forEach(storedKey => { if (!savedPrints.order.includes(storedKey)) delete savedPrints.prints[storedKey]; });
  store.set(introPrintsKey(), savedPrints);
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
 * Cria (uma vez) o contexto de áudio e o analisador. O analisador vai para a saída por um
 * ganho zero, só para o navegador processá-lo; o som do vídeo continua saindo pelo próprio vídeo.
 * @returns {boolean} `true` se o contexto está pronto.
 */
function ensureIntroAudioGraph(){
  if (introAudioAnalyser) return true;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    introAudioContext = new AudioContextClass();
    introAudioAnalyser = introAudioContext.createAnalyser();
    introAudioAnalyser.fftSize = 4096;
    introAudioAnalyser.smoothingTimeConstant = 0;
    const silentOutput = introAudioContext.createGain(); silentOutput.gain.value = 0;
    introAudioAnalyser.connect(silentOutput); silentOutput.connect(introAudioContext.destination);
    introAudioBandRangeList = introAudioBandRanges(introAudioAnalyser);
    introAudioLevels = new Uint8Array(introAudioAnalyser.frequencyBinCount);
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
 * Solta a captura do vídeo (nó de áudio e faixas), sem encerrar a análise.
 * @param {AnaliseAudioAbertura} session Análise.
 * @returns {void}
 */
function releaseIntroAudioCapture(session){
  if (session.sourceNode) { try { session.sourceNode.disconnect(); } catch {} session.sourceNode = null; }
  if (session.capturedStream) { session.capturedStream.getTracks().forEach(track => track.stop()); session.capturedStream = null; }
}

/**
 * Marca a fonte como bloqueada (áudio ilegível) e encerra a análise sem guardar nada.
 * @param {AnaliseAudioAbertura} session Análise.
 * @returns {void}
 */
function markIntroAudioBlocked(session){ blockedIntroAudioSources.add(session.sourceUrl); stopIntroAudioSession(false); }

/**
 * Captura o áudio do vídeo para a análise (de novo a cada troca de fonte). Se o navegador
 * recusar a captura (fonte de outro domínio), a fonte é marcada como bloqueada.
 * @param {AnaliseAudioAbertura} session Análise.
 * @returns {void}
 */
function attachIntroAudioCapture(session){
  if (session.sourceNode) return;
  try {
    if (!session.capturedStream) session.capturedStream = video.captureStream();
    const audioTracks = session.capturedStream.getAudioTracks(); if (!audioTracks.length) return;
    session.sourceNode = introAudioContext.createMediaStreamSource(new MediaStream([audioTracks[0]]));
    session.sourceNode.connect(introAudioAnalyser);
  } catch { markIntroAudioBlocked(session); }
}

/**
 * Lê o espectro uma vez e soma as bandas no passo da posição atual do vídeo. Também percebe
 * o áudio bloqueado: captura sem faixa de áudio ou sempre zerada por 8 s tocando com som ligado.
 * @param {AnaliseAudioAbertura} session Análise.
 * @returns {void}
 */
function sampleIntroAudio(session){
  if (session !== introAudioSession || currentMedia !== session.media) return;
  const seasonRange = introRangeFor(session.seasonKey), detectedRange = session.detectedRange;
  const isPastDetectedIntro = detectedRange && video.currentTime > detectedRange.end + INTRO_AUDIO_KEEP_AFTER_INTRO_SECONDS;
  if (isPastDetectedIntro || video.currentTime >= INTRO_AUDIO_ANALYSIS_SECONDS || (seasonRange && seasonRange.source === 'user')) { stopIntroAudioSession(true); return; }
  if (video.paused || video.seeking || video.readyState < 3 || introAudioContext.state !== 'running') return;
  attachIntroAudioCapture(session); if (session !== introAudioSession) return;
  const levels = introAudioLevels;
  if (session.sourceNode) introAudioAnalyser.getByteFrequencyData(levels); else levels.fill(0);
  let loudestLevel = 0; for (let binIndex = 0; binIndex < levels.length; binIndex++) if (levels[binIndex] > loudestLevel) loudestLevel = levels[binIndex];
  const isSoundOn = !video.muted && video.volume > 0;
  if (loudestLevel === 0) {
    if (isSoundOn) session.silentMs += INTRO_AUDIO_SAMPLE_MS;
    if (!session.heardAudio && session.silentMs >= INTRO_AUDIO_BLOCKED_AFTER_MS) markIntroAudioBlocked(session);
    return;
  }
  session.silentMs = 0; session.heardAudio = true;
  const frameIndex = Math.floor(video.currentTime / INTRO_AUDIO_FRAME_SECONDS);
  if (session.sampleCounts[frameIndex] === 0) session.framesSinceMatch++;
  introAudioBandRangeList.forEach(([firstBin, lastBin], bandIndex) => {
    let levelSum = 0; for (let binIndex = firstBin; binIndex < lastBin; binIndex++) levelSum += levels[binIndex];
    session.bandSums[frameIndex * INTRO_AUDIO_BAND_COUNT + bandIndex] += levelSum / (lastBin - firstBin);
  });
  session.sampleCounts[frameIndex]++;
  if (session.previousFrames && session.framesSinceMatch >= INTRO_AUDIO_MATCH_EVERY_FRAMES) { session.framesSinceMatch = 0; detectIntroFromAudio(session, false); }
}

/**
 * Monta a impressão digital: cada passo usa 1 s de som (o próprio passo e o seguinte), o que
 * tolera o desalinhamento entre episódios, e vira 15 bits dizendo se cada banda é mais forte
 * que a seguinte. Passos sem leitura ou em silêncio ficam vazios.
 * @param {AnaliseAudioAbertura} session Análise.
 * @returns {Uint16Array} Passos.
 */
function buildIntroFrames(session){
  const frames = new Uint16Array(INTRO_AUDIO_FRAME_COUNT).fill(INTRO_AUDIO_MISSING_FRAME);
  const bandLevels = new Float32Array(INTRO_AUDIO_BAND_COUNT);
  for (let frameIndex = 0; frameIndex < INTRO_AUDIO_FRAME_COUNT; frameIndex++) {
    const neighbourIndex = Math.min(frameIndex + 1, INTRO_AUDIO_FRAME_COUNT - 1);
    const sampleTotal = session.sampleCounts[frameIndex] + (neighbourIndex !== frameIndex ? session.sampleCounts[neighbourIndex] : 0);
    if (!sampleTotal) continue;
    let levelTotal = 0;
    for (let bandIndex = 0; bandIndex < INTRO_AUDIO_BAND_COUNT; bandIndex++) {
      const neighbourSum = neighbourIndex !== frameIndex ? session.bandSums[neighbourIndex * INTRO_AUDIO_BAND_COUNT + bandIndex] : 0;
      bandLevels[bandIndex] = (session.bandSums[frameIndex * INTRO_AUDIO_BAND_COUNT + bandIndex] + neighbourSum) / sampleTotal;
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
 * Compara o episódio atual com o anterior da temporada e, achando a abertura, salva o trecho
 * para a temporada (se o usuário não ensinou outro). A análise continua até 5 s depois do fim
 * dela, para a impressão digital deste episódio guardar a abertura inteira.
 * @param {AnaliseAudioAbertura} session Análise.
 * @param {boolean} isFinal Se é a última comparação.
 * @returns {void}
 */
function detectIntroFromAudio(session, isFinal){
  if (!session.previousFrames || session.detectedRange) return;
  const currentFrames = buildIntroFrames(session);
  const untrimmedRun = findSharedAudioRun(currentFrames, session.previousFrames); if (!untrimmedRun) return;
  const sharedRun = trimSharedRun(currentFrames, session.previousFrames, untrimmedRun);
  if ((sharedRun.lastFrame - sharedRun.firstFrame + 1) * INTRO_AUDIO_FRAME_SECONDS < INTRO_AUDIO_MIN_INTRO_SECONDS) return;
  const detectedRange = introFromSharedRun(sharedRun, session.previousIntro, isFinal); if (!detectedRange) return;
  session.detectedRange = detectedRange;
  saveDetectedIntroRange(session.seasonKey, detectedRange.start, detectedRange.end);
}

/**
 * Encerra a análise em andamento, guardando (se pedido) a impressão digital do episódio como
 * a mais recente da temporada.
 * @param {boolean} keepPrint Se guarda a impressão digital.
 * @returns {void}
 */
function stopIntroAudioSession(keepPrint){
  const session = introAudioSession; if (!session) return;
  introAudioSession = null;
  clearInterval(session.timer); session.timer = 0;
  releaseIntroAudioCapture(session);
  if (!keepPrint) return;
  detectIntroFromAudio(session, true);
  const frames = buildIntroFrames(session);
  let soundFrameCount = 0; frames.forEach(frame => { if (frame !== INTRO_AUDIO_MISSING_FRAME) soundFrameCount++; });
  if (soundFrameCount >= INTRO_AUDIO_MIN_STORED_FRAMES) storeIntroPrint(session.seasonKey, session.episodeId, frames, session.detectedRange || userIntroOfEpisode(session));
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
 * um episódio começa a tocar, se a temporada não tem uma abertura ensinada pelo usuário
 * (uma abertura vinda do som é refeita a cada episódio, pois o início pode variar).
 * @returns {void}
 */
function startIntroAudioAnalysis(){
  if (introAudioSession && introAudioSession.media === currentMedia) { if (!introAudioSession.timer) introAudioSession.timer = setInterval(sampleIntroAudio, INTRO_AUDIO_SAMPLE_MS, introAudioSession); return; }
  stopIntroAudioSession(true);
  const seasonKey = playingSeasonKey(), sourceUrl = currentMedia && currentMedia.url;
  const seasonRange = seasonKey ? introRangeFor(seasonKey) : null;
  if (!seasonKey || !isIntroAudioDetectionEnabled() || (seasonRange && seasonRange.source === 'user') || blockedIntroAudioSources.has(sourceUrl)) return;
  if (video.currentTime >= INTRO_AUDIO_ANALYSIS_SECONDS || !ensureIntroAudioGraph()) return;
  resumeIntroAudioContext();
  const episodeId = String(currentMedia.desc.epId || currentMedia.desc.ref), previousPrint = loadIntroPrints().prints[seasonKey];
  const hasUsablePreviousPrint = !!(previousPrint && previousPrint.ep !== episodeId && previousPrint.frames);
  introAudioSession = { media:currentMedia, seasonKey, episodeId, sourceUrl,
    bandSums:new Float32Array(INTRO_AUDIO_FRAME_COUNT * INTRO_AUDIO_BAND_COUNT), sampleCounts:new Uint16Array(INTRO_AUDIO_FRAME_COUNT),
    previousFrames: hasUsablePreviousPrint ? decodeIntroFrames(previousPrint.frames) : null,
    previousIntro: hasUsablePreviousPrint && previousPrint.intro ? previousPrint.intro : null,
    detectedRange:null, capturedStream:null, sourceNode:null, timer:0, silentMs:0, heardAudio:false, framesSinceMatch:0 };
  introAudioSession.timer = setInterval(sampleIntroAudio, INTRO_AUDIO_SAMPLE_MS, introAudioSession);
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
  releaseIntroAudioCapture(session);
}

/**
 * Começa ou retoma a análise do som quando o vídeo começa a tocar.
 */
video.addEventListener('playing', startIntroAudioAnalysis);
/**
 * Encerra ou pausa a análise quando o vídeo é trocado ou descarregado.
 */
video.addEventListener('emptied', handleIntroAudioEmptied);
