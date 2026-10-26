'use strict';
/**
 * Ajustes do app desktop (Electron): F11 alterna tela cheia da janela e Esc sai dela.
 */
document.documentElement.classList.add('desktop');
/**
 * F11 alterna a tela cheia da janela.
 * @param {KeyboardEvent} event Evento de tecla.
 */
document.addEventListener('keydown', event => {
  if (event.key === 'F11') { event.preventDefault(); document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); }
});
