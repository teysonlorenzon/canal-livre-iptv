'use strict';
/**
 * Recomendações do perfil ativo a partir do histórico de filmes e séries da lista ativa.
 * Tudo é calculado na hora a partir de `userData.hist` (que já é por perfil e por lista):
 * não há nada salvo à parte, então limpar o histórico ou remover um item zera ou atualiza
 * as recomendações automaticamente.
 *
 * Cada título assistido pesa conforme o quanto foi visto e há quanto tempo. Com esses pesos,
 * monta-se o gosto do perfil: categorias da mesma seção, gêneros (palavras do nome da
 * categoria, que valem entre filmes e séries) e palavras dos títulos (franquias e sequências).
 */

/** @type {number} Máximo de títulos recomendados por seção. */
const RECOMMENDATION_SIZE = 20;
/** @type {number} Máximo de recomendações da mesma categoria, para variar. */
const RECOMMENDATION_MAX_PER_CATEGORY = 6;
/** @type {number} Em quantos dias o peso de um título assistido cai pela metade. */
const RECOMMENDATION_HALF_LIFE_DAYS = 30;
/** @type {number} Uma palavra de título só liga franquias se aparecer em até esta fração dos itens da seção… */
const TITLE_WORD_MAX_SHARE = 0.002;
/** @type {number} …ou em até esta quantidade de itens (o que for maior). */
const TITLE_WORD_MIN_LIMIT = 20;
/** @type {number} Janela (em dias) em que títulos recém-adicionados ganham um pequeno bônus. */
const RECOMMENDATION_NEW_DAYS = 60;
/** @type {Set<string>} Palavras de nomes de categoria que não indicam gênero. */
const GENERIC_CATEGORY_WORDS = new Set(['filme', 'filmes', 'serie', 'series', 'lancamento', 'lancamentos', 'dublado', 'dublados', 'legendado', 'legendados', 'dual', 'audio', 'fhd', 'uhd', 'netflix', 'amazon', 'prime', 'video', 'disney', 'hbo', 'max', 'globoplay', 'apple', 'paramount', 'star', 'crunchyroll', 'top', 'todos', 'todas', 'outros', 'outras', 'geral', 'colecao', 'colecoes', 'vod', 'cinema', 'alta', 'mais', 'vistos', 'semana', 'novos', 'novas', 'destaque', 'destaques', 'populares']);
/** @type {Set<string>} Palavras comuns de títulos que não indicam franquia. */
const COMMON_TITLE_WORDS = new Set(['the', 'and', 'para', 'como', 'com', 'dos', 'das', 'uma', 'umas', 'uns', 'temporada', 'parte', 'filme', 'serie', 'series', 'season', 'movie', 'from', 'that', 'this', 'with', 'your', 'sobre', 'depois', 'antes', 'entre', 'todos', 'tudo', 'nosso', 'nossa', 'dublado', 'legendado', 'versao', 'estendida', 'edition', 'part', 'chapter', 'capitulo']);

/**
 * Palavras de um texto, em minúsculas e sem acentos, ignorando marcações entre colchetes e parênteses.
 * @param {string} text Texto.
 * @returns {string[]} Palavras.
 */
const plainWords = text => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').split(/[^a-z0-9]+/).filter(Boolean);
/**
 * Palavras de gênero do nome de uma categoria (ex.: "Filmes | Terror 4K" → ["terror"]).
 * @param {string} categoryName Nome da categoria.
 * @returns {string[]} Palavras de gênero.
 */
const genreWords = categoryName => plainWords(categoryName).filter(word => word.length >= 3 && !/^\d+$/.test(word) && !GENERIC_CATEGORY_WORDS.has(word));
/**
 * Palavras marcantes de um título, que ligam sequências e franquias (ex.: "velozes", "furiosos").
 * @param {string} name Nome do título.
 * @returns {string[]} Palavras sem repetição.
 */
const titleWords = name => [...new Set(plainWords(name).filter(word => word.length >= 4 && !/^\d+$/.test(word) && !COMMON_TITLE_WORDS.has(word)))];

/**
 * Soma um valor numa chave de um mapa de pesos.
 * @param {Map<string, number>} weights Mapa de pesos.
 * @param {string} key Chave.
 * @param {number} value Valor a somar.
 * @returns {void}
 */
const addWeight = (weights, key, value) => weights.set(key, (weights.get(key) || 0) + value);
/**
 * Divide todos os pesos pelo maior, deixando-os entre 0 e 1.
 * @param {Map<string, number>} weights Mapa de pesos.
 * @returns {Map<string, number>} O mesmo mapa, normalizado.
 */
function normalizeWeights(weights){
  const highest = Math.max(0, ...weights.values());
  if (highest > 0) weights.forEach((value, key) => weights.set(key, value / highest));
  return weights;
}

/** @type {WeakMap<DadosSecao, {byKey: Map<string, Item>, categoryNames: Map<string, string>, itemTitleWords: string[][]|null, titleWordCounts: Map<string, number>|null}>} Índices por seção. */
const recommendationIndexes = new WeakMap();
/**
 * Índices de uma seção: item por chave, nome de cada categoria e, quando forem pedidas, as
 * palavras do título de cada item (na mesma ordem de `items`) e em quantos itens cada palavra
 * aparece. Montados uma vez por seção.
 * @param {DadosSecao} sectionData Seção.
 * @returns {{byKey: Map<string, Item>, categoryNames: Map<string, string>, itemTitleWords: string[][]|null, titleWordCounts: Map<string, number>|null}} Índices.
 */
function recommendationIndex(sectionData){
  let index = recommendationIndexes.get(sectionData);
  if (!index) {
    index = { byKey:new Map(sectionData.items.map(item => [String(item.k), item])), categoryNames:new Map(sectionData.cats.map(category => [category.id, category.name])), itemTitleWords:null, titleWordCounts:null };
    recommendationIndexes.set(sectionData, index);
  }
  return index;
}

/**
 * Títulos assistidos do histórico (filmes e séries da lista ativa), com o peso de cada um:
 * quanto foi visto (90% ou mais conta inteiro, mínimo 25%) vezes a recência (meia-vida de 30 dias).
 * @returns {{sectionName: 'vod'|'series', item: Item, weight: number}[]} Títulos assistidos.
 */
function watchedTitles(){
  const now = Date.now();
  return userData.hist.filter(entry => !entry.hidden && entry.ref).map(entry => {
    const sectionName = entry.series ? 'series' : entry.ref.indexOf('vod:') === 0 ? 'vod' : null;
    const sectionData = sectionName && catalog[sectionName];
    if (!sectionData) return null;
    const item = recommendationIndex(sectionData).byKey.get(entry.series ? entry.series.slice('series:'.length) : entry.ref.slice('vod:'.length));
    if (!item) return null;
    const progress = entry.dur ? entry.pos / entry.dur : 0;
    const ageInDays = Math.max(0, now - (entry.t || now)) / 86400000;
    return { sectionName, item, weight:(progress >= 0.9 ? 1 : Math.max(0.25, progress)) * Math.pow(0.5, ageInDays / RECOMMENDATION_HALF_LIFE_DAYS) };
  }).filter(Boolean);
}

/** @type {WeakMap<DadosSecao, {signature: string, result: {items: Item[], reason: string}}>} Recomendações já calculadas. */
const recommendationCache = new WeakMap();
/**
 * Recomendações de filmes ou séries para o perfil ativo. Deixa de fora o que já foi assistido
 * (e outras versões do mesmo título), categorias ocultas, bloqueadas ou adultas e títulos sem
 * nenhuma ligação com o histórico.
 * @param {'vod'|'series'} sectionName Seção.
 * @returns {{items: Item[], reason: string}} Até 20 títulos e o texto do motivo (vazio se não houver).
 */
function recommendedItems(sectionName){
  const empty = { items:[], reason:'' };
  const sectionData = catalog && catalog[sectionName];
  if (!sectionData || !userData.hist.length) return empty;
  const signature = [userData.hist.length, userData.hist[0].t, userData.hist[0].ref, !!catalog.vod, !!catalog.series, userData.hidden.join('|'), userData.locked.join('|')].join('#');
  const cached = recommendationCache.get(sectionData); if (cached && cached.signature === signature) return cached.result;

  const watched = watchedTitles();
  const categoryWeights = new Map(), genreWeights = new Map(), titleWordWeights = new Map(), watchedKeys = new Set(), watchedNames = new Set();
  for (const watchedTitle of watched) {
    const categoryName = recommendationIndex(catalog[watchedTitle.sectionName]).categoryNames.get(watchedTitle.item.cat) || '';
    if (watchedTitle.sectionName === sectionName) { addWeight(categoryWeights, watchedTitle.item.cat, watchedTitle.weight); watchedKeys.add(String(watchedTitle.item.k)); }
    genreWords(categoryName).forEach(word => addWeight(genreWeights, word, watchedTitle.weight));
    titleWords(watchedTitle.item.name).forEach(word => addWeight(titleWordWeights, word, watchedTitle.weight));
    watchedNames.add(topNameKey(watchedTitle.item.name));
  }
  normalizeWeights(categoryWeights); normalizeWeights(genreWeights); normalizeWeights(titleWordWeights);
  if (!categoryWeights.size && !genreWeights.size) { recommendationCache.set(sectionData, { signature, result:empty }); return empty; }

  const allowedCategories = visibleCategoryIds(sectionName);
  const genreScoreByCategory = new Map(sectionData.cats.map(category => [category.id, Math.max(0, ...genreWords(category.name).map(word => genreWeights.get(word) || 0))]));
  const nowInSeconds = Date.now() / 1000;
  const scored = [];
  const index = recommendationIndex(sectionData);
  if (titleWordWeights.size && !index.itemTitleWords) {
    index.itemTitleWords = sectionData.items.map(item => titleWords(item.name));
    index.titleWordCounts = new Map(); index.itemTitleWords.forEach(words => words.forEach(word => addWeight(index.titleWordCounts, word, 1)));
  }
  if (titleWordWeights.size) {
    const titleWordLimit = Math.max(TITLE_WORD_MIN_LIMIT, sectionData.items.length * TITLE_WORD_MAX_SHARE);
    titleWordWeights.forEach((weight, word) => { if ((index.titleWordCounts.get(word) || 0) > titleWordLimit) titleWordWeights.delete(word); });
  }
  sectionData.items.forEach((item, itemIndex) => {
    if (watchedKeys.has(String(item.k)) || !allowedCategories.has(item.cat)) return;
    const titleScore = titleWordWeights.size ? Math.min(2, 0.8 * index.itemTitleWords[itemIndex].reduce((total, word) => total + (titleWordWeights.get(word) || 0), 0)) : 0;
    const affinity = Math.max(categoryWeights.get(item.cat) || 0, 0.6 * (genreScoreByCategory.get(item.cat) || 0)) + titleScore;
    if (affinity <= 0) return;
    const ageInDays = item.added ? (nowInSeconds - item.added) / 86400 : Infinity;
    const newBonus = ageInDays >= 0 && ageInDays < RECOMMENDATION_NEW_DAYS ? 0.2 * (1 - ageInDays / RECOMMENDATION_NEW_DAYS) : 0;
    scored.push({ item, score:affinity + (item.rate || 0) / 10 * 0.3 + newBonus });
  });
  scored.sort((first, second) => second.score - first.score);

  const items = [], usedNames = new Set(watchedNames), countByCategory = new Map();
  for (const { item } of scored) {
    const nameKey = topNameKey(item.name);
    if (usedNames.has(nameKey) || (countByCategory.get(item.cat) || 0) >= RECOMMENDATION_MAX_PER_CATEGORY) continue;
    usedNames.add(nameKey); addWeight(countByCategory, item.cat, 1); items.push(item);
    if (items.length === RECOMMENDATION_SIZE) break;
  }
  const watchedHere = watched.filter(watchedTitle => watchedTitle.sectionName === sectionName).sort((first, second) => second.weight - first.weight);
  const reason = watchedHere.length ? 'Porque você assistiu “' + watchedHere[0].item.name + '”' + (watchedHere.length > 1 ? ' e outros' : '') : 'Com base no que você assistiu';
  const result = { items, reason };
  recommendationCache.set(sectionData, { signature, result });
  return result;
}
