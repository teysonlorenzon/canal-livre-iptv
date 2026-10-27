'use strict';
/**
 * Abertura animada numa linha do tempo só: o "Z" é desenhado como um traço de luz (0,1–0,9 s);
 * no instante em que ele fecha, o ponto "ao vivo" acende e o Z explode: um clarão, uma onda de
 * choque, raios e faíscas saem dele para todos os lados (0,9–2,1 s). O nome aparece no meio da
 * explosão (1,0–1,55 s). Quando a explosão termina, a abertura some com um fade e o app aparece.
 * O logo fica parado (não cresce nem "voa" para a frente). Qualquer tecla ou clique pula.
 * Com "reduzir movimento" ligado no sistema, só aparece e some.
 *
 * `introDone` resolve quando a abertura termina: o carregamento da lista espera por ela,
 * para o processamento pesado não disputar a CPU com a animação (nas TVs isso travava).
 */
/** @type {Promise<void>} Resolve quando a abertura termina. */
let introDone;
introDone = new Promise(resolveIntro => {
  const COLORS = ['#ffb020', '#ff8a00', '#ff4d4d', '#ffd36b', '#ff6a3d'];
  const BURST_START_SECONDS = 0.9, BURST_DURATION_SECONDS = 1.2;
  const burstReach = Math.max(window.innerWidth, window.innerHeight) * 0.6;
  const rays = Array.from({ length:20 }, (_, index) => {
    const angle = index / 20 * 360 + (Math.random() - .5) * 10, reach = burstReach * (0.6 + Math.random() * .5), color = COLORS[index % COLORS.length];
    return `<i class="in-ray" style="--a:${angle.toFixed(1)}deg;--r:${reach.toFixed(0)}px;background:linear-gradient(${color},${color}00);animation-delay:${(BURST_START_SECONDS + Math.random() * .08).toFixed(2)}s"></i>`;
  }).join('');
  const sparks = Array.from({ length:26 }, (_, index) => {
    const angle = Math.random() * Math.PI * 2, distance = burstReach * (0.25 + Math.random() * .75), size = 3 + Math.random() * 4, color = COLORS[index % COLORS.length];
    const delaySeconds = BURST_START_SECONDS + Math.random() * .1, durationSeconds = Math.min(0.7 + Math.random() * .4, BURST_START_SECONDS + BURST_DURATION_SECONDS - delaySeconds);
    return `<i class="in-spark" style="--dx:${(Math.cos(angle) * distance).toFixed(0)}px;--dy:${(Math.sin(angle) * distance).toFixed(0)}px;width:${size.toFixed(1)}px;height:${size.toFixed(1)}px;margin:${(-size / 2).toFixed(1)}px 0 0 ${(-size / 2).toFixed(1)}px;background:${color};animation-delay:${delaySeconds.toFixed(2)}s;animation-duration:${durationSeconds.toFixed(2)}s"></i>`;
  }).join('');
  document.body.insertAdjacentHTML('afterbegin', `
<div id="intro" aria-hidden="true">
  <div class="in-burst" id="inBurst"><i class="in-flash"></i><i class="in-ring"></i>${rays}${sparks}</div>
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

  const zBox = introElement.querySelector('.in-logo svg').getBoundingClientRect(), burstElement = document.getElementById('inBurst');
  burstElement.style.left = (zBox.left + zBox.width * 66 / 130) + 'px'; burstElement.style.top = (zBox.top + zBox.height * 47 / 100) + 'px';

  let isFinished = false;
  /**
   * Encerra a abertura com um fade e remove o elemento.
   * @returns {void}
   */
  const end = () => {
    if (isFinished) return; isFinished = true;
    window.removeEventListener('keydown', skip, true);
    introElement.classList.add('out');
    setTimeout(() => { introElement.remove(); resolveIntro(); }, 500);
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
  else { requestAnimationFrame(() => introElement.classList.add('go')); setTimeout(end, (BURST_START_SECONDS + BURST_DURATION_SECONDS) * 1000); }
});
