'use strict';
/**
 * Abertura animada: o "Z" é desenhado como um traço de luz, o ponto "ao vivo" acende,
 * o nome aparece e a câmera mergulha no logo entre faixas de luz. Qualquer tecla ou
 * clique pula. Com "reduzir movimento" ligado no sistema, só aparece e some.
 *
 * `introDone` resolve quando a abertura termina: o carregamento da lista espera por ela,
 * para o processamento pesado não disputar a CPU com a animação (nas TVs isso travava).
 */
/** @type {Promise<void>} Resolve quando a abertura termina. */
let introDone;
introDone = new Promise(resolveIntro => {
  const COLORS = ['#ffb020', '#ff8a00', '#ff4d4d', '#ffd36b', '#ff6a3d'];
  const streaks = Array.from({ length:14 }, (_, index) => {
    const leftPercent = 50 + (Math.random() - .5) * 46, widthPercent = 0.4 + Math.random() * 2.2;
    const color = COLORS[index % COLORS.length], delaySeconds = (1.55 + Math.random() * .35).toFixed(2);
    return `<i style="left:${leftPercent.toFixed(1)}%;width:${widthPercent.toFixed(2)}%;background:linear-gradient(${color}00,${color},${color}00);animation-delay:${delaySeconds}s"></i>`;
  }).join('');
  document.body.insertAdjacentHTML('afterbegin', `
<div id="intro" aria-hidden="true">
  <div class="in-streaks">${streaks}</div>
  <div class="in-logo">
    <svg viewBox="0 0 130 100" width="260" height="200">
      <path class="in-glow" d="M41 24h48L45 70h46"/>
      <path class="in-z" d="M41 24h48L45 70h46"/>
      <circle class="in-dot" cx="98" cy="20" r="7.5"/>
    </svg>
    <div class="in-name">ZAPP<small>IPTV</small></div>
  </div>
</div>`);

  const introElement = document.getElementById('intro');
  const strokeLength = introElement.querySelector('.in-z').getTotalLength();
  introElement.querySelectorAll('.in-z,.in-glow').forEach(strokePath => { strokePath.style.strokeDasharray = strokeLength; strokePath.style.strokeDashoffset = strokeLength; });

  let isFinished = false;
  /**
   * Encerra a abertura com um fade e remove o elemento.
   * @returns {void}
   */
  const end = () => {
    if (isFinished) return; isFinished = true;
    window.removeEventListener('keydown', skip, true);
    introElement.classList.add('out');
    setTimeout(() => { introElement.remove(); resolveIntro(); }, 450);
  };
  /**
   * Pula a abertura sem deixar a tecla chegar ao app (o Voltar fecharia o aplicativo).
   * @param {Event} event Evento de tecla ou clique.
   */
  const skip = event => { event.preventDefault(); event.stopImmediatePropagation(); end(); };
  window.addEventListener('keydown', skip, true);
  introElement.addEventListener('click', end);

  const prefersReducedMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) { introElement.classList.add('still'); setTimeout(end, 900); }
  else { requestAnimationFrame(() => introElement.classList.add('go')); setTimeout(end, 3100); }
});
