import { closest, query } from '../core/dom';
import { icon } from './icons';

/**
 * Setas ‹ › para faixas que rolam para o lado (prateleiras, abas de temporada, categorias em
 * telas estreitas). Elas só aparecem quando o conteúdo não cabe e ficam apagadas no começo ou
 * no fim. Com o mouse não há outro jeito de rolar essas faixas, porque a barra fica escondida.
 * Na TV ficam escondidas (`tv.css`): lá o controle já anda pelos itens.
 */

/** Faixas com setas, para atualizar ao mudar o tamanho da janela. */
let scrollArrowBindings: { scrollElement: HTMLElement; arrowsElement: HTMLElement }[] = [];

/**
 * HTML das setas (começam escondidas até `bindScrollArrows` medir a faixa).
 * @param extraClass Classe extra para posicionar as setas.
 * @param id Id do elemento das setas.
 * @returns HTML.
 */
export const scrollArrowsHtml = (extraClass?: string, id?: string): string =>
  `<span class="scroll-arrows${extraClass ? ' ' + extraClass : ''}"${id ? ` id="${id}"` : ''} hidden><button class="scroll-arrow" type="button" data-scroll="-1" aria-label="Voltar" tabindex="-1">${icon('back')}</button><button class="scroll-arrow next" type="button" data-scroll="1" aria-label="Avançar" tabindex="-1">${icon('back')}</button></span>`;

/**
 * Mostra as setas só quando a faixa não cabe e apaga a seta do lado em que ela já chegou ao fim.
 * @param scrollElement Faixa que rola.
 * @param arrowsElement Elemento com as setas.
 */
export function updateScrollArrows(scrollElement: HTMLElement, arrowsElement: HTMLElement): void {
  const maxScroll = scrollElement.scrollWidth - scrollElement.clientWidth;
  arrowsElement.hidden = maxScroll <= 4;
  const previousArrow = query(arrowsElement, '[data-scroll="-1"]', HTMLButtonElement),
    nextArrow = query(arrowsElement, '[data-scroll="1"]', HTMLButtonElement);
  if (previousArrow) previousArrow.disabled = scrollElement.scrollLeft <= 4;
  if (nextArrow) nextArrow.disabled = scrollElement.scrollLeft >= maxScroll - 4;
}

/**
 * Liga as setas a uma faixa: cada clique rola quase a largura visível, com animação.
 * @param scrollElement Faixa que rola.
 * @param arrowsElement Elemento com as setas (de `scrollArrowsHtml`).
 */
export function bindScrollArrows(scrollElement: HTMLElement, arrowsElement: HTMLElement): void {
  arrowsElement.onclick = clickEvent => {
    const arrow = closest(clickEvent.target, '[data-scroll]');
    if (!arrow) return;
    scrollElement.scrollBy({ left: Number(arrow.dataset.scroll) * Math.max(scrollElement.clientWidth * 0.8, 120), behavior: 'smooth' });
  };
  scrollElement.addEventListener('scroll', () => updateScrollArrows(scrollElement, arrowsElement), { passive: true });
  scrollArrowBindings = scrollArrowBindings.filter(binding => binding.scrollElement.isConnected).concat({ scrollElement, arrowsElement });
  updateScrollArrows(scrollElement, arrowsElement);
}

/**
 * Liga os eventos desta parte do app. Chamada uma vez, na ordem de `main.ts`.
 */
export function initScrollArrows(): void {
  /**
   * Ao mudar o tamanho da janela, mostra ou esconde as setas de todas as faixas ligadas.
   */
  window.addEventListener('resize', () =>
    scrollArrowBindings.forEach(binding => {
      if (binding.scrollElement.isConnected) updateScrollArrows(binding.scrollElement, binding.arrowsElement);
    }),
  );
}
