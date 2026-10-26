'use strict';
/**
 * Atualiza o seletor de lista do topo e a lista de listas nas configurações.
 * @returns {void}
 */
function renderPlaylistSelect(){
  $('plSelTxt').textContent = activePlaylist ? activePlaylist.name : playlists.length ? 'Escolha uma lista' : 'Nenhuma lista';
  $('plSel').title = 'Lista: ' + $('plSelTxt').textContent;
  $('plMenu').innerHTML = playlists.map(playlist => `<li role="option" tabindex="-1" data-id="${esc(playlist.id)}" aria-selected="${activePlaylist && activePlaylist.id === playlist.id}"><b>${esc(playlist.name)}</b><small>${playlist.type === 'xtream' ? 'Xtream' : playlist.url ? 'M3U' : 'Arquivo M3U'}</small></li>`).join('')
    + `<li class="dd-act" tabindex="-1" data-manage="1">${playlists.length ? 'Gerenciar listas…' : 'Adicionar lista…'}</li>`;
  $('plList').innerHTML = playlists.length ? playlists.map(playlist => `<div class="plrow"><div><b>${esc(playlist.name)}</b><small>${playlist.type === 'xtream' ? 'Xtream · ' + esc(playlist.server) + ' · ' + esc(playlist.user) : playlist.url ? 'M3U · ' + esc(playlist.url) : 'M3U · arquivo local'}</small></div>
    <button class="btn sm" data-open="${playlist.id}">Abrir</button><button class="btn sm" data-reload="${playlist.id}">Atualizar</button><button class="btn sm danger" data-del="${playlist.id}">Remover</button></div>`).join('') : '<p class="hint">Nenhuma lista ainda. Adicione abaixo.</p>';
}
/**
 * Abre ou fecha o menu de listas do topo.
 * @param {boolean} open `true` para abrir.
 * @param {boolean} [focus] Ao abrir, focar a lista ativa (navegação por teclado).
 * @returns {void}
 */
function togglePlaylistMenu(open, focus){
  $('plMenu').hidden = !open;
  $('plSel').setAttribute('aria-expanded', open);
  if (open && focus) ($('plMenu').querySelector('[aria-selected=true]') || $('plMenu').firstElementChild).focus();
}

/**
 * Executa a opção escolhida no menu de listas: abre a lista ou as configurações.
 * @param {HTMLLIElement} menuItem Item escolhido.
 * @returns {void}
 */
function pickPlaylistMenuItem(menuItem){
  togglePlaylistMenu(false);
  $('plSel').focus();
  if (menuItem.dataset.manage) return openSettings();
  if (!activePlaylist || activePlaylist.id !== menuItem.dataset.id) openPlaylist(menuItem.dataset.id);
}

/**
 * Abre ou fecha o menu de listas.
 */
$('plSel').onclick = () => togglePlaylistMenu($('plMenu').hidden);

/**
 * Abre o menu pelo teclado (setas, Enter ou Espaço) já com foco na lista ativa.
 * @param {KeyboardEvent} keyEvent Evento de tecla.
 */
$('plSel').onkeydown = keyEvent => {
  if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(keyEvent.key)) { keyEvent.preventDefault(); togglePlaylistMenu(true, true); }
};

/**
 * Escolhe uma opção do menu com o mouse.
 * @param {MouseEvent} clickEvent Evento de clique.
 */
$('plMenu').onclick = clickEvent => { const menuItem = clickEvent.target.closest('li'); if (menuItem) pickPlaylistMenuItem(menuItem); };

/**
 * Navegação por teclado no menu: setas, Home/End, Enter/Espaço escolhem, Esc/Tab fecham.
 * @param {KeyboardEvent} keyEvent Evento de tecla.
 */
$('plMenu').onkeydown = keyEvent => {
  const menuItems = [...$('plMenu').children], focusedIndex = menuItems.indexOf(document.activeElement);
  /**
   * Foca o item do menu no índice dado, circulando nas pontas.
   * @param {number} targetIndex Índice desejado (pode passar das pontas).
   * @returns {void}
   */
  const focusMenuItem = targetIndex => { keyEvent.preventDefault(); menuItems[(targetIndex + menuItems.length) % menuItems.length].focus(); };
  if (keyEvent.key === 'ArrowDown') focusMenuItem(focusedIndex + 1);
  else if (keyEvent.key === 'ArrowUp') focusMenuItem(focusedIndex - 1);
  else if (keyEvent.key === 'Home') focusMenuItem(0);
  else if (keyEvent.key === 'End') focusMenuItem(menuItems.length - 1);
  else if (keyEvent.key === 'Enter' || keyEvent.key === ' ') { keyEvent.preventDefault(); if (focusedIndex >= 0) pickPlaylistMenuItem(menuItems[focusedIndex]); }
  else if (keyEvent.key === 'Escape') { keyEvent.preventDefault(); togglePlaylistMenu(false); $('plSel').focus(); }
  else if (keyEvent.key === 'Tab') togglePlaylistMenu(false);
};

/**
 * Fecha o menu de listas ao clicar fora dele.
 * @param {MouseEvent} clickEvent Evento de clique.
 */
document.addEventListener('click', clickEvent => { if (!$('plMenu').hidden && !$('plDd').contains(clickEvent.target)) togglePlaylistMenu(false); });
/**
 * Trata os botões Abrir, Atualizar e Remover (com confirmação) das listas.
 * @param {MouseEvent} clickEvent Evento de clique.
 */
$('plList').onclick = clickEvent => {
  const actionButton = clickEvent.target.closest('button'); if (!actionButton) return;
  if (actionButton.dataset.open) { $('dSettings').close(); openPlaylist(actionButton.dataset.open); }
  if (actionButton.dataset.reload) { $('dSettings').close(); openPlaylist(actionButton.dataset.reload, true); }
  if (actionButton.dataset.del) {
    if (actionButton.dataset.confirm !== '1') { actionButton.dataset.confirm = '1'; actionButton.textContent = 'Confirmar'; return; }
    const playlistId = actionButton.dataset.del; playlists = playlists.filter(playlist => playlist.id !== playlistId); store.set('pls', playlists); profiles.forEach(profile => store.del(profileKey('ux_'+playlistId, profile.id))); store.del('m3u_'+playlistId);
    if (activePlaylist && activePlaylist.id === playlistId) { activePlaylist = null; catalog = null; store.del('active'); }
    renderPlaylistSelect(); renderHome();
  }
};

/**
 * Ativa uma lista e carrega seus dados.
 * @param {string} id Id da lista.
 * @param {boolean} [force] Baixar novamente a lista M3U em vez de usar o cache.
 * @returns {Promise<void>}
 */
async function openPlaylist(id, force){
  const playlist = playlists.find(candidate => candidate.id === id); if (!playlist) return;
  activePlaylist = playlist; store.set('active', id); loadUserData(); unlockedCategories.clear(); epgCache.clear(); lastError = ''; catalog = null; sectionJobs = {};
  renderPlaylistSelect();
  try {
    if (playlist.type === 'xtream') { catalog = await loadXtream(); preloadSections(); }
    else {
      let m3uText = playlist.id === DEFAULT_PLAYLIST.id ? DEFAULT_M3U : (!force || !playlist.url) ? store.get('m3u_' + playlist.id, null) : null;
      if (!m3uText && playlist.url) { loading('Baixando lista…'); const response = await fetchWithTimeout(playlist.url, 120000); m3uText = await response.text(); store.set('m3u_' + playlist.id, m3uText); }
      if (!m3uText) throw new Error('Conteúdo da lista não encontrado. Adicione de novo.');
      loading('Organizando canais…');
      catalog = buildFromM3U(m3uText);
      const epgUrl = playlist.epg || catalog.epgUrl;
      if (epgUrl) { loadXmltv(epgUrl).then(epgMap => { if (epgMap && catalog) { catalog.epg = epgMap; if (!$('section').hidden && currentSection === 'live') renderItems(); } }); }
    }
    loading(null);
    show('home');
  } catch (error) {
    loading(null); catalog = null;
    lastError = errText(error);
    renderHome();
  }
}
