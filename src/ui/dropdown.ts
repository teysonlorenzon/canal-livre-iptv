import { closest, query, queryAll } from '../core/dom';
import { esc } from '../core/utils';

/** Opção de um seletor personalizado. */
export interface DropdownOption {
  value: string;
  label: string;
}

/**
 * Markup de um seletor personalizado (botão que abre uma lista de opções), no lugar do `select`
 * nativo, cuja lista trava o app na TV. O valor escolhido fica em `data-value` no elemento raiz.
 * @param id `id` do elemento raiz.
 * @param label Nome acessível do seletor (ex.: "Ordenar").
 * @param options Opções; a primeira começa escolhida.
 * @returns HTML.
 */
export function dropdownHtml(id: string, label: string, options: DropdownOption[]): string {
  const items = options
    .map(
      (option, index) =>
        `<li role="option" tabindex="-1" data-value="${esc(option.value)}" aria-selected="${index === 0}"><b>${esc(option.label)}</b></li>`,
    )
    .join('');
  const first = options[0];
  return `<div class="dd" id="${id}" data-label="${esc(label)}" data-value="${esc(first?.value ?? '')}">
  <button class="dd-btn" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}Menu" aria-label="${esc(label)}: ${esc(first?.label ?? '')}" title="${esc(label)}"><span>${esc(first?.label ?? '')}</span></button>
  <ul class="dd-menu" id="${id}Menu" role="listbox" aria-label="${esc(label)}" hidden>${items}</ul>
</div>`;
}

/**
 * Valor escolhido num seletor personalizado.
 * @param root Elemento raiz do seletor.
 * @returns Valor da opção escolhida.
 */
export function dropdownValue(root: HTMLElement): string {
  return root.dataset.value ?? '';
}

/**
 * Escolhe uma opção, sem avisar quem ouve as mudanças.
 * @param root Elemento raiz do seletor.
 * @param value Valor da opção.
 */
export function setDropdownValue(root: HTMLElement, value: string): void {
  const chosen = queryAll(root, 'li').find(item => item.dataset.value === value);
  if (!chosen) return;
  root.dataset.value = value;
  queryAll(root, 'li').forEach(item => item.setAttribute('aria-selected', String(item === chosen)));
  const text = chosen.textContent;
  const buttonText = query(root, '.dd-btn span');
  if (buttonText) buttonText.textContent = text;
  query(root, '.dd-btn')?.setAttribute('aria-label', `${root.dataset.label ?? ''}: ${text}`);
}

/**
 * Esconde ou mostra opções do seletor.
 * @param root Elemento raiz do seletor.
 * @param values Valores das opções.
 * @param hidden `true` para esconder.
 */
export function setDropdownOptionsHidden(root: HTMLElement, values: string[], hidden: boolean): void {
  queryAll(root, 'li')
    .filter(item => values.includes(item.dataset.value ?? ''))
    .forEach(item => {
      item.hidden = hidden;
    });
}

/**
 * Abre ou fecha a lista de opções.
 * @param root Elemento raiz do seletor.
 * @param open `true` para abrir.
 * @param focus Ao abrir, focar a opção escolhida (navegação por teclado ou controle).
 */
export function toggleDropdown(root: HTMLElement, open: boolean, focus?: boolean): void {
  const menu = query(root, '.dd-menu');
  if (!menu) return;
  menu.hidden = !open;
  query(root, '.dd-btn')?.setAttribute('aria-expanded', String(open));
  if (open && focus) (query(menu, '[aria-selected=true]:not([hidden])') ?? query(menu, 'li:not([hidden])'))?.focus();
}

/**
 * Liga os eventos de um seletor personalizado: clique, teclado (setas, Home, End, Enter, Espaço,
 * Esc), clique fora para fechar. Chamada uma vez, na ordem de `main.ts`.
 * @param root Elemento raiz do seletor.
 * @param onChange Chamada quando o usuário escolhe uma opção diferente da atual.
 */
export function initDropdown(root: HTMLElement, onChange: (value: string) => void): void {
  const button = query(root, '.dd-btn');
  const menu = query(root, '.dd-menu');
  if (!button || !menu) return;

  /**
   * Escolhe a opção, fecha a lista e devolve o foco ao botão.
   * @param item Opção escolhida.
   */
  const pick = (item: HTMLElement): void => {
    const value = item.dataset.value ?? '';
    const changed = value !== dropdownValue(root);
    setDropdownValue(root, value);
    toggleDropdown(root, false);
    button.focus();
    if (changed) onChange(value);
  };

  button.onclick = () => toggleDropdown(root, !!menu.hidden, true);

  button.onkeydown = keyEvent => {
    if (['ArrowDown', 'ArrowUp', ' '].includes(keyEvent.key)) {
      keyEvent.preventDefault();
      toggleDropdown(root, true, true);
    }
  };

  menu.onclick = clickEvent => {
    const item = closest(clickEvent.target, 'li');
    if (item) pick(item);
  };

  menu.onkeydown = keyEvent => {
    const items = queryAll(menu, 'li:not([hidden])');
    const focusedIndex = items.findIndex(item => item === document.activeElement);
    const focusItem = (targetIndex: number): void => {
      keyEvent.preventDefault();
      items[(targetIndex + items.length) % items.length]?.focus();
    };
    if (keyEvent.key === 'ArrowDown') focusItem(focusedIndex + 1);
    else if (keyEvent.key === 'ArrowUp') focusItem(focusedIndex - 1);
    else if (keyEvent.key === 'Home') focusItem(0);
    else if (keyEvent.key === 'End') focusItem(items.length - 1);
    else if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
      keyEvent.preventDefault();
      const focusedItem = items[focusedIndex];
      if (focusedItem) pick(focusedItem);
    } else if (keyEvent.key === 'Escape') {
      keyEvent.preventDefault();
      keyEvent.stopPropagation();
      toggleDropdown(root, false);
      button.focus();
    } else if (keyEvent.key === 'Tab') toggleDropdown(root, false);
  };

  document.addEventListener('click', clickEvent => {
    if (!menu.hidden && !root.contains(clickEvent.target instanceof Node ? clickEvent.target : null)) toggleDropdown(root, false);
  });
}
