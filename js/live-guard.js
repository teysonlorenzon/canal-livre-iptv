'use strict';
/**
 * Estado do guardião contra travamentos.
 * @type {{fails: number, last: number, at: number, stableAt: number, timer: number|undefined}}
 */
const guard = { fails:0, last:-1, at:0, stableAt:0, timer:undefined };

/** Falhas seguidas toleradas antes de trocar de motor. */
const GUARD_MAX_FAILS = 6;

/**
 * Zera o estado do guardião (ao trocar de canal ou fechar o player).
 * @returns {void}
 */
function liveGuardReset(){
  clearTimeout(guard.timer);
  Object.assign(guard, { fails:0, last:-1, at:Date.now(), stableAt:0 });
}

/**
 * Reconecta a etapa atual com espera crescente (1, 2, 4, 8 e 10 s).
 * Depois de {@link GUARD_MAX_FAILS} falhas seguidas, desiste e passa para o próximo motor.
 * @param {string} why Motivo da falha.
 * @returns {void}
 */
function liveRecover(why){
  const s = engine;
  if (!s || s.my !== token) return;
  clearTimeout(guard.timer);
  if (++guard.fails > GUARD_MAX_FAILS) { liveGuardReset(); s.giveUp(why); return; }
  const delay = Math.min(10000, 1000 * 2 ** (guard.fails - 1));
  msg(`<div class="spinner"></div><p style="margin-top:12px">Reconectando… (tentativa ${guard.fails} de ${GUARD_MAX_FAILS})</p>`);
  guard.timer = setTimeout(() => { if (engine === s) s.restart(); }, delay);
}

/**
 * Procura buffer logo à frente da posição atual (buraco no fluxo).
 * @param {number} t Posição atual em segundos.
 * @returns {number|null} Início do trecho seguinte, ou `null` se não houver.
 */
function nextBufferedStart(t){
  const b = v.buffered;
  for (let i = 0; i < b.length; i++) if (b.start(i) > t && b.start(i) - t < 5) return b.start(i);
  return null;
}

/**
 * Segundos já baixados à frente da posição atual.
 * @param {number} t Posição atual em segundos.
 * @returns {number} Segundos em buffer.
 */
function bufferAhead(t){
  const b = v.buffered;
  for (let i = 0; i < b.length; i++) if (b.start(i) <= t + 0.1 && b.end(i) > t) return b.end(i) - t;
  return 0;
}

/**
 * Verificação feita a cada segundo durante a reprodução:
 * pula buracos no buffer, destrava com um pequeno avanço, reconecta o ao vivo
 * parado há mais de 8 s e, sem hls.js, volta para perto do ao vivo quando o atraso passa de 20 s.
 * @returns {void}
 */
function guardTick(){
  const s = engine, now = Date.now(), t = v.currentTime;
  if (!s || s.my !== token || player.hidden || !s.started || v.paused || v.seeking) { guard.last = t; guard.at = now; return; }
  if (t !== guard.last) {
    guard.last = t; guard.at = now;
    if (!guard.stableAt) guard.stableAt = now;
    if (guard.fails && now - guard.stableAt > 20000) guard.fails = 0;
    if (s.live && !hls && v.buffered.length) {
      const end = v.buffered.end(v.buffered.length - 1);
      if (end - t > 20) v.currentTime = end - 4;
    }
    return;
  }
  guard.stableAt = 0;
  const stalled = now - guard.at;
  if (stalled >= 2000 && stalled < 3000) {
    const gap = nextBufferedStart(t);
    if (gap != null) v.currentTime = gap + 0.05;
    else if (bufferAhead(t) > 1) v.currentTime = t + 0.1;
  }
  if (s.live && stalled >= 8000) { guard.at = now; liveRecover('travou'); }
}
setInterval(guardTick, 1000);

/**
 * Marca a etapa como funcionando quando o vídeo começa a tocar
 * e cancela o limite de tempo para começar.
 */
v.addEventListener('playing', () => {
  const s = engine;
  if (!s || s.my !== token) return;
  s.started = true; s.retrying = false;
  clearTimeout(s.wd);
  guard.at = Date.now();
});

/**
 * Avisa quando a internet cai durante a TV ao vivo.
 */
window.addEventListener('offline', () => {
  if (engine && engine.live && !player.hidden) msg('<h2>Sem internet</h2><p>A transmissão volta sozinha quando a conexão retornar.</p>');
});

/**
 * Reconecta a TV ao vivo assim que a internet volta.
 */
window.addEventListener('online', () => {
  const s = engine;
  if (!s || !s.live || player.hidden) return;
  liveGuardReset();
  msg('<div class="spinner"></div><p style="margin-top:12px">Conexão de volta, reconectando…</p>');
  s.restart();
});
