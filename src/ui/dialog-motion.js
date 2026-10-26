'use strict';
/**
 * Fechamento suave dos diálogos. O diálogo fecha na hora (o resto do app, inclusive o Voltar
 * da TV e do Android, conta com isso) e, no lugar dele, uma cópia só visual some aos poucos
 * junto com o fundo escuro. A cópia não tem ids, não recebe cliques nem foco e sai em 0,18 s.
 * Com "reduzir movimento" ligado no sistema, fecha sem efeito.
 */

/** @type {number} Duração do efeito de fechamento (ms), igual à das animações `dialog-out`/`backdrop-out`. */
const DIALOG_CLOSE_DURATION = 180;
/** @type {number} Acima desta quantidade de elementos, a cópia vai sem conteúdo (só a moldura), para não pesar na TV. */
const DIALOG_GHOST_MAX_ELEMENTS = 1500;
/** @type {Function} `close()` original do navegador. */
const closeDialogInstantly = HTMLDialogElement.prototype.close;

/**
 * Cria a cópia visual de um diálogo aberto, na mesma posição e com a mesma rolagem.
 * @param {HTMLDialogElement} dialog Diálogo que vai fechar.
 * @returns {{dialogGhost: HTMLDivElement, backdropGhost: HTMLDivElement, scrollTop: number}} Cópia, fundo e rolagem.
 */
function createDialogGhost(dialog){
  const dialogBox = dialog.getBoundingClientRect();
  const dialogGhost = document.createElement('div'), backdropGhost = document.createElement('div');
  dialogGhost.className = 'dialog-ghost'; backdropGhost.className = 'dialog-ghost-backdrop';
  dialogGhost.setAttribute('aria-hidden', 'true'); backdropGhost.setAttribute('aria-hidden', 'true');
  dialogGhost.style.left = dialogBox.left + 'px'; dialogGhost.style.top = dialogBox.top + 'px';
  dialogGhost.style.width = dialogBox.width + 'px'; dialogGhost.style.height = dialogBox.height + 'px';
  if (dialog.getElementsByTagName('*').length <= DIALOG_GHOST_MAX_ELEMENTS) {
    [...dialog.childNodes].forEach(childNode => dialogGhost.appendChild(childNode.cloneNode(true)));
    dialogGhost.querySelectorAll('[id]').forEach(copiedElement => copiedElement.removeAttribute('id'));
    dialogGhost.querySelectorAll('input,select,textarea,button').forEach(copiedField => { copiedField.disabled = true; copiedField.tabIndex = -1; });
  }
  return { dialogGhost, backdropGhost, scrollTop:dialog.scrollTop };
}

/**
 * Fecha o diálogo e mostra a cópia que some aos poucos, por cima do diálogo que continuar
 * aberto (se houver) ou da página.
 * @param {string} [returnValue] Valor de retorno do diálogo.
 * @returns {void}
 */
HTMLDialogElement.prototype.close = function closeWithFade(returnValue){
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!this.open || reduceMotion) return closeDialogInstantly.apply(this, arguments);
  const { dialogGhost, backdropGhost, scrollTop } = createDialogGhost(this);
  closeDialogInstantly.apply(this, arguments);
  const openDialogs = document.querySelectorAll('dialog[open]');
  const ghostParent = openDialogs.length ? openDialogs[openDialogs.length - 1] : document.body;
  ghostParent.appendChild(backdropGhost); ghostParent.appendChild(dialogGhost);
  dialogGhost.scrollTop = scrollTop;
  setTimeout(() => { backdropGhost.remove(); dialogGhost.remove(); }, DIALOG_CLOSE_DURATION);
};
