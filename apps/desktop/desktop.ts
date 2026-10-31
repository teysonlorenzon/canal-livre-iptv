import '../../src/main';

/**
 * Ajustes do app desktop (Electron): F11 alterna tela cheia da janela e Esc sai dela.
 */
document.documentElement.classList.add('desktop');
/**
 * F11 alterna a tela cheia da janela.
 * @param event Evento de tecla.
 */
document.addEventListener('keydown', event => {
  if (event.key === 'F11') {
    event.preventDefault();
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  }
});
