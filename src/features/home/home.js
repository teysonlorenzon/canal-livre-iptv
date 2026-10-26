'use strict';
/**
 * Atualiza os relógios do topo e do player a cada segundo.
 */
setInterval(() => { const currentTimeText = formatHourMinute(new Date()); $('clock').textContent = currentTimeText; $('plClock').textContent = currentTimeText; }, 1000);

/**
 * Alterna entre a tela inicial e a tela de seção.
 * @param {'home'|'section'} view Tela a exibir.
 * @returns {void}
 */
function show(view){
  $('home').hidden = view !== 'home';
  $('section').hidden = view !== 'section';
  if (view === 'home') renderHome();
}
/**
 * Volta para a tela inicial.
 */
$('goHome').onclick = () => show('home');
applyTheme(getTheme());
/**
 * Alterna o tema (automático → claro → escuro) e avisa qual ficou ativo.
 */
$('themeBtn').onclick = () => toast('Tema: ' + THEME_INFO[cycleTheme()].label);

/**
 * Desenha a tela inicial: boas-vindas/erro, ou atalhos das seções,
 * dados da conta, "continuar assistindo", recentes e favoritos.
 * @returns {void}
 */
function renderHome(){
  const homeScreen = $('home');
  if (!activePlaylist || !catalog) {
    const httpsWarning = location.protocol === 'https:' ? '<p style="color:var(--accent)">Atenção: esta página está aberta em https. Listas e canais em http são bloqueados aqui. Baixe o arquivo e abra direto no navegador do computador.</p>' : '';
    homeScreen.innerHTML = lastError && activePlaylist
      ? `<div class="welcome"><h2>Não foi possível abrir “${esc(activePlaylist.name)}”</h2><p>${esc(lastError)}</p>${httpsWarning}<div class="row" style="justify-content:center"><button class="btn primary" id="wRetry">Tentar de novo</button><button class="btn" id="wAdd">Configurações</button></div></div>`
      : `<div class="welcome"><h2>${playlists.length ? 'Escolha uma lista para começar' : 'Adicione sua lista IPTV'}</h2><p>Funciona com login Xtream Codes (servidor, usuário e senha), URL M3U ou arquivo .m3u. Tudo fica salvo neste navegador.</p>${httpsWarning}<button class="btn primary" id="wAdd">${playlists.length ? 'Gerenciar listas' : 'Adicionar lista'}</button></div>`;
    $('wAdd').onclick = openSettings;
    if ($('wRetry')) $('wRetry').onclick = () => openPlaylist(activePlaylist.id, true);
    return;
  }
  /**
   * Conta os itens visíveis (fora de categorias ocultas) de uma seção.
   * @param {Secao} sectionName Seção.
   * @returns {number|null} Quantidade, ou `null` se ainda não carregada.
   */
  const countVisibleItems = sectionName => catalog[sectionName] ? catalog[sectionName].items.filter(item => !userData.hidden.includes(sectionName+':'+item.cat)).length : null;
  /**
   * Texto de contagem do bloco de uma seção.
   * @param {Secao} sectionName Seção.
   * @param {string} unitWord Palavra da unidade (ex.: "títulos").
   * @returns {string} Texto exibido.
   */
  const countLabel = (sectionName, unitWord) => countVisibleItems(sectionName) == null ? (sectionJobs[sectionName] ? 'Carregando…' : 'Toque para carregar') : `${countVisibleItems(sectionName)} ${unitWord}`;
  let accountHtml = '';
  if (catalog.info) {
    const userInfo = catalog.info.user_info, expirationText = +userInfo.exp_date ? new Date(userInfo.exp_date*1000).toLocaleDateString('pt-BR') : 'Ilimitado';
    accountHtml = `<div class="acct"><span>Status <b>${esc(userInfo.status)}</b></span><span>Vence <b>${expirationText}</b></span><span>Conexões <b>${esc(userInfo.active_cons)}/${esc(userInfo.max_connections)}</b></span><span>Usuário <b>${esc(userInfo.username)}</b></span></div>`;
  }
  const continueWatching = userData.hist.filter(historyEntry => !historyEntry.hidden && historyEntry.desc && historyEntry.dur && historyEntry.pos / historyEntry.dur < 0.95).slice(0, 20);
  const favoriteChannels = userData.fav.live.map(channelKey => catalog.live.items.find(item => item.k === channelKey)).filter(Boolean).slice(0, 20);
  const recentChannels = userData.recentLive.map(channelKey => catalog.live.items.find(item => item.k === channelKey)).filter(Boolean).slice(0, 20);
  homeScreen.innerHTML = `
    <div class="tiles">
      <button class="tile live" data-sec="live"><em>● AO VIVO</em><b>TV ao vivo</b><span>${countVisibleItems('live')} canais</span></button>
      <button class="tile" data-sec="vod"><em>FILMES</em><b>Filmes</b><span>${countLabel('vod','títulos')}</span></button>
      <button class="tile" data-sec="series"><em>SÉRIES</em><b>Séries</b><span>${countLabel('series','séries')}</span></button>
    </div>
    ${accountHtml}
    <div class="shelves">
      ${shelfHtml('cont', 'Continuar assistindo', 'De onde você parou', continueWatching.length, continueWatching.map((historyEntry, index) => cardHtml({ name:historyEntry.title, logo:historyEntry.logo, pg:historyEntry.pos/historyEntry.dur }, 'data-cont="'+index+'" data-fav="'+esc(historyEntry.series || historyEntry.ref)+'"')).join(''), 'Filmes e episódios que você começar aparecem aqui.')}
      ${shelfHtml('recent', 'Canais recentes', 'Assistidos por último', recentChannels.length, recentChannels.map(channel => chipHtml(channel)).join(''), 'Os canais que você assistir aparecem aqui.')}
      ${shelfHtml('fav', 'Canais favoritos', 'Seus canais marcados', favoriteChannels.length, favoriteChannels.map(channel => chipHtml(channel)).join(''), 'Toque na estrela ★ de um canal para favoritar.')}
    </div>`;
  homeScreen.querySelectorAll('[data-sec]').forEach(sectionButton => sectionButton.onclick = () => openSection(sectionButton.dataset.sec));
  homeScreen.querySelectorAll('[data-cont]').forEach(continueButton => continueButton.onclick = () => { const historyEntry = continueWatching[+continueButton.dataset.cont]; if (historyEntry.series) resumeEpisode(historyEntry); else playMedia(historyEntry.desc, historyEntry.pos); });
  homeScreen.querySelectorAll('[data-live]').forEach(channelButton => channelButton.onclick = () => { const channel = catalog.live.items.find(item => item.k === channelButton.dataset.live); playLive(channel, catalog.live.items); });
}
/**
 * HTML de uma prateleira da tela inicial: cabeçalho com ícone e contagem, e a faixa de
 * cartões (ou um estado vazio).
 * @param {'cont'|'recent'|'fav'} kind Tipo (define ícone e cor).
 * @param {string} title Título.
 * @param {string} subtitle Subtítulo.
 * @param {number} itemCount Quantidade de itens.
 * @param {string} itemsHtml HTML dos cartões.
 * @param {string} emptyText Texto do estado vazio.
 * @returns {string} HTML.
 */
const shelfHtml = (kind, title, subtitle, itemCount, itemsHtml, emptyText) => `<section class="shelf shelf-${kind}">
  <div class="shelf-h"><span class="shelf-ico">${icon(kind === 'fav' ? 'star' : kind)}</span><div><h3>${title}</h3><small>${subtitle}</small></div>${itemCount ? `<span class="shelf-n">${itemCount}</span>` : ''}</div>
  ${itemCount ? `<div class="strip">${itemsHtml}</div>` : `<div class="shelf-empty"><span class="shelf-ghost"></span><span class="shelf-ghost"></span><span class="shelf-ghost"></span><p>${emptyText}</p></div>`}
</section>`;
/**
 * HTML do cartão compacto de um canal.
 * @param {Item} channel Canal.
 * @returns {string} HTML.
 */
const chipHtml = channel => `<button class="card" data-live="${esc(channel.k)}" style="flex:0 0 130px"><div class="poster" style="aspect-ratio:16/10">${channel.logo ? `<img loading="lazy" src="${esc(channel.logo)}" alt="" style="object-fit:contain;padding:10px" onerror="this.remove()">` : ''}${initials(channel.name)}</div><b>${esc(channel.name)}</b></button>`;
/**
 * HTML do cartão com pôster de um filme, série ou item do histórico.
 * @param {{name: string, logo?: string, rate?: number, pg?: number}} cardData Dados do cartão (`pg` = progresso de 0 a 1).
 * @param {string} extraAttributes Atributos extras do botão.
 * @returns {string} HTML.
 */
const cardHtml = (cardData, extraAttributes) => `<button class="card" ${extraAttributes}><div class="poster">${initials(cardData.name)}${cardData.logo ? `<img loading="lazy" src="${esc(cardData.logo)}" alt="" onerror="this.remove()">` : ''}${cardData.rate ? `<span class="rt">★ ${(+cardData.rate).toFixed(1)}</span>` : ''}${cardData.pg ? `<span class="pg" style="width:${Math.min(100, cardData.pg*100)}%"></span>` : ''}</div><b>${esc(cardData.name)}</b></button>`;
