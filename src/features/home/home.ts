import { rescueFocus } from '../../core/a11y';
import { $, $optional, query, queryAll } from '../../core/dom';
import { isOnDemandSection, isSectionName } from '../../core/guards';
import { removeHistoryEntry, removeRecentChannel, state } from '../../core/state';
import { cycleTheme, THEME_INFO } from '../../core/theme';
import type { HistoryEntry, Item, OnDemandSection, ResumableEntry, SectionData, SectionName } from '../../core/types';
import { esc, formatHourMinute, initials, toast } from '../../core/utils';
import { icon, type IconName } from '../../ui/icons';
import { bindScrollArrows, scrollArrowsHtml } from '../../ui/scroll-arrows';
import { showSavedTheme, showThemeMode } from '../../ui/theme-button';
import { openMovie, openSeries, resumeEpisode } from '../details/details';
import { playLive, playMedia } from '../player/player';
import { openPlaylist } from '../playlists/playlists';
import { openSection, withPin } from '../section/section';
import { openSettings } from '../settings/settings';
import { recommendationIndex, type Recommendations, recommendedItems, topNameKey, visibleCategoryIds } from './recommendations';

/**
 * Alterna entre a tela inicial e a tela de seção.
 * @param view Tela a exibir.
 */
export function show(view: 'home' | 'section'): void {
  $('home').hidden = view !== 'home';
  $('section').hidden = view !== 'section';
  if (view === 'home') renderHome();
  rescueFocus(view === 'home' ? $('appTitle') : $('secTitle'));
}

/**
 * Desenha a tela inicial: boas-vindas/erro, ou atalhos das seções,
 * dados da conta, "continuar assistindo", recentes e favoritos.
 */
export function renderHome(): void {
  const homeScreen = $('home');
  const { activePlaylist, catalog } = state;
  if (!activePlaylist || !catalog) {
    const httpsWarning =
      location.protocol === 'https:'
        ? '<p style="color:var(--accent)">Atenção: esta página está aberta em https. Listas e canais em http são bloqueados aqui. Baixe o arquivo e abra direto no navegador do computador.</p>'
        : '';
    if (state.lastError && activePlaylist) {
      homeScreen.innerHTML = `<div class="welcome"><h2>Não foi possível abrir “${esc(activePlaylist.name)}”</h2><p>${esc(state.lastError)}</p>${httpsWarning}<div class="row" style="justify-content:center"><button class="btn primary" id="wRetry">Tentar de novo</button><button class="btn" id="wAdd">Configurações</button></div></div>`;
      $('wRetry').onclick = () => openPlaylist(activePlaylist.id, true);
    } else if (!state.playlists.length) {
      homeScreen.innerHTML = `<div class="welcome"><h2>Adicione sua lista IPTV</h2><p>Funciona com login Xtream Codes (servidor, usuário e senha), URL M3U ou arquivo .m3u. Tudo fica salvo neste navegador.</p>${httpsWarning}<button class="btn primary" id="wAdd">Adicionar lista</button></div>`;
    } else homeScreen.innerHTML = '';
    const addListButton = $optional('wAdd');
    if (addListButton) addListButton.onclick = openSettings;
    return;
  }
  /**
   * Conta os itens visíveis (fora de categorias ocultas) de uma seção.
   * @param sectionName Seção.
   * @returns Quantidade, ou `null` se ainda não carregada.
   */
  const countVisibleItems = (sectionName: SectionName): number | null =>
    catalog[sectionName]?.items.filter(item => !state.userData.hidden.includes(sectionName + ':' + item.cat)).length ?? null;
  /**
   * Texto de contagem do bloco de uma seção.
   * @param sectionName Seção.
   * @param unitWord Palavra da unidade (ex.: "títulos").
   * @returns Texto exibido.
   */
  const countLabel = (sectionName: SectionName, unitWord: string): string =>
    countVisibleItems(sectionName) == null ? 'Toque para carregar' : `${countVisibleItems(sectionName)} ${unitWord}`;
  let accountHtml = '';
  if (catalog.account) {
    const account = catalog.account,
      expirationText = account.expiresAt ? new Date(account.expiresAt * 1000).toLocaleDateString('pt-BR') : 'Ilimitado';
    accountHtml = `<div class="acct"><span>Status <b>${esc(account.status)}</b></span><span>Vence <b>${expirationText}</b></span><span>Conexões <b>${esc(account.activeConnections)}/${esc(account.maxConnections)}</b></span><span>Usuário <b>${esc(account.username)}</b></span></div>`;
  }
  const continueWatching = state.userData.hist.filter(isUnfinished).slice(0, 20);
  const favoriteChannels = state.userData.fav.live
    .map(channelKey => catalog.live.items.find(item => item.k === channelKey))
    .filter(channel => channel !== undefined)
    .slice(0, 20);
  const topMovies = weeklyTop('vod'),
    topSeries = weeklyTop('series');
  const recommendedMovies = recommendedItems('vod'),
    recommendedSeries = recommendedItems('series');
  const watchedMovies = watchedTitleEntries('vod'),
    watchedSeries = watchedTitleEntries('series');
  const recentChannels = state.userData.recentLive
    .map(channelKey => catalog.live.items.find(item => item.k === channelKey))
    .filter(channel => channel !== undefined)
    .slice(0, 20);
  homeScreen.innerHTML = `
    <div class="tiles">
      <button class="tile live" data-sec="live"><em aria-hidden="true">● AO VIVO</em><b>TV ao vivo</b><span>${countVisibleItems('live')} canais</span></button>
      <button class="tile" data-sec="vod"><em aria-hidden="true">FILMES</em><b>Filmes</b><span>${countLabel('vod', 'títulos')}</span></button>
      <button class="tile" data-sec="series"><em aria-hidden="true">SÉRIES</em><b>Séries</b><span>${countLabel('series', 'séries')}</span></button>
    </div>
    ${accountHtml}
    <div class="shelves">
      ${shelfHtml('recent', 'Canais recentes', 'Assistidos por último', recentChannels.length, recentChannels.map(channel => chipHtml(channel, true)).join(''), 'Os canais que você assistir aparecem aqui.')}
      ${shelfHtml('fav', 'Canais favoritos', 'Seus canais marcados', favoriteChannels.length, favoriteChannels.map(channel => chipHtml(channel)).join(''), 'Toque na estrela ★ de um canal para favoritar.')}
      ${shelfHtml('cont', 'Continuar assistindo', 'De onde você parou', continueWatching.length, continueWatching.map((historyEntry, index) => cardHtml({ name: historyEntry.title ?? '', logo: historyEntry.logo, pg: historyEntry.pos / historyEntry.dur, removable: true }, 'data-cont="' + index + '" data-fav="' + esc(historyEntry.series || historyEntry.ref) + '"')).join(''), 'Filmes e episódios que você começar aparecem aqui.')}
      ${recommendationShelfHtml('vod', recommendedMovies)}
      ${recommendationShelfHtml('series', recommendedSeries)}
      ${weeklyTopShelfHtml('vod', topMovies)}
      ${weeklyTopShelfHtml('series', topSeries)}
      ${watchedShelfHtml('vod', watchedMovies)}
      ${watchedShelfHtml('series', watchedSeries)}
    </div>`;
  queryAll(homeScreen, '[data-sec]').forEach(sectionButton => {
    sectionButton.onclick = () => {
      const sectionName = sectionButton.dataset.sec;
      if (isSectionName(sectionName)) void openSection(sectionName);
    };
  });
  queryAll(homeScreen, '[data-cont]').forEach(continueButton => {
    continueButton.onclick = () => {
      const historyEntry = continueWatching[Number(continueButton.dataset.cont)];
      if (!historyEntry) return;
      if (historyEntry.series) void resumeEpisode(historyEntry);
      else playMedia(historyEntry.desc, historyEntry.pos);
    };
  });
  queryAll(homeScreen, '.shelf').forEach(shelfElement => {
    const strip = query(shelfElement, '.strip'),
      arrows = query(shelfElement, '.scroll-arrows');
    if (strip && arrows) bindScrollArrows(strip, arrows);
  });
  queryAll(homeScreen, '[data-rec]').forEach(recommendationButton => {
    recommendationButton.onclick = () => {
      const sectionName = recommendationButton.dataset.rec;
      if (!isOnDemandSection(sectionName)) return;
      const item = (sectionName === 'vod' ? recommendedMovies : recommendedSeries).items[Number(recommendationButton.dataset.i)];
      if (item) openTitle(sectionName, item);
    };
  });
  queryAll(homeScreen, '[data-watched]').forEach(watchedButton => {
    watchedButton.onclick = () => {
      const sectionName = watchedButton.dataset.watched;
      if (!isOnDemandSection(sectionName)) return;
      const watchedEntry = (sectionName === 'vod' ? watchedMovies : watchedSeries)[Number(watchedButton.dataset.i)];
      if (watchedEntry) openTitle(sectionName, watchedEntry.item);
    };
  });
  queryAll(homeScreen, '[data-top]').forEach(topButton => {
    topButton.onclick = () => {
      const sectionName = topButton.dataset.top;
      if (!isOnDemandSection(sectionName)) return;
      const item = (sectionName === 'vod' ? topMovies : topSeries).items[Number(topButton.dataset.rank)];
      if (item) openTitle(sectionName, item);
    };
  });
  queryAll(homeScreen, '.card-del').forEach(removeButton => {
    removeButton.onclick = clickEvent => {
      clickEvent.stopPropagation();
      const cardElement = query(removeButton.parentElement ?? removeButton, '.card');
      if (!cardElement) return;
      const historyRef = cardElement.dataset.cont
        ? continueWatching[Number(cardElement.dataset.cont)]?.ref
        : cardElement.dataset.watched
          ? (cardElement.dataset.watched === 'vod' ? watchedMovies : watchedSeries)[Number(cardElement.dataset.i)]?.ref
          : undefined;
      if (historyRef) removeHistoryEntry(historyRef);
      else if (cardElement.dataset.live) removeRecentChannel(cardElement.dataset.live);
      toast('Removido do histórico.');
      const hadFocus = document.activeElement === removeButton;
      const shelfElement = removeButton.closest('.shelf');
      const shelfClass = [...(shelfElement?.classList ?? [])].find(className => className.startsWith('shelf-'));
      const cardIndex = shelfElement ? queryAll(shelfElement, '.card').indexOf(cardElement) : 0;
      renderHome();
      if (!hadFocus) return;
      const shelfCards = shelfClass ? queryAll(document, '#home .' + shelfClass + ' .card') : [];
      (shelfCards[Math.min(cardIndex, shelfCards.length - 1)] ?? query(document, '#home .tile'))?.focus();
    };
  });
  queryAll(homeScreen, '[data-live]').forEach(channelButton => {
    channelButton.onclick = () => {
      const channel = catalog.live.items.find(item => item.k === channelButton.dataset.live);
      playLive(channel, catalog.live.items);
    };
  });
}
/**
 * Abre os detalhes de um filme ou série, pedindo o PIN se a categoria estiver bloqueada.
 * @param sectionName Seção.
 * @param item Filme ou série.
 */
function openTitle(sectionName: OnDemandSection, item: Item): void {
  withPin(sectionName + ':' + item.cat, () => void (sectionName === 'vod' ? openMovie(item) : openSeries(item)));
}
/** Tipo de prateleira da tela inicial. */
type ShelfKind = 'cont' | 'recent' | 'fav' | 'topvod' | 'topseries' | 'recvod' | 'recseries' | 'watchedvod' | 'watchedseries';

/** Ícone de cada prateleira. */
const SHELF_ICONS: Record<ShelfKind, IconName> = {
  cont: 'cont',
  recent: 'recent',
  fav: 'star',
  topvod: 'trophy',
  topseries: 'trophy',
  recvod: 'sparkle',
  recseries: 'sparkle',
  watchedvod: 'check',
  watchedseries: 'check',
};

/**
 * Indica se um registro do histórico entra em "Continuar assistindo": dá para retomar e falta ver.
 * @param historyEntry Registro.
 * @returns `true` se o título ainda não terminou.
 */
const isUnfinished = (historyEntry: HistoryEntry): historyEntry is ResumableEntry =>
  !historyEntry.hidden && !!historyEntry.desc && !!historyEntry.dur && historyEntry.pos / historyEntry.dur < 0.95;

/**
 * HTML de uma prateleira da tela inicial: cabeçalho com ícone, contagem e setas para rolar,
 * e a faixa de cartões (ou um estado vazio).
 * @param kind Tipo (define ícone e cor).
 * @param title Título.
 * @param subtitle Subtítulo.
 * @param itemCount Quantidade de itens.
 * @param itemsHtml HTML dos cartões.
 * @param emptyText Texto do estado vazio.
 * @returns HTML.
 */
const shelfHtml = (
  kind: ShelfKind,
  title: string,
  subtitle: string,
  itemCount: number,
  itemsHtml: string,
  emptyText: string,
): string => `<section class="shelf shelf-${kind}">
  <div class="shelf-h"><span class="shelf-ico" aria-hidden="true">${icon(SHELF_ICONS[kind])}</span><div><h2>${title}</h2><small>${subtitle}</small></div>${itemCount ? `<span class="shelf-n">${itemCount}</span>${scrollArrowsHtml()}` : ''}</div>
  ${itemCount ? `<div class="strip">${itemsHtml}</div>` : `<div class="shelf-empty"><span class="shelf-ghost"></span><span class="shelf-ghost"></span><span class="shelf-ghost"></span><p>${emptyText}</p></div>`}
</section>`;
/**
 * HTML do botão "×" que remove um cartão do histórico, ao lado do cartão (um botão dentro do outro não é válido).
 * @param name Nome do que será removido.
 * @returns HTML.
 */
const removeFromHistoryHtml = (name: string): string =>
  `<button type="button" class="card-del" aria-label="Remover ${esc(name)} do histórico" title="Remover do histórico">${icon('close')}</button>`;
/**
 * HTML do cartão compacto de um canal.
 * @param channel Canal.
 * @param removable Mostrar o botão de remover do histórico.
 * @returns HTML.
 */
const chipHtml = (channel: Item, removable?: boolean): string =>
  withRemoveButton(
    `<button type="button" class="card" data-live="${esc(channel.k)}"><div class="poster" style="aspect-ratio:16/10">${channel.logo ? `<img loading="lazy" src="${esc(channel.logo)}" alt="" style="object-fit:contain;padding:10px" onerror="this.remove()">` : ''}<span aria-hidden="true">${initials(channel.name)}</span></div><b>${esc(channel.name)}</b></button>`,
    removable ? channel.name : null,
  );
/**
 * Põe o botão de remover ao lado de um cartão, dentro de um invólucro que ocupa o lugar do cartão na faixa.
 * @param cardHtmlText HTML do cartão.
 * @param removableName Nome do item, se o cartão puder ser removido do histórico; `null` se não puder.
 * @returns HTML.
 */
const withRemoveButton = (cardHtmlText: string, removableName: string | null): string =>
  removableName === null ? cardHtmlText : `<div class="card-wrap">${cardHtmlText}${removeFromHistoryHtml(removableName)}</div>`;
/**
 * HTML do pôster de um filme, série ou item do histórico (capa, iniciais, nota, progresso).
 * @param cardData Dados do cartão (`pg` = progresso de 0 a 1; `removable` mostra o botão de remover do histórico; `rank` mostra a posição do Top 10).
 * @returns HTML.
 */
const posterHtml = (cardData: { name: string; logo?: string; rate?: number; pg?: number; removable?: boolean; rank?: number }): string =>
  `<div class="poster"><span aria-hidden="true">${initials(cardData.name)}</span>${cardData.logo ? `<img loading="lazy" src="${esc(cardData.logo)}" alt="" onerror="this.remove()">` : ''}${cardData.rate ? `<span class="rt" aria-hidden="true">★ ${(+cardData.rate).toFixed(1)}</span>` : ''}${cardData.pg ? `<span class="pg" style="width:${Math.min(100, cardData.pg * 100)}%"></span>` : ''}${cardData.rank ? `<span class="top-shade"></span><span class="top-rank" aria-hidden="true">${cardData.rank}</span>` : ''}</div>`;
/**
 * Texto só para leitor de tela com a nota e o progresso de um cartão.
 * @param cardData Dados do cartão.
 * @returns HTML.
 */
const cardSpokenDetails = (cardData: { rate?: number; pg?: number }): string => {
  const details = [
    cardData.rate ? `nota ${(+cardData.rate).toFixed(1)}` : '',
    cardData.pg ? `${Math.round(Math.min(100, cardData.pg * 100))}% assistido` : '',
  ].filter(Boolean);
  return details.length ? `<span class="visually-hidden">, ${details.join(', ')}</span>` : '';
};
/**
 * HTML do cartão com pôster de um filme, série ou item do histórico.
 * @param cardData Dados do cartão.
 * @param extraAttributes Atributos extras do botão.
 * @returns HTML.
 */
export const cardHtml = (
  cardData: { name: string; logo?: string; rate?: number; pg?: number; removable?: boolean },
  extraAttributes: string,
): string =>
  withRemoveButton(
    `<button type="button" class="card" ${extraAttributes}>${posterHtml(cardData)}<b>${esc(cardData.name)}</b>${cardSpokenDetails(cardData)}</button>`,
    cardData.removable ? cardData.name : null,
  );
/**
 * HTML do cartão do Top 10: o número da posição fica dentro do pôster, sobre um degradê.
 * @param item Filme ou série.
 * @param index Posição (0 = primeiro).
 * @param sectionName Seção.
 * @returns HTML.
 */
const topCardHtml = (item: Item, index: number, sectionName: OnDemandSection): string =>
  `<button type="button" class="card top-card" data-top="${sectionName}" data-rank="${index}" data-fav="${sectionName}:${esc(item.k)}" aria-label="${index + 1}º: ${esc(item.name)}">${posterHtml({ ...item, rank: index + 1 })}<b>${esc(item.name)}</b></button>`;

/** Títulos do Top 10 e de onde vieram (texto do subtítulo). */
interface WeeklyTop {
  items: Item[];
  source: string;
}

/** Título do bloco "assistidos", com a referência do registro no histórico. */
interface WatchedTitle {
  item: Item;
  ref: string;
}

/** Quantidade de títulos do Top 10. */
const TOP_SIZE = 10;
/** Janela dos "adicionados na semana", em segundos (7 dias). */
const TOP_WEEK_SECONDS = 7 * 24 * 60 * 60;
/** Nomes de categoria que a própria lista usa para destaques (Top 10, em alta, mais vistos…). */
const TOP_CATEGORY_PATTERN =
  /top\s*\d+|em\s*alta|mais\s*(vistos|assistidos|populares)|populares|trending|tend[eê]ncia|da\s*semana|destaques?/i;
/**
 * Prioridade de uma categoria de destaque: "da semana" vem antes de "Top 10", que vem antes do resto.
 * @param categoryName Nome da categoria.
 * @returns Prioridade (maior = melhor).
 */
const topCategoryPriority = (categoryName: string): number => (/semana/i.test(categoryName) ? 3 : /top\s*\d+/i.test(categoryName) ? 2 : 1);
/**
 * Até 10 itens sem títulos repetidos.
 * @param items Itens em ordem.
 * @returns Primeiros 10 títulos diferentes.
 */
function firstUniqueTitles(items: Item[]): Item[] {
  const seenNames = new Set<string>(),
    uniqueItems: Item[] = [];
  for (const item of items) {
    const nameKey = topNameKey(item.name);
    if (seenNames.has(nameKey)) continue;
    seenNames.add(nameKey);
    uniqueItems.push(item);
    if (uniqueItems.length === TOP_SIZE) break;
  }
  return uniqueItems;
}
/** Top da semana já calculado por seção. */
const weeklyTopCache = new WeakMap<SectionData, { signature: string; top: WeeklyTop }>();
/**
 * Top 10 da semana tirado da própria lista: a categoria de destaque dela ("Top 10", "Em alta",
 * "Mais vistos da semana"…) na ordem do servidor; se não houver, os adicionados nos últimos
 * 7 dias, dos mais novos para os mais antigos. Ignora categorias ocultas, bloqueadas e adultas.
 * @param sectionName Seção.
 * @returns Títulos e de onde vieram (texto do subtítulo).
 */
function weeklyTop(sectionName: OnDemandSection): WeeklyTop {
  const sectionData = state.catalog?.[sectionName];
  if (!sectionData) return { items: [], source: '' };
  const signature = state.userData.hidden.join('|') + '#' + state.userData.locked.join('|');
  const cached = weeklyTopCache.get(sectionData);
  if (cached && cached.signature === signature) return cached.top;
  const allowedCategoryIds = visibleCategoryIds(sectionName);
  const highlightCategories = sectionData.cats
    .filter(category => allowedCategoryIds.has(category.id) && TOP_CATEGORY_PATTERN.test(category.name))
    .sort((first, second) => topCategoryPriority(second.name) - topCategoryPriority(first.name));
  let top: WeeklyTop = { items: [], source: '' };
  for (const category of highlightCategories) {
    const categoryItems = firstUniqueTitles(sectionData.items.filter(item => item.cat === category.id));
    if (categoryItems.length) {
      top = { items: categoryItems, source: 'Da categoria “' + category.name + '” da sua lista' };
      break;
    }
  }
  if (!top.items.length) {
    const weekStart = Date.now() / 1000 - TOP_WEEK_SECONDS;
    const addedThisWeek = sectionData.items
      .filter(item => (item.added ?? 0) >= weekStart && allowedCategoryIds.has(item.cat))
      .sort((first, second) => (second.added ?? 0) - (first.added ?? 0) || (second.rate || 0) - (first.rate || 0));
    top = { items: firstUniqueTitles(addedThisWeek), source: 'Adicionados à sua lista nos últimos 7 dias' };
  }
  weeklyTopCache.set(sectionData, { signature, top });
  return top;
}
/**
 * HTML da prateleira "Top 10 … da semana" (não aparece se a lista não tiver destaques nem novidades).
 * @param sectionName Seção.
 * @param top Títulos e origem.
 * @returns HTML.
 */
function weeklyTopShelfHtml(sectionName: OnDemandSection, top: WeeklyTop): string {
  if (!top.items.length) return '';
  const kind = sectionName === 'vod' ? 'topvod' : 'topseries',
    title = sectionName === 'vod' ? 'Top 10 filmes da semana' : 'Top 10 séries da semana';
  return shelfHtml(
    kind,
    title,
    esc(top.source),
    top.items.length,
    top.items.map((item, index) => topCardHtml(item, index, sectionName)).join(''),
    '',
  );
}
/**
 * HTML da prateleira de recomendações ("Filmes recomendados" ou "Séries recomendadas"), que só
 * aparece quando o histórico do perfil tem algo a dizer sobre a seção.
 * @param sectionName Seção.
 * @param recommendations Títulos e motivo (de `recommendedItems`).
 * @returns HTML.
 */
function recommendationShelfHtml(sectionName: OnDemandSection, recommendations: Recommendations): string {
  if (!recommendations.items.length) return '';
  const kind = sectionName === 'vod' ? 'recvod' : 'recseries',
    title = sectionName === 'vod' ? 'Filmes recomendados' : 'Séries recomendadas';
  return shelfHtml(
    kind,
    title,
    esc(recommendations.reason),
    recommendations.items.length,
    recommendations.items
      .map((item, index) => cardHtml(item, `data-rec="${sectionName}" data-i="${index}" data-fav="${sectionName}:${esc(item.k)}"`))
      .join(''),
    '',
  );
}
/**
 * Títulos do histórico do perfil para o bloco "assistidos": filmes que ele terminou de ver
 * (95% ou mais, o complemento de "Continuar assistindo") ou séries das quais viu algum episódio,
 * do mais recente para o mais antigo.
 * @param sectionName Seção.
 * @returns Até 20 títulos com a referência do registro no histórico.
 */
function watchedTitleEntries(sectionName: OnDemandSection): WatchedTitle[] {
  const sectionData = state.catalog?.[sectionName];
  if (!sectionData) return [];
  const isSeries = sectionName === 'series',
    itemsByKey = recommendationIndex(sectionData).byKey,
    watchedEntries: WatchedTitle[] = [];
  for (const historyEntry of state.userData.hist) {
    if (historyEntry.hidden || !historyEntry.ref) continue;
    if (
      isSeries
        ? !historyEntry.series
        : historyEntry.series || historyEntry.ref.indexOf('vod:') !== 0 || !historyEntry.dur || historyEntry.pos / historyEntry.dur < 0.95
    )
      continue;
    const item = itemsByKey.get(isSeries ? (historyEntry.series ?? '').slice('series:'.length) : historyEntry.ref.slice('vod:'.length));
    if (item) watchedEntries.push({ item, ref: historyEntry.ref });
    if (watchedEntries.length === 20) break;
  }
  return watchedEntries;
}
/**
 * HTML do bloco "Filmes assistidos" ou "Séries assistidas" (some se o histórico não tiver nada).
 * @param sectionName Seção.
 * @param watchedEntries Títulos (de `watchedTitleEntries`).
 * @returns HTML.
 */
function watchedShelfHtml(sectionName: OnDemandSection, watchedEntries: WatchedTitle[]): string {
  if (!watchedEntries.length) return '';
  const isMovie = sectionName === 'vod';
  return shelfHtml(
    isMovie ? 'watchedvod' : 'watchedseries',
    isMovie ? 'Filmes assistidos' : 'Séries assistidas',
    isMovie ? 'Filmes que você terminou de ver' : 'Séries que você já começou',
    watchedEntries.length,
    watchedEntries
      .map(({ item }, index) =>
        cardHtml({ ...item, removable: true }, `data-watched="${sectionName}" data-i="${index}" data-fav="${sectionName}:${esc(item.k)}"`),
      )
      .join(''),
    '',
  );
}

/**
 * Liga os eventos desta parte do app. Chamada uma vez, na ordem de `main.ts`.
 */
export function initHome(): void {
  /**
   * Atualiza os relógios do topo e do player a cada segundo.
   */
  setInterval(() => {
    const currentTimeText = formatHourMinute(new Date());
    $('clock').textContent = currentTimeText;
    $('plClock').textContent = currentTimeText;
  }, 1000);

  /**
   * Volta para a tela inicial.
   */
  $('goHome').onclick = () => show('home');

  showSavedTheme();

  /**
   * Alterna o tema (automático → claro → escuro) e avisa qual ficou ativo.
   */
  $('themeBtn').onclick = () => {
    const mode = cycleTheme();
    showThemeMode(mode);
    toast('Tema: ' + THEME_INFO[mode].label);
  };
}
