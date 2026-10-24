'use strict';
/**
 * Ajustes do app desktop (Electron): F11 alterna tela cheia da janela e Esc sai dela.
 */
document.documentElement.classList.add('desktop');
document.addEventListener('keydown', e => {
  if (e.key === 'F11') { e.preventDefault(); document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); }
});
