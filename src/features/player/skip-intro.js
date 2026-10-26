'use strict';
/**
 * Botão "Pular abertura" dos episódios de séries. As listas IPTV não informam onde a abertura
 * fica, então o app aprende por temporada: pelo comportamento do usuário (o botão, ou um avanço
 * manual grande no começo do episódio, com ajuste fino logo depois) e, onde for possível, pela
 * comparação do som entre episódios (`intro-audio.js`). Tudo fica em `userData.intro`.
 */

/** @type {number} Fim (s) da janela em que o botão aparece numa temporada sem abertura aprendida. */
const SKIP_INTRO_DEFAULT_WINDOW_END = 180;
/** @type {number} Quanto (s) o pulo avança numa temporada sem abertura aprendida. */
const SKIP_INTRO_DEFAULT_JUMP = 85;
/** @type {number} Antecedência (s) com que o botão aparece antes do início aprendido da abertura. */
const SKIP_INTRO_SHOW_BEFORE_START = 1;
/** @type {number} Antecedência (s) com que o botão some antes do fim aprendido da abertura. */
const SKIP_INTRO_HIDE_BEFORE_END = 2;
/** @type {number} Tempo (ms) depois do pulo em que um ajuste manual da posição vira o novo fim da abertura. */
const SKIP_INTRO_LEARNING_MS = 15000;
/** @type {number} Duração (s) mínima da abertura; voltar para antes disso depois do pulo indica que o usuário quis ver a abertura. */
const SKIP_INTRO_MIN_LENGTH = 5;
/** @type {number} Diferença (s) até a qual um seek é o do próprio pulo, e não um ajuste do usuário. */
const SKIP_INTRO_OWN_SEEK_TOLERANCE = 0.75;
/** @type {number} Distância (s) mínima do fim do vídeo para onde o pulo pode levar. */
const SKIP_INTRO_END_MARGIN = 1;
/** @type {number} Avanço manual (s) mínimo, somando cliques seguidos, que conta como "pulou a abertura". */
const SKIP_INTRO_MANUAL_MIN_JUMP = 20;
/** @type {number} Avanço manual (s) máximo que ainda pode ser uma abertura (mais que isso é pular uma cena). */
const SKIP_INTRO_MANUAL_MAX_JUMP = 180;
/** @type {number} Só aprende com avanços manuais que saem de antes desta posição (s). */
const SKIP_INTRO_MANUAL_LATEST_START = 480;
/** @type {number} Intervalo (ms) máximo entre avanços seguidos (±10 s repetido) para somá-los num só. */
const SKIP_INTRO_SEEK_BURST_MS = 2500;
/** @type {number} Segundos de vídeo em que o botão fica na tela se o usuário não tocar nele. */
const SKIP_INTRO_DISPLAY_SECONDS = 10;

const skipIntroButton = $('skipIntro');

/**
 * Trecho da abertura de uma temporada.
 * @typedef {Object} TrechoAbertura
 * @property {number} start Início em segundos.
 * @property {number} end Fim em segundos.
 * @property {'user'|'audio'} source Origem: comportamento do usuário ou comparação do som.
 */

/**
 * Aprendizado em andamento logo depois de um pulo (botão ou avanço manual).
 * @typedef {Object} AprendizadoAbertura
 * @property {string} seasonKey Temporada (`series:<k>:<temporada>`).
 * @property {number} start Início da abertura usado no aprendizado.
 * @property {number} until Fim (timestamp em ms) do prazo para o ajuste fino.
 * @property {number} jumpTarget Posição para onde o pulo levou (o seek do próprio pulo não é ajuste).
 * @property {TrechoAbertura|null} previousRange Trecho salvo antes do pulo, restaurado se o usuário voltar para ver a abertura.
 */

/**
 * Estado do pulo da abertura para o episódio em reprodução.
 * @typedef {Object} EstadoPuloAbertura
 * @property {Object|null} media Mídia (`currentMedia`) a que o estado pertence.
 * @property {boolean} skipped Se a abertura deste episódio já foi pulada.
 * @property {AprendizadoAbertura|null} learning Aprendizado em andamento.
 * @property {boolean} learnedFromBehavior Se este episódio já ensinou uma abertura (só a primeira conta).
 * @property {number|null} stablePosition Última posição tocada normalmente (fora de um seek); `null` antes de tocar.
 * @property {{origin: number, lastSeekAt: number}|null} seekBurst Sequência de avanços seguidos em andamento.
 * @property {number|null} shownAtPosition Posição do vídeo em que o botão apareceu (`null` = fora da janela da abertura).
 * @property {string} shownForRange Trecho da abertura para o qual o botão apareceu (outro trecho achado o mostra de novo).
 */
/** @type {EstadoPuloAbertura} Estado do pulo da abertura. */
let skipIntroState = createSkipIntroState(null);

/**
 * Cria o estado do pulo para uma mídia.
 * @param {Object|null} media Mídia em reprodução.
 * @returns {EstadoPuloAbertura} Estado inicial.
 */
function createSkipIntroState(media){ return { media, skipped:false, learning:null, learnedFromBehavior:false, stablePosition:null, seekBurst:null, shownAtPosition:null, shownForRange:'' }; }

/**
 * Temporada do episódio em reprodução.
 * @returns {string} `series:<k>:<temporada>`, ou vazio se não estiver tocando um episódio.
 */
function playingSeasonKey(){
  const episodeDesc = currentMedia && currentMedia.kind === 'series' && currentMedia.desc;
  if (!episodeDesc || !episodeDesc.series) return '';
  return episodeDesc.series + ':' + (episodeDesc.season != null ? episodeDesc.season : 1);
}

/**
 * Lê um trecho salvo e confere se é válido.
 * @param {*} savedValue Valor salvo em `userData.intro`.
 * @returns {TrechoAbertura|null} Trecho, ou `null` se inválido.
 */
function parseIntroRange(savedValue){
  if (!savedValue || typeof savedValue !== 'object') return null;
  const start = +savedValue.start, end = +savedValue.end;
  if (!isFinite(start) || !isFinite(end) || start < 0 || end <= start) return null;
  return { start, end, source: savedValue.source === 'audio' ? 'audio' : 'user' };
}

/**
 * Trecho da abertura conhecido para uma temporada. Sem valor próprio, aceita o formato antigo
 * (só o fim, salvo por série) como abertura começando em 0.
 * @param {string} seasonKey Temporada (`series:<k>:<temporada>`).
 * @returns {TrechoAbertura|null} Trecho, ou `null` se nada foi aprendido.
 */
function introRangeFor(seasonKey){
  const introBySeason = userData && userData.intro; if (!introBySeason || !seasonKey) return null;
  const seasonRange = parseIntroRange(introBySeason[seasonKey]); if (seasonRange) return seasonRange;
  const legacySeriesEnd = introBySeason[seasonKey.slice(0, seasonKey.lastIndexOf(':'))];
  return typeof legacySeriesEnd === 'number' && legacySeriesEnd > 0 ? { start:0, end:legacySeriesEnd, source:'user' } : null;
}

/**
 * Salva (ou apaga, com `null`) o trecho da abertura de uma temporada.
 * @param {string} seasonKey Temporada.
 * @param {TrechoAbertura|null} introRange Trecho a salvar; `null` apaga o valor da temporada.
 * @returns {void}
 */
function saveSeasonIntroRange(seasonKey, introRange){
  if (!userData || !seasonKey) return;
  const roundToTenth = seconds => Math.round(seconds * 10) / 10;
  const introBySeason = Object.assign({}, userData.intro);
  if (introRange) introBySeason[seasonKey] = { start:roundToTenth(introRange.start), end:roundToTenth(introRange.end), source:introRange.source };
  else delete introBySeason[seasonKey];
  userData.intro = introBySeason;
  saveUserData();
}

/**
 * Salva o trecho achado pela comparação do som, a não ser que a temporada já tenha um trecho
 * ensinado pelo usuário (que tem prioridade).
 * @param {string} seasonKey Temporada.
 * @param {number} start Início em segundos.
 * @param {number} end Fim em segundos.
 * @returns {boolean} `true` se salvou.
 */
function saveDetectedIntroRange(seasonKey, start, end){
  const knownRange = introRangeFor(seasonKey);
  if (knownRange && knownRange.source === 'user') return false;
  saveSeasonIntroRange(seasonKey, { start, end, source:'audio' });
  updateSkipIntroButton();
  return true;
}

/**
 * Recomeça o estado do pulo quando outro conteúdo começa a tocar.
 * @returns {void}
 */
function syncSkipIntroState(){ if (skipIntroState.media !== currentMedia) skipIntroState = createSkipIntroState(currentMedia); }

/**
 * Indica se a posição atual está dentro da janela da abertura do episódio.
 * Sem abertura aprendida, a janela são os primeiros 3 min; com ela, vai de 1 s antes do
 * início até 2 s antes do fim. Enquanto o som da abertura da temporada é procurado no
 * episódio, o botão espera ele tocar.
 * @returns {boolean} `true` se o botão deve aparecer.
 */
function isInsideIntroWindow(){
  const seasonKey = playingSeasonKey(); if (!seasonKey || playerScreen.hidden) return false;
  syncSkipIntroState();
  if (skipIntroState.skipped || isIntroPatternSearchPending()) return false;
  const isResumePending = currentMedia.resume > 5 && video.currentTime < 1;
  if (isResumePending || video.readyState < 2) return false;
  const knownRange = introRangeFor(seasonKey), duration = video.duration, position = video.currentTime;
  const jumpTarget = knownRange ? knownRange.end : position + SKIP_INTRO_DEFAULT_JUMP;
  if (isFinite(duration) && duration > 0 && (knownRange ? jumpTarget : SKIP_INTRO_DEFAULT_JUMP) >= duration - SKIP_INTRO_END_MARGIN) return false;
  if (!knownRange) return position < SKIP_INTRO_DEFAULT_WINDOW_END;
  return position >= knownRange.start - SKIP_INTRO_SHOW_BEFORE_START && position < knownRange.end - SKIP_INTRO_HIDE_BEFORE_END;
}

/**
 * Indica se o botão ainda está no seu tempo de tela: ele some depois de 10 s de vídeo sem o
 * usuário tocar nele. Volta a aparecer se a abertura achada mudar ou se o usuário voltar o
 * vídeo para antes de onde o botão apareceu.
 * @param {boolean} isInsideWindow Se a posição está dentro da janela da abertura.
 * @returns {boolean} `true` se o botão pode continuar na tela.
 */
function isWithinSkipIntroDisplayTime(isInsideWindow){
  if (!isInsideWindow) { skipIntroState.shownAtPosition = null; return false; }
  const knownRange = introRangeFor(playingSeasonKey()), rangeKey = knownRange ? knownRange.start + '-' + knownRange.end : '';
  const position = video.currentTime;
  if (skipIntroState.shownAtPosition === null || skipIntroState.shownForRange !== rangeKey || position < skipIntroState.shownAtPosition) {
    skipIntroState.shownAtPosition = position; skipIntroState.shownForRange = rangeKey;
  }
  return position - skipIntroState.shownAtPosition < SKIP_INTRO_DISPLAY_SECONDS;
}

/**
 * Posição para onde o pulo leva: o fim aprendido da temporada ou, sem ele, 85 s à frente
 * (limitado à duração do vídeo).
 * @param {TrechoAbertura|null} knownRange Trecho conhecido da temporada.
 * @returns {number} Posição em segundos.
 */
function skipIntroTarget(knownRange){
  if (knownRange) return knownRange.end;
  const duration = video.duration, jumpTarget = video.currentTime + SKIP_INTRO_DEFAULT_JUMP;
  return isFinite(duration) && duration > 0 ? Math.min(jumpTarget, duration - SKIP_INTRO_END_MARGIN) : jumpTarget;
}

/**
 * Indica se o botão "Pular abertura" está na tela.
 * @returns {boolean} `true` se visível.
 */
const isSkipIntroVisible = () => !skipIntroButton.hidden && !playerScreen.hidden;

/**
 * Coloca o botão logo acima da barra de progresso, no mesmo lugar com os controles visíveis
 * ou escondidos (assim o toque que reexibe os controles não tira o botão de baixo do dedo).
 * Sem a barra na tela, usa a posição do CSS. Só altera o estilo quando a posição muda.
 * @returns {void}
 */
function positionSkipIntroButton(){
  if (skipIntroButton.hidden) return;
  const seekRow = $('seekRow');
  const distanceFromBottom = playerScreen.getBoundingClientRect().bottom - seekRow.getBoundingClientRect().top;
  const bottomOffset = seekRow.hidden ? '' : Math.round(distanceFromBottom + 12) + 'px';
  if (skipIntroButton.style.bottom !== bottomOffset) skipIntroButton.style.bottom = bottomOffset;
}

/**
 * Mostra ou esconde o botão conforme a posição do episódio (por até 10 s de vídeo) e o mantém
 * acima da barra, que muda de altura ao girar a tela ou quando aparecem os seletores de áudio
 * e legenda (só mexe no DOM quando algo muda).
 * @param {boolean} [isVisible] Visibilidade desejada; sem valor, calcula pela janela da abertura.
 * @returns {void}
 */
function updateSkipIntroButton(isVisible = isWithinSkipIntroDisplayTime(isInsideIntroWindow())){
  if (skipIntroButton.hidden === isVisible) skipIntroButton.hidden = !isVisible;
  positionSkipIntroButton();
}

/**
 * Começa o prazo de 15 s em que a posição escolhida pelo usuário vira o fim da abertura.
 * @param {string} seasonKey Temporada.
 * @param {number} start Início da abertura.
 * @param {number} jumpTarget Posição para onde o pulo levou.
 * @param {TrechoAbertura|null} previousRange Trecho salvo antes do pulo.
 * @returns {void}
 */
function startIntroLearning(seasonKey, start, jumpTarget, previousRange){
  skipIntroState.skipped = true;
  skipIntroState.learnedFromBehavior = true;
  skipIntroState.learning = { seasonKey, start, jumpTarget, until:Date.now() + SKIP_INTRO_LEARNING_MS, previousRange };
  updateSkipIntroButton(false);
}

/**
 * Pula a abertura do episódio. O ponto de onde o usuário saiu vira o início (se a temporada
 * ainda não tinha um) e o destino vira o fim; os 15 s seguintes permitem o ajuste fino.
 * @returns {void}
 */
function skipIntro(){
  const seasonKey = playingSeasonKey(); if (!seasonKey) return;
  syncSkipIntroState();
  if (skipIntroState.skipped) return;
  const knownRange = introRangeFor(seasonKey), jumpTarget = skipIntroTarget(knownRange);
  const introStart = knownRange ? knownRange.start : video.currentTime;
  startIntroLearning(seasonKey, introStart, jumpTarget, knownRange);
  skipIntroState.seekBurst = null;
  video.currentTime = jumpTarget;
  saveSeasonIntroRange(seasonKey, { start:introStart, end:jumpTarget, source: knownRange ? knownRange.source : 'user' });
}

/**
 * Ajuste fino depois do pulo: dentro do prazo, a posição escolhida pelo usuário (barra,
 * ±10 s, setas) vira o fim da abertura, com prioridade sobre o que veio do som (o seek do
 * próprio pulo não conta, então pular sem ajustar mantém a origem do trecho). Se ele voltar
 * para o começo da abertura, entende que quis vê-la e restaura o trecho anterior.
 * @param {AprendizadoAbertura} learning Aprendizado em andamento.
 * @returns {void}
 */
function adjustLearnedIntroEnd(learning){
  if (Math.abs(video.currentTime - learning.jumpTarget) < SKIP_INTRO_OWN_SEEK_TOLERANCE) return;
  if (video.currentTime >= learning.start + SKIP_INTRO_MIN_LENGTH) { saveSeasonIntroRange(learning.seasonKey, { start:learning.start, end:video.currentTime, source:'user' }); return; }
  saveSeasonIntroRange(learning.seasonKey, learning.previousRange);
  skipIntroState.learning = null;
}

/**
 * Avanço manual no começo do episódio (barra ou vários ±10 s seguidos) maior que 20 s:
 * de onde o usuário saiu até onde parou vira a abertura da temporada, como se tivesse usado
 * o botão. Se ele saiu de dentro de uma abertura já conhecida, mantém o início dela.
 * @param {string} seasonKey Temporada.
 * @returns {void}
 */
function learnFromManualSkip(seasonKey){
  const seekBurst = skipIntroState.seekBurst; if (!seekBurst) return;
  const origin = seekBurst.origin, destination = video.currentTime, jumpLength = destination - origin;
  if (skipIntroState.learnedFromBehavior || origin >= SKIP_INTRO_MANUAL_LATEST_START || jumpLength <= SKIP_INTRO_MANUAL_MIN_JUMP || jumpLength > SKIP_INTRO_MANUAL_MAX_JUMP) return;
  const knownRange = introRangeFor(seasonKey);
  const isInsideKnownIntro = knownRange && origin >= knownRange.start - SKIP_INTRO_SHOW_BEFORE_START && origin <= knownRange.end;
  const introStart = isInsideKnownIntro ? knownRange.start : origin;
  startIntroLearning(seasonKey, introStart, destination, knownRange);
  saveSeasonIntroRange(seasonKey, { start:introStart, end:destination, source:'user' });
}

/**
 * Trata cada seek terminado: ajuste fino de um pulo recente ou, sem ele, avanço manual que
 * ensina a abertura. Seeks antes de o episódio tocar (retomada) não têm origem e são ignorados.
 * @returns {void}
 */
function handleIntroSeek(){
  syncSkipIntroState();
  const seasonKey = playingSeasonKey(); if (!seasonKey) return;
  const learning = skipIntroState.learning;
  if (learning && Date.now() <= learning.until) { adjustLearnedIntroEnd(learning); return; }
  skipIntroState.learning = null;
  if (!skipIntroState.seekBurst) return;
  skipIntroState.seekBurst.lastSeekAt = Date.now();
  learnFromManualSkip(seasonKey);
}

/**
 * Ao começar um seek, guarda de onde o usuário saiu (antes de a posição mudar). Seeks
 * seguidos (±10 s repetido) somam-se à mesma sequência, que mantém a origem do primeiro.
 * @returns {void}
 */
function rememberSeekOrigin(){
  syncSkipIntroState();
  const seekBurst = skipIntroState.seekBurst, now = Date.now();
  if (seekBurst && now - seekBurst.lastSeekAt <= SKIP_INTRO_SEEK_BURST_MS) { seekBurst.lastSeekAt = now; return; }
  skipIntroState.seekBurst = skipIntroState.stablePosition === null ? null : { origin:skipIntroState.stablePosition, lastSeekAt:now };
}

/**
 * Guarda a última posição tocada normalmente, de onde partem os avanços manuais.
 * @returns {void}
 */
function rememberStablePosition(){
  syncSkipIntroState();
  if (!video.seeking && !video.paused && video.currentTime > 0.05) skipIntroState.stablePosition = video.currentTime;
}

skipIntroButton.onclick = skipIntro;
/**
 * Mostra ou esconde o botão conforme o episódio avança e guarda a posição tocada.
 */
video.addEventListener('timeupdate', () => { rememberStablePosition(); updateSkipIntroButton(); });
/**
 * Guarda a posição de onde parte cada seek.
 */
video.addEventListener('seeking', rememberSeekOrigin);
/**
 * Aprende a abertura com o pulo manual ou com o ajuste feito logo depois do pulo.
 */
video.addEventListener('seeked', handleIntroSeek);
/**
 * Esconde o botão quando o vídeo é trocado ou descarregado.
 */
video.addEventListener('emptied', () => updateSkipIntroButton(false));
/**
 * Reposiciona o botão ao girar a tela ou redimensionar a janela.
 */
window.addEventListener('resize', positionSkipIntroButton);
