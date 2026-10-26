'use strict';
/**
 * Adaptação para controle remoto de TV (LG webOS): navegação pelas setas entre os
 * elementos da tela, botão Voltar e botões de mídia. Carregado só no pacote da TV.
 */

/** Códigos de tecla do controle LG que não chegam com `event.key` padronizado. */
const TV_KEY = { BACK:461, PLAY:415, PAUSE:19, STOP:413, FF:417, RW:412, RED:403, GREEN:404, YELLOW:405, BLUE:406 };

/** Seletor dos elementos que recebem foco pelas setas. */
const FOCUSABLE = 'button:not([disabled]):not(.star),a[href],input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea,[tabindex]:not([tabindex="-1"]),.dd-menu li,#cats li,#items li[data-i],#sideList li[data-x],.eps li[data-e]';

/** Mapa das teclas de seta para a direção da navegação. */
const ARROW_DIRECTIONS = { ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right' };

document.documentElement.classList.add('tv');

/**
 * Indica se o elemento está visível na tela.
 * @param {Element} element Elemento.
 * @returns {boolean} `true` se ocupa espaço e não está oculto.
 */
const isShown = element => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden'; };

/**
 * Área onde a navegação acontece agora: diálogo aberto, player ou o app.
 * @returns {ParentNode} Raiz da navegação.
 */
function getNavigationRoot(){
  const openDialog = document.querySelector('dialog[open]');
  if (openDialog) return openDialog;
  if (!$('player').hidden) return $('side').hidden ? $('player') : $('side');
  return document;
}

/**
 * Elementos focáveis visíveis dentro da área atual.
 * @returns {HTMLElement[]} Candidatos.
 */
function getFocusCandidates(){
  const navigationRoot = getNavigationRoot();
  return [...navigationRoot.querySelectorAll(FOCUSABLE)].filter(element => isShown(element) && (navigationRoot !== document || !element.closest('#player,dialog')));
}

/**
 * Move o foco para o elemento mais próximo na direção pedida. Para cima/baixo vai sempre
 * para a linha seguinte (sem pular linhas) e, nela, escolhe o mais alinhado na horizontal;
 * para os lados só anda dentro da mesma linha.
 * @param {'up'|'down'|'left'|'right'} direction Direção.
 * @returns {boolean} `true` se o foco mudou.
 */
function moveFocus(direction){
  const candidateList = getFocusCandidates(); if (!candidateList.length) return false;
  const focusedElement = document.activeElement;
  if (!focusedElement || focusedElement === document.body || !candidateList.includes(focusedElement)) { focusElement(candidateList[0]); return true; }
  const focusedRect = focusedElement.getBoundingClientRect(), focusedCenterX = focusedRect.left + focusedRect.width / 2, focusedCenterY = focusedRect.top + focusedRect.height / 2;
  const isVertical = direction === 'up' || direction === 'down';
  const found = [];
  for (const element of candidateList) {
    if (element === focusedElement) continue;
    const candidateRect = element.getBoundingClientRect();
    let mainDistance;
    if (direction === 'down') mainDistance = candidateRect.top - focusedRect.bottom;
    else if (direction === 'up') mainDistance = focusedRect.top - candidateRect.bottom;
    else if (direction === 'right') mainDistance = candidateRect.left - focusedRect.right;
    else mainDistance = focusedRect.left - candidateRect.right;
    if (mainDistance < -2) continue;
    const overlap = isVertical ? Math.min(focusedRect.right, candidateRect.right) - Math.max(focusedRect.left, candidateRect.left) : Math.min(focusedRect.bottom, candidateRect.bottom) - Math.max(focusedRect.top, candidateRect.top);
    const sideDistance = isVertical ? Math.abs(candidateRect.left + candidateRect.width / 2 - focusedCenterX) : Math.abs(candidateRect.top + candidateRect.height / 2 - focusedCenterY);
    found.push({ element, main: Math.max(mainDistance, 0), side: sideDistance, overlap });
  }
  if (!found.length) return false;
  let pool = found;
  if (isVertical) {
    const nearestDistance = Math.min(...found.map(candidate => candidate.main));
    pool = found.filter(candidate => candidate.main <= nearestDistance + 8);
  } else {
    pool = found.filter(candidate => candidate.overlap > 0);
    if (!pool.length) return false;
  }
  pool.sort((first, second) => isVertical ? first.side - second.side : (first.main + first.side * 2) - (second.main + second.side * 2));
  focusElement(pool[0].element);
  return true;
}

/**
 * Foca um elemento e o rola para dentro da tela.
 * @param {HTMLElement} element Elemento.
 * @returns {void}
 */
function focusElement(element){ if (!element.hasAttribute('tabindex') && element.matches('li')) element.tabIndex = -1; element.focus({ preventScroll:true }); element.scrollIntoView({ block:'center', inline:'nearest' }); }

/**
 * Executa o botão Voltar do controle: fecha o que estiver aberto, um nível por vez.
 * Na tela inicial, fecha o aplicativo.
 * @returns {void}
 */
function tvBack(){
  const openDialog = document.querySelector('dialog[open]');
  if (openDialog) { openDialog.close(); return; }
  if (!$('plMenu').hidden) { togglePlaylistMenu(false); $('plSel').focus(); return; }
  if (!$('player').hidden) {
    if (!$('side').hidden) { $('side').hidden = true; document.activeElement.blur(); }
    else if (inPlayerUi()) { document.activeElement.blur(); playerScreen.classList.add('idle'); }
    else closePlayer();
    return;
  }
  if (!$('section').hidden) { show('home'); focusFirst(); return; }
  confirmExit();
}

/**
 * Pergunta antes de fechar o app (Voltar na tela inicial), como pedem as diretrizes da LG.
 * O foco começa em "Cancelar"; Voltar de novo fecha só a pergunta.
 * @returns {void}
 */
function confirmExit(){
  let exitDialog = document.getElementById('dExit');
  if (!exitDialog) {
    document.body.insertAdjacentHTML('beforeend', `<dialog id="dExit" style="width:min(380px,calc(100vw - 32px))"><div class="dlg"><h3>Sair do Zapp IPTV?</h3><div class="row"><button class="btn" id="exitNo">Cancelar</button><button class="btn primary" id="exitYes">Sair</button></div></div></dialog>`);
    exitDialog = document.getElementById('dExit');
    document.getElementById('exitNo').onclick = () => exitDialog.close();
    document.getElementById('exitYes').onclick = () => window.close();
  }
  exitDialog.showModal();
  focusElement(document.getElementById('exitNo'));
}

/**
 * Indica se o foco está nos controles do player (barra de botões ou topo).
 * @returns {boolean} `true` se um controle do player está focado.
 */
const inPlayerUi = () => { const focusedElement = document.activeElement; return !!focusedElement && focusedElement !== document.body && focusedElement !== $('v') && $('player').contains(focusedElement) && !$('side').contains(focusedElement); };

/**
 * Setas no player. Com os controles escondidos: ↑/↓ mostram os controles e focam o
 * play/pause; ←/→ trocam de canal (ao vivo) ou avançam/voltam 10 s (filmes e séries).
 * Com os controles focados ou a lista lateral aberta, as setas navegam entre os itens.
 * @param {'up'|'down'|'left'|'right'} direction Direção.
 * @returns {void}
 */
function playerArrow(direction){
  poke();
  if (!$('side').hidden || inPlayerUi()) { moveFocus(direction); return; }
  if (direction === 'up' || direction === 'down') { focusElement($('cPlay')); return; }
  const isLive = currentMedia && currentMedia.kind === 'live';
  if (isLive) stepChannel(direction === 'left' ? -1 : 1);
  else video.currentTime += direction === 'left' ? -10 : 10;
}

/** Quando os controles do player somem por inatividade, tira o foco deles: as setas voltam a trocar de canal. */
new MutationObserver(() => { if (playerScreen.classList.contains('idle') && inPlayerUi()) document.activeElement.blur(); }).observe(playerScreen, { attributes:true, attributeFilter:['class'] });

/** Campos de texto: só entram em edição (e abrem o teclado virtual da TV) ao apertar OK. */
const TEXT_FIELD_SELECTOR = 'input[type=text],input[type=search],input[type=url],input[type=password],input:not([type]),textarea';

/**
 * Indica se o elemento é um campo de texto controlado pelo modo de edição.
 * @param {EventTarget} element Elemento.
 * @returns {boolean} `true` se for campo de texto.
 */
const isTextField = element => !!(element && element.matches && element.matches(TEXT_FIELD_SELECTOR));

/**
 * Coloca o campo em edição: libera a digitação e reabre o foco para a TV mostrar o teclado.
 * @param {HTMLInputElement|HTMLTextAreaElement} textField Campo.
 * @returns {void}
 */
function startEdit(textField){ textField.readOnly = false; textField.dataset.editing = '1'; textField.blur(); textField.focus(); }

/**
 * Sai da edição do campo, mantendo o foco nele para continuar navegando.
 * @param {HTMLInputElement|HTMLTextAreaElement} textField Campo.
 * @returns {void}
 */
function stopEdit(textField){ delete textField.dataset.editing; textField.readOnly = true; }

/** Ao chegar num campo pela navegação, deixa-o só leitura para não abrir o teclado sozinho. */
document.addEventListener('focusin', event => { if (isTextField(event.target) && !event.target.dataset.editing) event.target.readOnly = true; });
/** Ao sair do campo, encerra a edição. */
document.addEventListener('focusout', event => { if (isTextField(event.target) && event.target.dataset.editing && event.relatedTarget) stopEdit(event.target); });

/** Se o foco inicial em "TV ao vivo" já foi feito. */
let startFocused = false;

/**
 * Coloca o foco no primeiro elemento da área atual, se nada estiver focado.
 * Na abertura do app, começa sempre em "TV ao vivo", assim que a tela inicial aparece.
 * No player, o foco só vai para os controles quando o usuário aperta ↑/↓; na lista lateral,
 * começa no item atual.
 * @returns {void}
 */
function focusFirst(){
  if (!startFocused) {
    const liveTile = document.querySelector('#home:not([hidden]) .tile.live');
    if (liveTile) { startFocused = true; focusElement(liveTile); return; }
  }
  const focusedElement = document.activeElement;
  if (focusedElement && focusedElement !== document.body && isShown(focusedElement) && getFocusCandidates().includes(focusedElement)) return;
  if (!$('player').hidden && !document.querySelector('dialog[open]')) {
    if (focusedElement && focusedElement !== document.body && !$('player').contains(focusedElement)) focusedElement.blur();
    if (!$('side').hidden) { const sideList = $('sideList'), sideItem = sideList.querySelector('li.on') || sideList.querySelector('li.cur') || sideList.querySelector('li[data-x]'); if (sideItem) focusElement(sideItem); }
    return;
  }
  const mainElement = getNavigationRoot() === document ? document.querySelector('#home:not([hidden]) .tile, #section:not([hidden]) #items li.on, #section:not([hidden]) #items [data-i]') : null;
  const elementToFocus = mainElement && isShown(mainElement) ? mainElement : getFocusCandidates()[0];
  if (elementToFocus) focusElement(elementToFocus);
}

/**
 * Trata as teclas do player aberto: mídia, teclas coloridas, setas e OK. Com os controles
 * escondidos (foco fora deles), o OK pausa/retoma e mostra os controles.
 * @param {KeyboardEvent} event Evento de tecla.
 * @returns {void}
 */
function handlePlayerKey(event){
  if (event.keyCode === TV_KEY.PLAY || event.keyCode === TV_KEY.PAUSE) { event.preventDefault(); $('cPlay').click(); }
  else if (event.keyCode === TV_KEY.STOP) { event.preventDefault(); closePlayer(); }
  else if (event.keyCode === TV_KEY.FF) { event.preventDefault(); $('cFwd10').click(); }
  else if (event.keyCode === TV_KEY.RW) { event.preventDefault(); $('cBack10').click(); }
  else if (event.keyCode === TV_KEY.RED) { event.preventDefault(); $('cList').click(); }
  else if (event.keyCode === TV_KEY.GREEN && $('cEpg')) { event.preventDefault(); $('cEpg').click(); }
  else if (event.key === 'Enter' && event.target.matches && event.target.matches('#sideList li[data-x]')) { event.preventDefault(); event.stopImmediatePropagation(); event.target.click(); }
  else {
    const direction = ARROW_DIRECTIONS[event.key];
    if (direction && !(direction !== 'up' && direction !== 'down' && event.target.matches && event.target.matches('input[type=range]'))) { event.preventDefault(); event.stopImmediatePropagation(); playerArrow(direction); }
    else if (event.key === 'Enter' && inPlayerUi()) poke();
    else if (event.key === 'Enter' && $('side').hidden) { event.preventDefault(); event.stopImmediatePropagation(); $('cPlay').click(); poke(); }
  }
}

/**
 * Trata as teclas do controle antes dos atalhos do app. Num campo de texto em edição, o OK
 * confirma: sai da edição e deixa o Enter seguir para o app (ex.: PIN).
 * @param {KeyboardEvent} event Evento de tecla.
 */
document.addEventListener('keydown', event => {
  if (event.keyCode === TV_KEY.BACK) {
    event.preventDefault(); event.stopImmediatePropagation();
    if (isTextField(event.target) && event.target.dataset.editing) stopEdit(event.target); else tvBack();
    return;
  }
  const isPlayerOpen = !$('player').hidden && !document.querySelector('dialog[open]');
  if (isPlayerOpen) { handlePlayerKey(event); return; }
  const target = event.target;
  if (event.key === 'Enter' && target.matches && target.matches('#cats li,#items li[data-i],.eps li[data-e],input[type=checkbox],input[type=radio]')) { event.preventDefault(); target.click(); return; }
  if (event.key === 'Enter' && isTextField(target) && !(target.matches('textarea') && target.dataset.editing)) {
    if (target.dataset.editing) { stopEdit(target); return; }
    event.preventDefault(); event.stopImmediatePropagation(); startEdit(target);
    return;
  }
  if (event.keyCode === TV_KEY.YELLOW && target.matches && target.matches('#items [data-i]')) { const starButton = target.querySelector('.star'); if (starButton) { event.preventDefault(); starButton.click(); } return; }
  const direction = ARROW_DIRECTIONS[event.key]; if (!direction) return;
  if (target.closest && target.closest('#plMenu')) return;
  if (target.id === 'plSel' && direction === 'down') return;
  if (isTextField(target) && target.dataset.editing) { if (direction === 'left' || direction === 'right') return; stopEdit(target); }
  if (target.matches && target.matches('input[type=range]') && (direction === 'left' || direction === 'right')) return;
  event.preventDefault(); event.stopImmediatePropagation();
  moveFocus(direction);
}, true);

/**
 * Abas de temporada da série: o clique redesenha o diálogo e o botão focado some. Devolve o
 * foco para a aba recém-criada da mesma temporada, para o usuário descer até os episódios.
 */
document.addEventListener('click', event => {
  const seasonButton = event.target;
  if (!seasonButton.matches || !seasonButton.matches('.stabs [data-s]') || seasonButton.isConnected) return;
  const newSeasonButton = document.querySelector('dialog[open] .stabs [data-s="' + seasonButton.dataset.s + '"]');
  if (newSeasonButton) focusElement(newSeasonButton);
});

/** Mantém sempre um elemento focado quando a tela muda. */
new MutationObserver(() => requestAnimationFrame(focusFirst)).observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['hidden', 'open'] });
focusFirst();
