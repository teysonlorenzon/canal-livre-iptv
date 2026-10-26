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
  const topMovies = weeklyTop('vod'), topSeries = weeklyTop('series');
  const recentChannels = userData.recentLive.map(channelKey => catalog.live.items.find(item => item.k === channelKey)).filter(Boolean).slice(0, 20);
  homeScreen.innerHTML = `
    <div class="tiles">
      <button class="tile live" data-sec="live"><em>● AO VIVO</em><b>TV ao vivo</b><span>${countVisibleItems('live')} canais</span></button>
      <button class="tile" data-sec="vod"><em>FILMES</em><b>Filmes</b><span>${countLabel('vod','títulos')}</span></button>
      <button class="tile" data-sec="series"><em>SÉRIES</em><b>Séries</b><span>${countLabel('series','séries')}</span></button>
    </div>
    ${accountHtml}
    <div class="shelves">
      ${shelfHtml('cont', 'Continuar assistindo', 'De onde você parou', continueWatching.length, continueWatching.map((historyEntry, index) => cardHtml({ name:historyEntry.title, logo:historyEntry.logo, pg:historyEntry.pos/historyEntry.dur, removable:true }, 'data-cont="'+index+'" data-fav="'+esc(historyEntry.series || historyEntry.ref)+'"')).join(''), 'Filmes e episódios que você começar aparecem aqui.')}
      ${weeklyTopShelfHtml('vod', topMovies)}
      ${weeklyTopShelfHtml('series', topSeries)}
      ${shelfHtml('recent', 'Canais recentes', 'Assistidos por último', recentChannels.length, recentChannels.map(channel => chipHtml(channel, true)).join(''), 'Os canais que você assistir aparecem aqui.')}
      ${shelfHtml('fav', 'Canais favoritos', 'Seus canais marcados', favoriteChannels.length, favoriteChannels.map(channel => chipHtml(channel)).join(''), 'Toque na estrela ★ de um canal para favoritar.')}
    </div>`;
  homeScreen.querySelectorAll('[data-sec]').forEach(sectionButton => sectionButton.onclick = () => openSection(sectionButton.dataset.sec));
  homeScreen.querySelectorAll('[data-cont]').forEach(continueButton => continueButton.onclick = () => { const historyEntry = continueWatching[+continueButton.dataset.cont]; if (historyEntry.series) resumeEpisode(historyEntry); else playMedia(historyEntry.desc, historyEntry.pos); });
  homeScreen.querySelectorAll('.shelf').forEach(shelfElement => { const strip = shelfElement.querySelector('.strip'), arrows = shelfElement.querySelector('.scroll-arrows'); if (strip && arrows) bindScrollArrows(strip, arrows); });
  homeScreen.querySelectorAll('[data-top]').forEach(topButton => topButton.onclick = () => {
    const sectionName = topButton.dataset.top, item = (sectionName === 'vod' ? topMovies : topSeries).items[+topButton.dataset.rank];
    if (item) withPin(sectionName + ':' + item.cat, () => sectionName === 'vod' ? openMovie(item) : openSeries(item));
  });
  homeScreen.querySelectorAll('.card-del').forEach(removeButton => removeButton.onclick = clickEvent => {
    clickEvent.stopPropagation();
    const cardElement = removeButton.closest('.card');
    if (cardElement.dataset.cont) removeHistoryEntry(continueWatching[+cardElement.dataset.cont].ref); else removeRecentChannel(cardElement.dataset.live);
    toast('Removido do histórico.'); renderHome();
  });
  homeScreen.querySelectorAll('[data-live]').forEach(channelButton => channelButton.onclick = () => { const channel = catalog.live.items.find(item => item.k === channelButton.dataset.live); playLive(channel, catalog.live.items); });
}
/**
 * HTML de uma prateleira da tela inicial: cabeçalho com ícone, contagem e setas para rolar,
 * e a faixa de cartões (ou um estado vazio).
 * @param {'cont'|'recent'|'fav'|'topvod'|'topseries'} kind Tipo (define ícone e cor).
 * @param {string} title Título.
 * @param {string} subtitle Subtítulo.
 * @param {number} itemCount Quantidade de itens.
 * @param {string} itemsHtml HTML dos cartões.
 * @param {string} emptyText Texto do estado vazio.
 * @returns {string} HTML.
 */
const shelfHtml = (kind, title, subtitle, itemCount, itemsHtml, emptyText) => `<section class="shelf shelf-${kind}">
  <div class="shelf-h"><span class="shelf-ico">${icon({ fav:'star', topvod:'trophy', topseries:'trophy' }[kind] || kind)}</span><div><h3>${title}</h3><small>${subtitle}</small></div>${itemCount ? `<span class="shelf-n">${itemCount}</span>${scrollArrowsHtml()}` : ''}</div>
  ${itemCount ? `<div class="strip">${itemsHtml}</div>` : `<div class="shelf-empty"><span class="shelf-ghost"></span><span class="shelf-ghost"></span><span class="shelf-ghost"></span><p>${emptyText}</p></div>`}
</section>`;
/**
 * HTML do botão "×" que remove um cartão do histórico.
 * @type {string}
 */
const removeFromHistoryHtml = `<span class="card-del" role="button" aria-label="Remover do histórico" title="Remover do histórico">${icon('close')}</span>`;
/**
 * HTML do cartão compacto de um canal.
 * @param {Item} channel Canal.
 * @param {boolean} [removable] Mostrar o botão de remover do histórico.
 * @returns {string} HTML.
 */
const chipHtml = (channel, removable) => `<button class="card" data-live="${esc(channel.k)}" style="flex:0 0 130px"><div class="poster" style="aspect-ratio:16/10">${channel.logo ? `<img loading="lazy" src="${esc(channel.logo)}" alt="" style="object-fit:contain;padding:10px" onerror="this.remove()">` : ''}${initials(channel.name)}${removable ? removeFromHistoryHtml : ''}</div><b>${esc(channel.name)}</b></button>`;
/**
 * HTML do pôster de um filme, série ou item do histórico (capa, iniciais, nota, progresso).
 * @param {{name: string, logo?: string, rate?: number, pg?: number, removable?: boolean, rank?: number}} cardData Dados do cartão (`pg` = progresso de 0 a 1; `removable` mostra o botão de remover do histórico; `rank` mostra a posição do Top 10).
 * @returns {string} HTML.
 */
const posterHtml = cardData => `<div class="poster">${initials(cardData.name)}${cardData.logo ? `<img loading="lazy" src="${esc(cardData.logo)}" alt="" onerror="this.remove()">` : ''}${cardData.rate ? `<span class="rt">★ ${(+cardData.rate).toFixed(1)}</span>` : ''}${cardData.pg ? `<span class="pg" style="width:${Math.min(100, cardData.pg*100)}%"></span>` : ''}${cardData.removable ? removeFromHistoryHtml : ''}${cardData.rank ? `<span class="top-shade"></span><span class="top-rank" aria-hidden="true">${cardData.rank}</span>` : ''}</div>`;
/**
 * HTML do cartão com pôster de um filme, série ou item do histórico.
 * @param {{name: string, logo?: string, rate?: number, pg?: number, removable?: boolean}} cardData Dados do cartão.
 * @param {string} extraAttributes Atributos extras do botão.
 * @returns {string} HTML.
 */
const cardHtml = (cardData, extraAttributes) => `<button class="card" ${extraAttributes}>${posterHtml(cardData)}<b>${esc(cardData.name)}</b></button>`;
/**
 * HTML do cartão do Top 10: o número da posição fica dentro do pôster, sobre um degradê.
 * @param {Item} item Filme ou série.
 * @param {number} index Posição (0 = primeiro).
 * @param {'vod'|'series'} sectionName Seção.
 * @returns {string} HTML.
 */
const topCardHtml = (item, index, sectionName) => `<button class="card top-card" data-top="${sectionName}" data-rank="${index}" data-fav="${sectionName}:${esc(item.k)}" aria-label="${index + 1}º: ${esc(item.name)}">${posterHtml({ ...item, rank:index + 1 })}<b>${esc(item.name)}</b></button>`;

/** @type {number} Quantidade de títulos do Top 10. */
const TOP_SIZE = 10;
/** @type {number} Janela dos "adicionados na semana", em segundos (7 dias). */
const TOP_WEEK_SECONDS = 7 * 24 * 60 * 60;
/** @type {RegExp} Nomes de categoria que a própria lista usa para destaques (Top 10, em alta, mais vistos…). */
const TOP_CATEGORY_PATTERN = /top\s*\d+|em\s*alta|mais\s*(vistos|assistidos|populares)|populares|trending|tend[eê]ncia|da\s*semana|destaques?/i;
/**
 * Prioridade de uma categoria de destaque: "da semana" vem antes de "Top 10", que vem antes do resto.
 * @param {string} categoryName Nome da categoria.
 * @returns {number} Prioridade (maior = melhor).
 */
const topCategoryPriority = categoryName => /semana/i.test(categoryName) ? 3 : /top\s*\d+/i.test(categoryName) ? 2 : 1;
/**
 * Nome simplificado para não repetir versões do mesmo título (ex.: "Filme [4K]" e "Filme").
 * @param {string} name Nome do título.
 * @returns {string} Nome sem marcações de qualidade, idioma e ano.
 */
const topNameKey = name => String(name).toLowerCase().replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/\b(4k|uhd|fhd|hd|sd|h265|hevc|dublado|legendado|dub|leg|dual)\b/g, ' ').replace(/[^a-z0-9à-ú]+/g, ' ').trim();
/**
 * Até 10 itens sem títulos repetidos.
 * @param {Item[]} items Itens em ordem.
 * @returns {Item[]} Primeiros 10 títulos diferentes.
 */
function firstUniqueTitles(items){
  const seenNames = new Set(), uniqueItems = [];
  for (const item of items) {
    const nameKey = topNameKey(item.name);
    if (seenNames.has(nameKey)) continue;
    seenNames.add(nameKey); uniqueItems.push(item);
    if (uniqueItems.length === TOP_SIZE) break;
  }
  return uniqueItems;
}
/** @type {WeakMap<DadosSecao, {signature: string, top: {items: Item[], source: string}}>} Top da semana já calculado por seção. */
const weeklyTopCache = new WeakMap();
/**
 * Top 10 da semana tirado da própria lista: a categoria de destaque dela ("Top 10", "Em alta",
 * "Mais vistos da semana"…) na ordem do servidor; se não houver, os adicionados nos últimos
 * 7 dias, dos mais novos para os mais antigos. Ignora categorias ocultas, bloqueadas e adultas.
 * @param {'vod'|'series'} sectionName Seção.
 * @returns {{items: Item[], source: string}} Títulos e de onde vieram (texto do subtítulo).
 */
function weeklyTop(sectionName){
  const sectionData = catalog[sectionName]; if (!sectionData) return { items:[], source:'' };
  const signature = userData.hidden.join('|') + '#' + userData.locked.join('|');
  const cached = weeklyTopCache.get(sectionData); if (cached && cached.signature === signature) return cached.top;
  const isAllowedCategory = category => !userData.hidden.includes(sectionName + ':' + category.id) && !userData.locked.includes(sectionName + ':' + category.id) && !ADULT_PATTERN.test(category.name);
  const allowedCategoryIds = new Set(sectionData.cats.filter(isAllowedCategory).map(category => category.id));
  const highlightCategories = sectionData.cats.filter(category => allowedCategoryIds.has(category.id) && TOP_CATEGORY_PATTERN.test(category.name)).sort((first, second) => topCategoryPriority(second.name) - topCategoryPriority(first.name));
  let top = { items:[], source:'' };
  for (const category of highlightCategories) {
    const categoryItems = firstUniqueTitles(sectionData.items.filter(item => item.cat === category.id));
    if (categoryItems.length) { top = { items:categoryItems, source:'Da categoria “' + category.name + '” da sua lista' }; break; }
  }
  if (!top.items.length) {
    const weekStart = Date.now() / 1000 - TOP_WEEK_SECONDS;
    const addedThisWeek = sectionData.items.filter(item => item.added >= weekStart && allowedCategoryIds.has(item.cat)).sort((first, second) => second.added - first.added || (second.rate || 0) - (first.rate || 0));
    top = { items:firstUniqueTitles(addedThisWeek), source:'Adicionados à sua lista nos últimos 7 dias' };
  }
  weeklyTopCache.set(sectionData, { signature, top });
  return top;
}
/**
 * HTML da prateleira "Top 10 … da semana" (não aparece se a lista não tiver destaques nem novidades).
 * @param {'vod'|'series'} sectionName Seção.
 * @param {{items: Item[], source: string}} top Títulos e origem.
 * @returns {string} HTML.
 */
function weeklyTopShelfHtml(sectionName, top){
  if (!top.items.length) return '';
  const kind = sectionName === 'vod' ? 'topvod' : 'topseries', title = sectionName === 'vod' ? 'Top 10 filmes da semana' : 'Top 10 séries da semana';
  return shelfHtml(kind, title, esc(top.source), top.items.length, top.items.map((item, index) => topCardHtml(item, index, sectionName)).join(''), '');
}
