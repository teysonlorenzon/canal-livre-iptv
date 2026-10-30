'use strict';
/**
 * Setas ‹ › para faixas que rolam para o lado (prateleiras, abas de temporada, categorias em
 * telas estreitas). Elas só aparecem quando o conteúdo não cabe e ficam apagadas no começo ou
 * no fim. Com o mouse não há outro jeito de rolar essas faixas, porque a barra fica escondida.
 * Na TV ficam escondidas (`tv.css`): lá o controle já anda pelos itens.
 */

/** @type {{scrollElement: HTMLElement, arrowsElement: HTMLElement}[]} Faixas com setas, para atualizar ao mudar o tamanho da janela. */
let scrollArrowBindings = [];

/**
 * HTML das setas (começam escondidas até `bindScrollArrows` medir a faixa).
 * @param {string} [extraClass] Classe extra para posicionar as setas.
 * @param {string} [id] Id do elemento das setas.
 * @returns {string} HTML.
 */
const scrollArrowsHtml = (extraClass, id) =>
  `<span class="scroll-arrows${extraClass ? ' ' + extraClass : ''}"${id ? ` id="${id}"` : ''} hidden><button class="scroll-arrow" type="button" data-scroll="-1" aria-label="Voltar" tabindex="-1">${icon('back')}</button><button class="scroll-arrow next" type="button" data-scroll="1" aria-label="Avançar" tabindex="-1">${icon('back')}</button></span>`;

/**
 * Mostra as setas só quando a faixa não cabe e apaga a seta do lado em que ela já chegou ao fim.
 * @param {HTMLElement} scrollElement Faixa que rola.
 * @param {HTMLElement} arrowsElement Elemento com as setas.
 * @returns {void}
 */
function updateScrollArrows(scrollElement, arrowsElement) {
  const maxScroll = scrollElement.scrollWidth - scrollElement.clientWidth;
  arrowsElement.hidden = maxScroll <= 4;
  arrowsElement.querySelector('[data-scroll="-1"]').disabled = scrollElement.scrollLeft <= 4;
  arrowsElement.querySelector('[data-scroll="1"]').disabled = scrollElement.scrollLeft >= maxScroll - 4;
}

/**
 * Liga as setas a uma faixa: cada clique rola quase a largura visível, com animação.
 * @param {HTMLElement} scrollElement Faixa que rola.
 * @param {HTMLElement} arrowsElement Elemento com as setas (de `scrollArrowsHtml`).
 * @returns {void}
 */
function bindScrollArrows(scrollElement, arrowsElement) {
  arrowsElement.onclick = clickEvent => {
    const arrow = clickEvent.target.closest('[data-scroll]');
    if (!arrow) return;
    scrollElement.scrollBy({ left: +arrow.dataset.scroll * Math.max(scrollElement.clientWidth * 0.8, 120), behavior: 'smooth' });
  };
  scrollElement.addEventListener('scroll', () => updateScrollArrows(scrollElement, arrowsElement), { passive: true });
  scrollArrowBindings = scrollArrowBindings.filter(binding => binding.scrollElement.isConnected).concat({ scrollElement, arrowsElement });
  updateScrollArrows(scrollElement, arrowsElement);
}

/**
 * Ao mudar o tamanho da janela, mostra ou esconde as setas de todas as faixas ligadas.
 */
window.addEventListener('resize', () =>
  scrollArrowBindings.forEach(binding => {
    if (binding.scrollElement.isConnected) updateScrollArrows(binding.scrollElement, binding.arrowsElement);
  }),
);
