'use strict';
/**
 * Adaptação para controle remoto de TV (LG webOS): navegação pelas setas entre os
 * elementos da tela, botão Voltar e botões de mídia. Carregado só no pacote da TV.
 */

/** Códigos de tecla do controle LG que não chegam com `e.key` padronizado. */
const TV_KEY = { BACK:461, PLAY:415, PAUSE:19, STOP:413, FF:417, RW:412, RED:403, GREEN:404, YELLOW:405, BLUE:406 };

/** Seletor dos elementos que recebem foco pelas setas. */
const FOCUSABLE = 'button:not([disabled]):not(.star),a[href],input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea,[tabindex]:not([tabindex="-1"]),.dd-menu li,#cats li,#items li[data-i],#sideList li[data-x],.eps li[data-e]';

document.documentElement.classList.add('tv');

/**
 * Indica se o elemento está visível na tela.
 * @param {Element} el Elemento.
 * @returns {boolean} `true` se ocupa espaço e não está oculto.
 */
const isShown = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };

/**
 * Área onde a navegação acontece agora: diálogo aberto, player ou o app.
 * @returns {ParentNode} Raiz da navegação.
 */
function navRoot(){
  const dlg = document.querySelector('dialog[open]');
  if (dlg) return dlg;
  if (!$('player').hidden) return $('side').hidden ? $('player') : $('side');
  return document;
}

/**
 * Elementos focáveis visíveis dentro da área atual.
 * @returns {HTMLElement[]} Candidatos.
 */
function candidates(){
  const root = navRoot();
  return [...root.querySelectorAll(FOCUSABLE)].filter(el => isShown(el) && (root !== document || !el.closest('#player,dialog')));
}

/**
 * Move o foco para o elemento mais próximo na direção pedida. Para cima/baixo vai sempre
 * para a linha seguinte (sem pular linhas) e, nela, escolhe o mais alinhado na horizontal;
 * para os lados só anda dentro da mesma linha.
 * @param {'up'|'down'|'left'|'right'} dir Direção.
 * @returns {boolean} `true` se o foco mudou.
 */
function moveFocus(dir){
  const list = candidates(); if (!list.length) return false;
  const cur = document.activeElement;
  if (!cur || cur === document.body || !list.includes(cur)) { focusEl(list[0]); return true; }
  const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  const vert = dir === 'up' || dir === 'down';
  const found = [];
  for (const el of list) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect();
    let main;
    if (dir === 'down') main = b.top - a.bottom;
    else if (dir === 'up') main = a.top - b.bottom;
    else if (dir === 'right') main = b.left - a.right;
    else main = a.left - b.right;
    if (main < -2) continue;
    const overlap = vert ? Math.min(a.right, b.right) - Math.max(a.left, b.left) : Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    const side = vert ? Math.abs(b.left + b.width / 2 - ax) : Math.abs(b.top + b.height / 2 - ay);
    found.push({ el, main: Math.max(main, 0), side, overlap });
  }
  if (!found.length) return false;
  let pool = found;
  if (vert) {
    const near = Math.min(...found.map(c => c.main));
    pool = found.filter(c => c.main <= near + 8);
  } else {
    pool = found.filter(c => c.overlap > 0);
    if (!pool.length) return false;
  }
  pool.sort((x, y) => vert ? x.side - y.side : (x.main + x.side * 2) - (y.main + y.side * 2));
  focusEl(pool[0].el);
  return true;
}

/**
 * Foca um elemento e o rola para dentro da tela.
 * @param {HTMLElement} el Elemento.
 * @returns {void}
 */
function focusEl(el){ if (!el.hasAttribute('tabindex') && el.matches('li')) el.tabIndex = -1; el.focus({ preventScroll:true }); el.scrollIntoView({ block:'center', inline:'nearest' }); }

/**
 * Executa o botão Voltar do controle: fecha o que estiver aberto, um nível por vez.
 * Na tela inicial, fecha o aplicativo.
 * @returns {void}
 */
function tvBack(){
  const dlg = document.querySelector('dialog[open]');
  if (dlg) { dlg.close(); return; }
  if (!$('plMenu').hidden) { togglePlMenu(false); $('plSel').focus(); return; }
  if (!$('player').hidden) {
    if (!$('side').hidden) { $('side').hidden = true; document.activeElement.blur(); }
    else if (inPlayerUi()) { document.activeElement.blur(); player.classList.add('idle'); }
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
  let d = document.getElementById('dExit');
  if (!d) {
    document.body.insertAdjacentHTML('beforeend', `<dialog id="dExit" style="width:min(380px,calc(100vw - 32px))"><div class="dlg"><h3>Sair do Zapp IPTV?</h3><div class="row"><button class="btn" id="exitNo">Cancelar</button><button class="btn primary" id="exitYes">Sair</button></div></div></dialog>`);
    d = document.getElementById('dExit');
    document.getElementById('exitNo').onclick = () => d.close();
    document.getElementById('exitYes').onclick = () => window.close();
  }
  d.showModal();
  focusEl(document.getElementById('exitNo'));
}

/**
 * Indica se o foco está nos controles do player (barra de botões ou topo).
 * @returns {boolean} `true` se um controle do player está focado.
 */
const inPlayerUi = () => { const a = document.activeElement; return !!a && a !== document.body && a !== $('v') && $('player').contains(a) && !$('side').contains(a); };

/**
 * Setas no player. Com os controles escondidos: ↑/↓ mostram os controles e focam o
 * play/pause; ←/→ trocam de canal (ao vivo) ou avançam/voltam 10 s (filmes e séries).
 * Com os controles focados ou a lista lateral aberta, as setas navegam entre os itens.
 * @param {'up'|'down'|'left'|'right'} dir Direção.
 * @returns {void}
 */
function playerArrow(dir){
  poke();
  if (!$('side').hidden || inPlayerUi()) { moveFocus(dir); return; }
  if (dir === 'up' || dir === 'down') { focusEl($('cPlay')); return; }
  const live = playing && playing.kind === 'live';
  if (live) step(dir === 'left' ? -1 : 1);
  else v.currentTime += dir === 'left' ? -10 : 10;
}

/** Quando os controles do player somem por inatividade, tira o foco deles: as setas voltam a trocar de canal. */
new MutationObserver(() => { if (player.classList.contains('idle') && inPlayerUi()) document.activeElement.blur(); }).observe(player, { attributes:true, attributeFilter:['class'] });

/** Campos de texto: só entram em edição (e abrem o teclado virtual da TV) ao apertar OK. */
const TEXT = 'input[type=text],input[type=search],input[type=url],input[type=password],input:not([type]),textarea';

/**
 * Indica se o elemento é um campo de texto controlado pelo modo de edição.
 * @param {EventTarget} el Elemento.
 * @returns {boolean} `true` se for campo de texto.
 */
const isText = el => !!(el && el.matches && el.matches(TEXT));

/**
 * Coloca o campo em edição: libera a digitação e reabre o foco para a TV mostrar o teclado.
 * @param {HTMLInputElement|HTMLTextAreaElement} el Campo.
 * @returns {void}
 */
function startEdit(el){ el.readOnly = false; el.dataset.editing = '1'; el.blur(); el.focus(); }

/**
 * Sai da edição do campo, mantendo o foco nele para continuar navegando.
 * @param {HTMLInputElement|HTMLTextAreaElement} el Campo.
 * @returns {void}
 */
function stopEdit(el){ delete el.dataset.editing; el.readOnly = true; }

/** Ao chegar num campo pela navegação, deixa-o só leitura para não abrir o teclado sozinho. */
document.addEventListener('focusin', e => { if (isText(e.target) && !e.target.dataset.editing) e.target.readOnly = true; });
/** Ao sair do campo, encerra a edição. */
document.addEventListener('focusout', e => { if (isText(e.target) && e.target.dataset.editing && e.relatedTarget) stopEdit(e.target); });

/** Se o foco inicial em "TV ao vivo" já foi feito. */
let startFocused = false;

/**
 * Coloca o foco no primeiro elemento da área atual, se nada estiver focado.
 * Na abertura do app, começa sempre em "TV ao vivo", assim que a tela inicial aparece.
 * @returns {void}
 */
function focusFirst(){
  if (!startFocused) {
    const live = document.querySelector('#home:not([hidden]) .tile.live');
    if (live) { startFocused = true; focusEl(live); return; }
  }
  const cur = document.activeElement;
  if (cur && cur !== document.body && isShown(cur) && candidates().includes(cur)) return;
  // No player, o foco só vai para os controles quando o usuário aperta ↑/↓; na lista lateral, começa no item atual.
  if (!$('player').hidden && !document.querySelector('dialog[open]')) {
    if (cur && cur !== document.body && !$('player').contains(cur)) cur.blur();
    if (!$('side').hidden) { const sl = $('sideList'), li = sl.querySelector('li.on') || sl.querySelector('li.cur') || sl.querySelector('li[data-x]'); if (li) focusEl(li); }
    return;
  }
  const main = navRoot() === document ? document.querySelector('#home:not([hidden]) .tile, #section:not([hidden]) #items li.on, #section:not([hidden]) #items [data-i]') : null;
  const el = main && isShown(main) ? main : candidates()[0];
  if (el) focusEl(el);
}

/**
 * Trata as teclas do controle antes dos atalhos do app.
 * @param {KeyboardEvent} e Evento de tecla.
 */
document.addEventListener('keydown', e => {
  if (e.keyCode === TV_KEY.BACK) {
    e.preventDefault(); e.stopImmediatePropagation();
    if (isText(e.target) && e.target.dataset.editing) stopEdit(e.target); else tvBack();
    return;
  }
  const playerOpen = !$('player').hidden && !document.querySelector('dialog[open]');
  if (playerOpen) {
    if (e.keyCode === TV_KEY.PLAY || e.keyCode === TV_KEY.PAUSE) { e.preventDefault(); $('cPlay').click(); }
    else if (e.keyCode === TV_KEY.STOP) { e.preventDefault(); closePlayer(); }
    else if (e.keyCode === TV_KEY.FF) { e.preventDefault(); $('cFwd10').click(); }
    else if (e.keyCode === TV_KEY.RW) { e.preventDefault(); $('cBack10').click(); }
    else if (e.keyCode === TV_KEY.RED) { e.preventDefault(); $('cList').click(); }
    else if (e.keyCode === TV_KEY.GREEN && $('cEpg')) { e.preventDefault(); $('cEpg').click(); }
    else if (e.key === 'Enter' && e.target.matches && e.target.matches('#sideList li[data-x]')) { e.preventDefault(); e.stopImmediatePropagation(); e.target.click(); }
    else {
      const dir = { ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right' }[e.key];
      if (dir && !(dir !== 'up' && dir !== 'down' && e.target.matches && e.target.matches('input[type=range]'))) { e.preventDefault(); e.stopImmediatePropagation(); playerArrow(dir); }
      else if (e.key === 'Enter' && inPlayerUi()) poke();
      // OK com os controles escondidos (foco fora deles): pausa/retoma e mostra os controles.
      else if (e.key === 'Enter' && $('side').hidden) { e.preventDefault(); e.stopImmediatePropagation(); $('cPlay').click(); poke(); }
    }
    return;
  }
  const t0 = e.target;
  if (e.key === 'Enter' && t0.matches && t0.matches('#cats li,#items li[data-i],.eps li[data-e],input[type=checkbox],input[type=radio]')) { e.preventDefault(); t0.click(); return; }
  if (e.key === 'Enter' && isText(t0) && !(t0.matches('textarea') && t0.dataset.editing)) {
    // Em edição, o OK confirma: sai da edição e deixa o Enter seguir para o app (ex.: PIN).
    if (t0.dataset.editing) { stopEdit(t0); return; }
    e.preventDefault(); e.stopImmediatePropagation(); startEdit(t0);
    return;
  }
  if (e.keyCode === TV_KEY.YELLOW && t0.matches && t0.matches('#items [data-i]')) { const st = t0.querySelector('.star'); if (st) { e.preventDefault(); st.click(); } return; }
  const dirs = { ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right' };
  const dir = dirs[e.key]; if (!dir) return;
  const t = e.target;
  if (t.closest && t.closest('#plMenu')) return;
  if (t.id === 'plSel' && dir === 'down') return;
  if (isText(t) && t.dataset.editing) { if (dir === 'left' || dir === 'right') return; stopEdit(t); }
  if (t.matches && t.matches('input[type=range]') && (dir === 'left' || dir === 'right')) return;
  e.preventDefault(); e.stopImmediatePropagation();
  moveFocus(dir);
}, true);

/**
 * Abas de temporada da série: o clique redesenha o diálogo e o botão focado some. Devolve o
 * foco para a aba recém-criada da mesma temporada, para o usuário descer até os episódios.
 */
document.addEventListener('click', e => {
  const b = e.target;
  if (!b.matches || !b.matches('.stabs [data-s]') || b.isConnected) return;
  const nb = document.querySelector('dialog[open] .stabs [data-s="' + b.dataset.s + '"]');
  if (nb) focusEl(nb);
});

/** Mantém sempre um elemento focado quando a tela muda. */
new MutationObserver(() => requestAnimationFrame(focusFirst)).observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['hidden', 'open'] });
focusFirst();
