import { $, query, queryAll } from './dom';

/** Partes da página que ficam inertes (sem foco nem leitura) enquanto um modal está aberto. */
const BACKGROUND_SELECTOR = 'body > header, #app, .skip-link';

/** Quantos modais pedem o fundo inerte agora (player, tela de carregamento…). */
let backgroundLocks = 0;

/**
 * Indica se o app roda na TV, onde o foco é do controle remoto e o app o move sozinho.
 * @returns `true` na TV.
 */
export const isTvPlatform = (): boolean => document.documentElement.classList.contains('tv');

/**
 * Indica se a pessoa pediu menos movimento no sistema.
 * @returns `true` se animações devem ser evitadas.
 */
export const prefersReducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Aplica ou tira o atributo `inert` do fundo da página, conforme os modais abertos.
 */
function applyBackgroundInert(): void {
  queryAll(document, BACKGROUND_SELECTOR).forEach(part => part.toggleAttribute('inert', backgroundLocks > 0));
}

/**
 * Deixa o fundo da página inerte: o teclado e o leitor de tela ficam só no modal. Cada chamada
 * precisa de um `unlockBackground()`, e o fundo só volta quando todos os modais fecharem.
 */
export function lockBackground(): void {
  backgroundLocks++;
  applyBackgroundInert();
}

/**
 * Desfaz um `lockBackground()`.
 */
export function unlockBackground(): void {
  backgroundLocks = Math.max(0, backgroundLocks - 1);
  applyBackgroundInert();
}

/**
 * Aspas e barras de um valor, para usá-lo dentro de um seletor de atributo.
 * @param value Valor.
 * @returns Valor escapado.
 */
const escapeAttributeValue = (value: string): string => value.replace(/["\\]/g, '\\$&');

/** Atributos `data-*` que identificam um elemento (item, categoria, temporada, perfil…) de uma tela redesenhada. */
const IDENTITY_DATA = [
  'i',
  'c',
  's',
  'e',
  'x',
  'live',
  'profile',
  'k',
  't',
  'sec',
  'cont',
  'rec',
  'watched',
  'top',
  'rank',
  'del',
  'open',
  'reload',
  'askpin',
  'edit-profile',
  'del-profile',
  'add-profile',
  'icon',
  'color',
];

/** Seletor dos elementos que identificam o que foi focado: com `id` ou com algum atributo de identidade. */
const ANCHOR_SELECTOR = ['[id]', ...IDENTITY_DATA.map(name => `[data-${name}]`)].join(',');

/**
 * Seletor que acha de novo o elemento depois que a tela for redesenhada: o `id` do ancestral mais
 * próximo que o tenha, ou seus atributos de identidade, mais o próprio elemento (tag e primeira classe).
 * @param element Elemento.
 * @returns Seletor, ou `null` se nada o identifica.
 */
function identityOf(element: HTMLElement): string | null {
  const anchor = element.closest<HTMLElement>(ANCHOR_SELECTOR);
  if (!anchor) return null;
  const dataSelector = IDENTITY_DATA.filter(name => anchor.hasAttribute(`data-${name}`))
    .map(name => `[data-${name}="${escapeAttributeValue(anchor.getAttribute(`data-${name}`) ?? '')}"]`)
    .join('');
  const anchorSelector = anchor.id ? `#${anchor.id}` : anchor.tagName.toLowerCase() + dataSelector;
  if (anchor === element) return anchorSelector;
  const firstClass = element.classList[0];
  return `${anchorSelector} ${element.tagName.toLowerCase()}${firstClass ? '.' + firstClass : ''}`;
}

/** Foco guardado para ser devolvido depois. */
export interface FocusMemory {
  /**
   * Devolve o foco ao elemento (ou ao que o substituiu na tela redesenhada).
   * @returns `true` se achou onde focar.
   */
  restore: () => boolean;
}

/**
 * Guarda quem tem o foco agora.
 * @returns O foco guardado, ou `null` se nada específico estiver focado.
 */
export function rememberFocus(): FocusMemory | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active === document.body) return null;
  const selector = identityOf(active);
  return {
    restore: () => {
      const target = active.isConnected ? active : selector ? query(document, selector) : null;
      target?.focus();
      return target !== null;
    },
  };
}

/**
 * Redesenha uma parte da tela sem derrubar o foco de quem usa o teclado: se o foco estava lá
 * dentro, volta para o mesmo elemento depois (ou para o `fallback`, se ele sumiu).
 * @param container Parte da tela que será redesenhada.
 * @param render Redesenha.
 * @param fallback Onde focar se o elemento sumiu.
 */
export function preservingFocus(container: Element, render: () => void, fallback?: () => HTMLElement | null): void {
  const memory = container.contains(document.activeElement) ? rememberFocus() : null;
  render();
  if (memory && !memory.restore()) fallback?.()?.focus();
}

/**
 * Quando o foco estava numa tela que acabou de ser escondida, leva-o para o título da nova tela,
 * em vez de deixá-lo cair no começo da página. Não faz nada na TV, que move o foco sozinha.
 * @param target Elemento que recebe o foco.
 */
export function rescueFocus(target: HTMLElement): void {
  const active = document.activeElement;
  if (active && active !== document.body && active.closest('[hidden]') && !isTvPlatform()) target.focus();
}

/**
 * Diz algo ao leitor de tela, sem mover o foco (ex.: quantos resultados a busca achou).
 * @param message Texto.
 */
export function announce(message: string): void {
  $('srStatus').textContent = message;
}

/**
 * Mostra um erro de formulário em texto (que fica na tela até a próxima tentativa), marca os
 * campos com problema como inválidos e leva o foco ao primeiro deles.
 * @param errorElement Elemento (com `role="alert"`) onde o erro aparece.
 * @param message Texto do erro.
 * @param fields Campos com problema.
 */
export function showFormError(errorElement: HTMLElement, message: string, fields: HTMLElement[]): void {
  errorElement.textContent = message;
  errorElement.hidden = false;
  fields.forEach(field => {
    field.setAttribute('aria-invalid', 'true');
    field.setAttribute('aria-describedby', errorElement.id);
  });
  fields[0]?.focus();
}

/**
 * Apaga o erro de um formulário e a marca de inválido dos campos.
 * @param errorElement Elemento onde o erro aparecia.
 * @param fields Campos do formulário.
 */
export function clearFormError(errorElement: HTMLElement, fields: HTMLElement[]): void {
  errorElement.textContent = '';
  errorElement.hidden = true;
  fields.forEach(field => field.removeAttribute('aria-invalid'));
}
