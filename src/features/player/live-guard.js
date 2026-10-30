'use strict';
/**
 * Estado do guardião contra travamentos.
 * @type {{fails: number, last: number, at: number, stableAt: number, timer: number|undefined}}
 */
const liveGuard = { fails: 0, last: -1, at: 0, stableAt: 0, timer: undefined };

/** Falhas seguidas toleradas antes de trocar de motor. */
const GUARD_MAX_FAILS = 6;

/**
 * Zera o estado do guardião (ao trocar de canal ou fechar o player).
 * @returns {void}
 */
function liveGuardReset() {
  clearTimeout(liveGuard.timer);
  Object.assign(liveGuard, { fails: 0, last: -1, at: Date.now(), stableAt: 0 });
}

/**
 * Reconecta a etapa atual com espera crescente (1, 2, 4, 8 e 10 s).
 * Depois de {@link GUARD_MAX_FAILS} falhas seguidas, desiste e passa para o próximo motor.
 * @param {string} failureReason Motivo da falha.
 * @returns {void}
 */
function liveRecover(failureReason) {
  const currentStage = engine;
  if (!currentStage || currentStage.my !== playbackToken) return;
  clearTimeout(liveGuard.timer);
  if (++liveGuard.fails > GUARD_MAX_FAILS) {
    liveGuardReset();
    currentStage.giveUp(failureReason);
    return;
  }
  const delay = Math.min(10000, 1000 * 2 ** (liveGuard.fails - 1));
  showPlayerMessage(
    `<div class="spinner"></div><p style="margin-top:12px">Reconectando… (tentativa ${liveGuard.fails} de ${GUARD_MAX_FAILS})</p>`,
  );
  liveGuard.timer = setTimeout(() => {
    if (engine === currentStage) currentStage.restart();
  }, delay);
}

/**
 * Procura buffer logo à frente da posição atual (buraco no fluxo).
 * @param {number} position Posição atual em segundos.
 * @returns {number|null} Início do trecho seguinte, ou `null` se não houver.
 */
function nextBufferedStart(position) {
  const bufferedRanges = video.buffered;
  for (let index = 0; index < bufferedRanges.length; index++)
    if (bufferedRanges.start(index) > position && bufferedRanges.start(index) - position < 5) return bufferedRanges.start(index);
  return null;
}

/**
 * Segundos já baixados à frente da posição atual.
 * @param {number} position Posição atual em segundos.
 * @returns {number} Segundos em buffer.
 */
function bufferAhead(position) {
  const bufferedRanges = video.buffered;
  for (let index = 0; index < bufferedRanges.length; index++)
    if (bufferedRanges.start(index) <= position + 0.1 && bufferedRanges.end(index) > position) return bufferedRanges.end(index) - position;
  return 0;
}

/**
 * Verificação feita a cada segundo durante a reprodução:
 * pula buracos no buffer, destrava com um pequeno avanço, reconecta o ao vivo
 * parado há mais de 8 s e, sem hls.js, volta para perto do ao vivo quando o atraso passa de 20 s.
 * @returns {void}
 */
function guardTick() {
  const currentStage = engine,
    now = Date.now(),
    position = video.currentTime;
  if (!currentStage || currentStage.my !== playbackToken || playerScreen.hidden || !currentStage.started || video.paused || video.seeking) {
    liveGuard.last = position;
    liveGuard.at = now;
    return;
  }
  if (position !== liveGuard.last) {
    liveGuard.last = position;
    liveGuard.at = now;
    if (!liveGuard.stableAt) liveGuard.stableAt = now;
    if (liveGuard.fails && now - liveGuard.stableAt > 20000) liveGuard.fails = 0;
    if (currentStage.live && !hlsPlayer && video.buffered.length) {
      const bufferedEnd = video.buffered.end(video.buffered.length - 1);
      if (bufferedEnd - position > 20) video.currentTime = bufferedEnd - 4;
    }
    return;
  }
  liveGuard.stableAt = 0;
  const stalledMs = now - liveGuard.at;
  if (stalledMs >= 2000 && stalledMs < 3000) {
    const nextRangeStart = nextBufferedStart(position);
    if (nextRangeStart != null) video.currentTime = nextRangeStart + 0.05;
    else if (bufferAhead(position) > 1) video.currentTime = position + 0.1;
  }
  if (currentStage.live && stalledMs >= 8000) {
    liveGuard.at = now;
    liveRecover('travou');
  }
}
setInterval(guardTick, 1000);

/**
 * Marca a etapa como funcionando quando o vídeo começa a tocar
 * e cancela o limite de tempo para começar.
 */
video.addEventListener('playing', () => {
  const currentStage = engine;
  if (!currentStage || currentStage.my !== playbackToken) return;
  currentStage.started = true;
  currentStage.retrying = false;
  clearTimeout(currentStage.wd);
  liveGuard.at = Date.now();
});

/**
 * Avisa quando a internet cai durante a TV ao vivo.
 */
window.addEventListener('offline', () => {
  if (engine && engine.live && !playerScreen.hidden)
    showPlayerMessage('<h2>Sem internet</h2><p>A transmissão volta sozinha quando a conexão retornar.</p>');
});

/**
 * Reconecta a TV ao vivo assim que a internet volta.
 */
window.addEventListener('online', () => {
  const currentStage = engine;
  if (!currentStage || !currentStage.live || playerScreen.hidden) return;
  liveGuardReset();
  showPlayerMessage('<div class="spinner"></div><p style="margin-top:12px">Conexão de volta, reconectando…</p>');
  currentStage.restart();
});
