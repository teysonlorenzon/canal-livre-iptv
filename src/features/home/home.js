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
    if (lastError && activePlaylist) {
      homeScreen.innerHTML = `<div class="welcome"><h2>Não foi possível abrir “${esc(activePlaylist.name)}”</h2><p>${esc(lastError)}</p>${httpsWarning}<div class="row" style="justify-content:center"><button class="btn primary" id="wRetry">Tentar de novo</button><button class="btn" id="wAdd">Configurações</button></div></div>`;
      $('wRetry').onclick = () => openPlaylist(activePlaylist.id, true);
    } else if (!playlists.length) {
      homeScreen.innerHTML = `<div class="welcome"><h2>Adicione sua lista IPTV</h2><p>Funciona com login Xtream Codes (servidor, usuário e senha), URL M3U ou arquivo .m3u. Tudo fica salvo neste navegador.</p>${httpsWarning}<button class="btn primary" id="wAdd">Adicionar lista</button></div>`;
    } else homeScreen.innerHTML = '';
    if ($('wAdd')) $('wAdd').onclick = openSettings;
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
  const countLabel = (sectionName, unitWord) => countVisibleItems(sectionName) == null ? 'Toque para carregar' : `${countVisibleItems(sectionName)} ${unitWord}`;
  let accountHtml = '';
  if (catalog.info) {
    const userInfo = catalog.info.user_info, expirationText = +userInfo.exp_date ? new Date(userInfo.exp_date*1000).toLocaleDateString('pt-BR') : 'Ilimitado';
    accountHtml = `<div class="acct"><span>Status <b>${esc(userInfo.status)}</b></span><span>Vence <b>${expirationText}</b></span><span>Conexões <b>${esc(userInfo.active_cons)}/${esc(userInfo.max_connections)}</b></span><span>Usuário <b>${esc(userInfo.username)}</b></span></div>`;
  }
  const continueWatching = userData.hist.filter(historyEntry => !historyEntry.hidden && historyEntry.desc && historyEntry.dur && historyEntry.pos / historyEntry.dur < 0.95).slice(0, 20);
  const favoriteChannels = userData.fav.live.map(channelKey => catalog.live.items.find(item => item.k === channelKey)).filter(Boolean).slice(0, 20);
  const topMovies = weeklyTop('vod'), topSeries = weeklyTop('series');
  const recommendedMovies = recommendedItems('vod'), recommendedSeries = recommendedItems('series');
  const watchedMovies = watchedTitleEntries('vod'), watchedSeries = watchedTitleEntries('series');
  const recentChannels = userData.recentLive.map(channelKey => catalog.live.items.find(item => item.k === channelKey)).filter(Boolean).slice(0, 20);
  homeScreen.innerHTML = `
    <div class="tiles">
      <button class="tile live" data-sec="live"><em>● AO VIVO</em><b>TV ao vivo</b><span>${countVisibleItems('live')} canais</span></button>
      <button class="tile" data-sec="vod"><em>FILMES</em><b>Filmes</b><span>${countLabel('vod','títulos')}</span></button>
      <button class="tile" data-sec="series"><em>SÉRIES</em><b>Séries</b><span>${countLabel('series','séries')}</span></button>
    </div>
    ${accountHtml}
    <div class="shelves">
      ${shelfHtml('recent', 'Canais recentes', 'Assistidos por último', recentChannels.length, recentChannels.map(channel => chipHtml(channel, true)).join(''), 'Os canais que você assistir aparecem aqui.')}
      ${shelfHtml('fav', 'Canais favoritos', 'Seus canais marcados', favoriteChannels.length, favoriteChannels.map(channel => chipHtml(channel)).join(''), 'Toque na estrela ★ de um canal para favoritar.')}
      ${shelfHtml('cont', 'Continuar assistindo', 'De onde você parou', continueWatching.length, continueWatching.map((historyEntry, index) => cardHtml({ name:historyEntry.title, logo:historyEntry.logo, pg:historyEntry.pos/historyEntry.dur, removable:true }, 'data-cont="'+index+'" data-fav="'+esc(historyEntry.series || historyEntry.ref)+'"')).join(''), 'Filmes e episódios que você começar aparecem aqui.')}
      ${recommendationShelfHtml('vod', recommendedMovies)}
      ${recommendationShelfHtml('series', recommendedSeries)}
      ${weeklyTopShelfHtml('vod', topMovies)}
      ${weeklyTopShelfHtml('series', topSeries)}
      ${watchedShelfHtml('vod', watchedMovies)}
      ${watchedShelfHtml('series', watchedSeries)}
    </div>`;
  homeScreen.querySelectorAll('[data-sec]').forEach(sectionButton => sectionButton.onclick = () => openSection(sectionButton.dataset.sec));
  homeScreen.querySelectorAll('[data-cont]').forEach(continueButton => continueButton.onclick = () => { const historyEntry = continueWatching[+continueButton.dataset.cont]; if (historyEntry.series) resumeEpisode(historyEntry); else playMedia(historyEntry.desc, historyEntry.pos); });
  homeScreen.querySelectorAll('.shelf').forEach(shelfElement => { const strip = shelfElement.querySelector('.strip'), arrows = shelfElement.querySelector('.scroll-arrows'); if (strip && arrows) bindScrollArrows(strip, arrows); });
  homeScreen.querySelectorAll('[data-rec]').forEach(recommendationButton => recommendationButton.onclick = () => {
    const sectionName = recommendationButton.dataset.rec, item = (sectionName === 'vod' ? recommendedMovies : recommendedSeries).items[+recommendationButton.dataset.i];
    if (item) withPin(sectionName + ':' + item.cat, () => sectionName === 'vod' ? openMovie(item) : openSeries(item));
  });
  homeScreen.querySelectorAll('[data-watched]').forEach(watchedButton => watchedButton.onclick = () => {
    const sectionName = watchedButton.dataset.watched, watchedEntry = (sectionName === 'vod' ? watchedMovies : watchedSeries)[+watchedButton.dataset.i];
    if (watchedEntry) withPin(sectionName + ':' + watchedEntry.item.cat, () => sectionName === 'vod' ? openMovie(watchedEntry.item) : openSeries(watchedEntry.item));
  });
  homeScreen.querySelectorAll('[data-top]').forEach(topButton => topButton.onclick = () => {
    const sectionName = topButton.dataset.top, item = (sectionName === 'vod' ? topMovies : topSeries).items[+topButton.dataset.rank];
    if (item) withPin(sectionName + ':' + item.cat, () => sectionName === 'vod' ? openMovie(item) : openSeries(item));
  });
  homeScreen.querySelectorAll('.card-del').forEach(removeButton => removeButton.onclick = clickEvent => {
    clickEvent.stopPropagation();
    const cardElement = removeButton.closest('.card');
    if (cardElement.dataset.cont) removeHistoryEntry(continueWatching[+cardElement.dataset.cont].ref);
    else if (cardElement.dataset.watched) removeHistoryEntry((cardElement.dataset.watched === 'vod' ? watchedMovies : watchedSeries)[+cardElement.dataset.i].ref);
    else removeRecentChannel(cardElement.dataset.live);
    toast('Removido do histórico.'); renderHome();
  });
  homeScreen.querySelectorAll('[data-live]').forEach(channelButton => channelButton.onclick = () => { const channel = catalog.live.items.find(item => item.k === channelButton.dataset.live); playLive(channel, catalog.live.items); });
}
/**
 * HTML de uma prateleira da tela inicial: cabeçalho com ícone, contagem e setas para rolar,
 * e a faixa de cartões (ou um estado vazio).
 * @param {'cont'|'recent'|'fav'|'topvod'|'topseries'|'recvod'|'recseries'|'watchedvod'|'watchedseries'} kind Tipo (define ícone e cor).
 * @param {string} title Título.
 * @param {string} subtitle Subtítulo.
 * @param {number} itemCount Quantidade de itens.
 * @param {string} itemsHtml HTML dos cartões.
 * @param {string} emptyText Texto do estado vazio.
 * @returns {string} HTML.
 */
const shelfHtml = (kind, title, subtitle, itemCount, itemsHtml, emptyText) => `<section class="shelf shelf-${kind}">
  <div class="shelf-h"><span class="shelf-ico">${icon({ fav:'star', topvod:'trophy', topseries:'trophy', recvod:'sparkle', recseries:'sparkle', watchedvod:'check', watchedseries:'check' }[kind] || kind)}</span><div><h3>${title}</h3><small>${subtitle}</small></div>${itemCount ? `<span class="shelf-n">${itemCount}</span>${scrollArrowsHtml()}` : ''}</div>
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
/**
 * Categorias da seção que podem aparecer em destaques da tela inicial (Top 10, recomendações):
 * sem as ocultas, as bloqueadas pelo PIN e as adultas.
 * @param {'vod'|'series'} sectionName Seção.
 * @returns {Set<string>} Ids das categorias.
 */
const visibleCategoryIds = sectionName => new Set(catalog[sectionName].cats.filter(category => !userData.hidden.includes(sectionName + ':' + category.id) && !userData.locked.includes(sectionName + ':' + category.id) && !ADULT_PATTERN.test(category.name)).map(category => category.id));
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
  const allowedCategoryIds = visibleCategoryIds(sectionName);
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
/**
 * HTML da prateleira de recomendações ("Filmes recomendados" ou "Séries recomendadas"), que só
 * aparece quando o histórico do perfil tem algo a dizer sobre a seção.
 * @param {'vod'|'series'} sectionName Seção.
 * @param {{items: Item[], reason: string}} recommendations Títulos e motivo (de `recommendedItems`).
 * @returns {string} HTML.
 */
function recommendationShelfHtml(sectionName, recommendations){
  if (!recommendations.items.length) return '';
  const kind = sectionName === 'vod' ? 'recvod' : 'recseries', title = sectionName === 'vod' ? 'Filmes recomendados' : 'Séries recomendadas';
  return shelfHtml(kind, title, esc(recommendations.reason), recommendations.items.length, recommendations.items.map((item, index) => cardHtml(item, `data-rec="${sectionName}" data-i="${index}" data-fav="${sectionName}:${esc(item.k)}"`)).join(''), '');
}
/**
 * Títulos do histórico do perfil para o bloco "assistidos": filmes que ele terminou de ver
 * (95% ou mais, o complemento de "Continuar assistindo") ou séries das quais viu algum episódio,
 * do mais recente para o mais antigo.
 * @param {'vod'|'series'} sectionName Seção.
 * @returns {{item: Item, ref: string}[]} Até 20 títulos com a referência do registro no histórico.
 */
function watchedTitleEntries(sectionName){
  const sectionData = catalog[sectionName]; if (!sectionData) return [];
  const isSeries = sectionName === 'series', itemsByKey = recommendationIndex(sectionData).byKey, watchedEntries = [];
  for (const historyEntry of userData.hist) {
    if (historyEntry.hidden || !historyEntry.ref) continue;
    if (isSeries ? !historyEntry.series : (historyEntry.series || historyEntry.ref.indexOf('vod:') !== 0 || !historyEntry.dur || historyEntry.pos / historyEntry.dur < 0.95)) continue;
    const item = itemsByKey.get(isSeries ? historyEntry.series.slice('series:'.length) : historyEntry.ref.slice('vod:'.length));
    if (item) watchedEntries.push({ item, ref:historyEntry.ref });
    if (watchedEntries.length === 20) break;
  }
  return watchedEntries;
}
/**
 * HTML do bloco "Filmes assistidos" ou "Séries assistidas" (some se o histórico não tiver nada).
 * @param {'vod'|'series'} sectionName Seção.
 * @param {{item: Item, ref: string}[]} watchedEntries Títulos (de `watchedTitleEntries`).
 * @returns {string} HTML.
 */
function watchedShelfHtml(sectionName, watchedEntries){
  if (!watchedEntries.length) return '';
  const isMovie = sectionName === 'vod';
  return shelfHtml(isMovie ? 'watchedvod' : 'watchedseries', isMovie ? 'Filmes assistidos' : 'Séries assistidas', isMovie ? 'Filmes que você terminou de ver' : 'Séries que você já começou', watchedEntries.length, watchedEntries.map(({ item }, index) => cardHtml({ ...item, removable:true }, `data-watched="${sectionName}" data-i="${index}" data-fav="${sectionName}:${esc(item.k)}"`)).join(''), '');
}
