'use strict';
/**
 * Atualiza o seletor de lista do topo e a lista de listas nas configurações.
 * @returns {void}
 */
function renderPlSel(){
  $('plSelTxt').textContent = P ? P.name : pls.length ? 'Escolha uma lista' : 'Nenhuma lista';
  $('plMenu').innerHTML = pls.map(p => `<li role="option" tabindex="-1" data-id="${esc(p.id)}" aria-selected="${P && P.id === p.id}"><b>${esc(p.name)}</b><small>${p.type === 'xtream' ? 'Xtream' : p.url ? 'M3U' : 'Arquivo M3U'}</small></li>`).join('')
    + `<li class="dd-act" tabindex="-1" data-manage="1">${pls.length ? 'Gerenciar listas…' : 'Adicionar lista…'}</li>`;
  $('plList').innerHTML = pls.length ? pls.map(p => `<div class="plrow"><div><b>${esc(p.name)}</b><small>${p.type === 'xtream' ? 'Xtream · ' + esc(p.server) + ' · ' + esc(p.user) : p.url ? 'M3U · ' + esc(p.url) : 'M3U · arquivo local'}</small></div>
    <button class="btn sm" data-open="${p.id}">Abrir</button><button class="btn sm" data-reload="${p.id}">Atualizar</button><button class="btn sm danger" data-del="${p.id}">Remover</button></div>`).join('') : '<p class="hint">Nenhuma lista ainda. Adicione abaixo.</p>';
}
/**
 * Abre ou fecha o menu de listas do topo.
 * @param {boolean} open `true` para abrir.
 * @param {boolean} [focus] Ao abrir, focar a lista ativa (navegação por teclado).
 * @returns {void}
 */
function togglePlMenu(open, focus){
  $('plMenu').hidden = !open;
  $('plSel').setAttribute('aria-expanded', open);
  if (open && focus) ($('plMenu').querySelector('[aria-selected=true]') || $('plMenu').firstElementChild).focus();
}

/**
 * Executa a opção escolhida no menu de listas: abre a lista ou as configurações.
 * @param {HTMLLIElement} li Item escolhido.
 * @returns {void}
 */
function pickPlMenu(li){
  togglePlMenu(false);
  $('plSel').focus();
  if (li.dataset.manage) return openSettings();
  if (!P || P.id !== li.dataset.id) openPlaylist(li.dataset.id);
}

/**
 * Abre ou fecha o menu de listas.
 */
$('plSel').onclick = () => togglePlMenu($('plMenu').hidden);

/**
 * Abre o menu pelo teclado (setas, Enter ou Espaço) já com foco na lista ativa.
 * @param {KeyboardEvent} e Evento de tecla.
 */
$('plSel').onkeydown = e => {
  if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); togglePlMenu(true, true); }
};

/**
 * Escolhe uma opção do menu com o mouse.
 * @param {MouseEvent} e Evento de clique.
 */
$('plMenu').onclick = e => { const li = e.target.closest('li'); if (li) pickPlMenu(li); };

/**
 * Navegação por teclado no menu: setas, Home/End, Enter/Espaço escolhem, Esc/Tab fecham.
 * @param {KeyboardEvent} e Evento de tecla.
 */
$('plMenu').onkeydown = e => {
  const items = [...$('plMenu').children], i = items.indexOf(document.activeElement);
  const go = j => { e.preventDefault(); items[(j + items.length) % items.length].focus(); };
  if (e.key === 'ArrowDown') go(i + 1);
  else if (e.key === 'ArrowUp') go(i - 1);
  else if (e.key === 'Home') go(0);
  else if (e.key === 'End') go(items.length - 1);
  else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (i >= 0) pickPlMenu(items[i]); }
  else if (e.key === 'Escape') { e.preventDefault(); togglePlMenu(false); $('plSel').focus(); }
  else if (e.key === 'Tab') togglePlMenu(false);
};

/**
 * Fecha o menu de listas ao clicar fora dele.
 * @param {MouseEvent} e Evento de clique.
 */
document.addEventListener('click', e => { if (!$('plMenu').hidden && !$('plDd').contains(e.target)) togglePlMenu(false); });
/**
 * Trata os botões Abrir, Atualizar e Remover (com confirmação) das listas.
 * @param {MouseEvent} e Evento de clique.
 */
$('plList').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.open) { $('dSettings').close(); openPlaylist(b.dataset.open); }
  if (b.dataset.reload) { $('dSettings').close(); openPlaylist(b.dataset.reload, true); }
  if (b.dataset.del) {
    if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Confirmar'; return; }
    const id = b.dataset.del; pls = pls.filter(p => p.id !== id); store.set('pls', pls); store.del('ux_'+id); store.del('m3u_'+id);
    if (P && P.id === id) { P = null; D = null; store.del('active'); }
    renderPlSel(); renderHome();
  }
};

/**
 * Ativa uma lista e carrega seus dados.
 * @param {string} id Id da lista.
 * @param {boolean} [force] Baixar novamente a lista M3U em vez de usar o cache.
 * @returns {Promise<void>}
 */
async function openPlaylist(id, force){
  const p = pls.find(x => x.id === id); if (!p) return;
  P = p; store.set('active', id); loadUx(); unlocked.clear(); epgCache.clear(); lastError = ''; D = null; sectionJobs = {};
  renderPlSel();
  try {
    if (p.type === 'xtream') { D = await loadXtream(); preloadSections(); }
    else {
      let text = p.id === DEFAULT_PL.id ? DEFAULT_M3U : (!force || !p.url) ? store.get('m3u_' + p.id, null) : null;
      if (!text && p.url) { loading('Baixando lista…'); const r = await fetchT(p.url, 120000); text = await r.text(); store.set('m3u_' + p.id, text); }
      if (!text) throw new Error('Conteúdo da lista não encontrado. Adicione de novo.');
      loading('Organizando canais…');
      D = buildFromM3U(text);
      const eu = p.epg || D.epgUrl;
      if (eu) { loadXmltv(eu).then(m => { if (m && D) { D.epg = m; if (!$('section').hidden && sec === 'live') renderItems(); } }); }
    }
    loading(null);
    show('home');
  } catch (err) {
    loading(null); D = null;
    lastError = errText(err);
    renderHome();
  }
}
