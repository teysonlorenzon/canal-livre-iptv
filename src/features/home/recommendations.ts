import { state } from '../../core/state';
import type { Item, OnDemandSection, SectionData } from '../../core/types';
import { ADULT_PATTERN } from '../../core/utils';

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

/** Máximo de títulos recomendados por seção. */
const RECOMMENDATION_SIZE = 20;
/** Máximo de recomendações da mesma categoria, para variar. */
const RECOMMENDATION_MAX_PER_CATEGORY = 6;
/** Em quantos dias o peso de um título assistido cai pela metade. */
const RECOMMENDATION_HALF_LIFE_DAYS = 30;
/** Uma palavra de título só liga franquias se aparecer em até esta fração dos itens da seção… */
const TITLE_WORD_MAX_SHARE = 0.002;
/** …ou em até esta quantidade de itens (o que for maior). */
const TITLE_WORD_MIN_LIMIT = 20;
/** Janela (em dias) em que títulos recém-adicionados ganham um pequeno bônus. */
const RECOMMENDATION_NEW_DAYS = 60;
/** Palavras de nomes de categoria que não indicam gênero. */
const GENERIC_CATEGORY_WORDS: Set<string> = new Set([
  'filme',
  'filmes',
  'serie',
  'series',
  'lancamento',
  'lancamentos',
  'dublado',
  'dublados',
  'legendado',
  'legendados',
  'dual',
  'audio',
  'fhd',
  'uhd',
  'netflix',
  'amazon',
  'prime',
  'video',
  'disney',
  'hbo',
  'max',
  'globoplay',
  'apple',
  'paramount',
  'star',
  'crunchyroll',
  'top',
  'todos',
  'todas',
  'outros',
  'outras',
  'geral',
  'colecao',
  'colecoes',
  'vod',
  'cinema',
  'alta',
  'mais',
  'vistos',
  'semana',
  'novos',
  'novas',
  'destaque',
  'destaques',
  'populares',
]);
/** Palavras comuns de títulos que não indicam franquia. */
const COMMON_TITLE_WORDS: Set<string> = new Set([
  'the',
  'and',
  'para',
  'como',
  'com',
  'dos',
  'das',
  'uma',
  'umas',
  'uns',
  'temporada',
  'parte',
  'filme',
  'serie',
  'series',
  'season',
  'movie',
  'from',
  'that',
  'this',
  'with',
  'your',
  'sobre',
  'depois',
  'antes',
  'entre',
  'todos',
  'tudo',
  'nosso',
  'nossa',
  'dublado',
  'legendado',
  'versao',
  'estendida',
  'edition',
  'part',
  'chapter',
  'capitulo',
]);

/**
 * Palavras de um texto, em minúsculas e sem acentos, ignorando marcações entre colchetes e parênteses.
 * @param text Texto.
 * @returns Palavras.
 */
const plainWords = (text: string): string[] =>
  String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
/**
 * Palavras de gênero do nome de uma categoria (ex.: "Filmes | Terror 4K" → ["terror"]).
 * @param categoryName Nome da categoria.
 * @returns Palavras de gênero.
 */
const genreWords = (categoryName: string): string[] =>
  plainWords(categoryName).filter(word => word.length >= 3 && !/^\d+$/.test(word) && !GENERIC_CATEGORY_WORDS.has(word));
/**
 * Palavras marcantes de um título, que ligam sequências e franquias (ex.: "velozes", "furiosos").
 * @param name Nome do título.
 * @returns Palavras sem repetição.
 */
const titleWords = (name: string): string[] => [
  ...new Set(plainWords(name).filter(word => word.length >= 4 && !/^\d+$/.test(word) && !COMMON_TITLE_WORDS.has(word))),
];

/**
 * Soma um valor numa chave de um mapa de pesos.
 * @param weights Mapa de pesos.
 * @param key Chave.
 * @param value Valor a somar.
 */
const addWeight = (weights: Map<string, number>, key: string, value: number): void => {
  weights.set(key, (weights.get(key) || 0) + value);
};
/**
 * Divide todos os pesos pelo maior, deixando-os entre 0 e 1.
 * @param weights Mapa de pesos.
 * @returns O mesmo mapa, normalizado.
 */
function normalizeWeights(weights: Map<string, number>): Map<string, number> {
  const highest = Math.max(0, ...weights.values());
  if (highest > 0) weights.forEach((value, key) => weights.set(key, value / highest));
  return weights;
}

/** Palavras dos títulos de uma seção. */
interface TitleWordIndex {
  /** Palavras do título de cada item, na mesma ordem de `items`. */
  itemWords: string[][];
  /** Em quantos itens cada palavra aparece. */
  wordCounts: Map<string, number>;
}

/** Índices de uma seção. */
interface SectionIndex {
  /** Item por chave. */
  byKey: Map<string, Item>;
  /** Nome de cada categoria. */
  categoryNames: Map<string, string>;
  /** Palavras dos títulos, montadas só quando forem pedidas. */
  titleWords: TitleWordIndex | null;
}

/** Títulos recomendados e o motivo. */
export interface Recommendations {
  items: Item[];
  reason: string;
}

/** Índices já montados por seção. */
const recommendationIndexes = new WeakMap<SectionData, SectionIndex>();

/**
 * Índices de uma seção, montados uma vez por seção.
 * @param sectionData Seção.
 * @returns Índices.
 */
export function recommendationIndex(sectionData: SectionData): SectionIndex {
  let index = recommendationIndexes.get(sectionData);
  if (!index) {
    index = {
      byKey: new Map(sectionData.items.map(item => [String(item.k), item])),
      categoryNames: new Map(sectionData.cats.map(category => [category.id, category.name])),
      titleWords: null,
    };
    recommendationIndexes.set(sectionData, index);
  }
  return index;
}

/**
 * Monta o índice de palavras dos títulos de uma seção.
 * @param sectionData Seção.
 * @returns Palavras de cada item e em quantos itens cada palavra aparece.
 */
function buildTitleWordIndex(sectionData: SectionData): TitleWordIndex {
  const itemWords = sectionData.items.map(item => titleWords(item.name)),
    wordCounts = new Map<string, number>();
  itemWords.forEach(words => words.forEach(word => addWeight(wordCounts, word, 1)));
  return { itemWords, wordCounts };
}

/**
 * Títulos assistidos do histórico (filmes e séries da lista ativa), com o peso de cada um:
 * quanto foi visto (90% ou mais conta inteiro, mínimo 25%) vezes a recência (meia-vida de 30 dias).
 * @returns Títulos assistidos.
 */
function watchedTitles(): { sectionName: OnDemandSection; item: Item; weight: number }[] {
  const now = Date.now();
  const catalog = state.catalog;
  if (!catalog) return [];
  return state.userData.hist
    .filter(entry => !entry.hidden && entry.ref)
    .map(entry => {
      const sectionName: OnDemandSection | null = entry.series ? 'series' : entry.ref.indexOf('vod:') === 0 ? 'vod' : null;
      const sectionData = sectionName && catalog[sectionName];
      if (!sectionName || !sectionData) return null;
      const item = recommendationIndex(sectionData).byKey.get(
        entry.series ? entry.series.slice('series:'.length) : entry.ref.slice('vod:'.length),
      );
      if (!item) return null;
      const progress = entry.dur ? entry.pos / entry.dur : 0;
      const ageInDays = Math.max(0, now - (entry.t || now)) / 86400000;
      return {
        sectionName,
        item,
        weight: (progress >= 0.9 ? 1 : Math.max(0.25, progress)) * Math.pow(0.5, ageInDays / RECOMMENDATION_HALF_LIFE_DAYS),
      };
    })
    .filter(watchedTitle => watchedTitle !== null);
}

/** Recomendações já calculadas. */
const recommendationCache = new WeakMap<SectionData, { signature: string; result: Recommendations }>();
/**
 * Recomendações de filmes ou séries para o perfil ativo. Deixa de fora o que já foi assistido
 * (e outras versões do mesmo título), categorias ocultas, bloqueadas ou adultas e títulos sem
 * nenhuma ligação com o histórico.
 * @param sectionName Seção.
 * @returns Até 20 títulos e o texto do motivo (vazio se não houver).
 */
export function recommendedItems(sectionName: OnDemandSection): Recommendations {
  const empty: Recommendations = { items: [], reason: '' };
  const catalog = state.catalog,
    sectionData = catalog && catalog[sectionName],
    latestEntry = state.userData.hist[0];
  if (!catalog || !sectionData || !latestEntry) return empty;
  const signature = [
    state.userData.hist.length,
    latestEntry.t,
    latestEntry.ref,
    !!catalog.vod,
    !!catalog.series,
    state.userData.hidden.join('|'),
    state.userData.locked.join('|'),
  ].join('#');
  const cached = recommendationCache.get(sectionData);
  if (cached && cached.signature === signature) return cached.result;

  const watched = watchedTitles();
  const categoryWeights = new Map<string, number>(),
    genreWeights = new Map<string, number>(),
    titleWordWeights = new Map<string, number>(),
    watchedKeys = new Set<string>(),
    watchedNames = new Set<string>();
  for (const watchedTitle of watched) {
    const watchedSection = catalog[watchedTitle.sectionName];
    const categoryName = watchedSection ? recommendationIndex(watchedSection).categoryNames.get(watchedTitle.item.cat) || '' : '';
    if (watchedTitle.sectionName === sectionName) {
      addWeight(categoryWeights, watchedTitle.item.cat, watchedTitle.weight);
      watchedKeys.add(String(watchedTitle.item.k));
    }
    genreWords(categoryName).forEach(word => addWeight(genreWeights, word, watchedTitle.weight));
    titleWords(watchedTitle.item.name).forEach(word => addWeight(titleWordWeights, word, watchedTitle.weight));
    watchedNames.add(topNameKey(watchedTitle.item.name));
  }
  normalizeWeights(categoryWeights);
  normalizeWeights(genreWeights);
  normalizeWeights(titleWordWeights);
  if (!categoryWeights.size && !genreWeights.size) {
    recommendationCache.set(sectionData, { signature, result: empty });
    return empty;
  }

  const allowedCategories = visibleCategoryIds(sectionName);
  const genreScoreByCategory = new Map(
    sectionData.cats.map(category => [category.id, Math.max(0, ...genreWords(category.name).map(word => genreWeights.get(word) || 0))]),
  );
  const nowInSeconds = Date.now() / 1000;
  const scored: { item: Item; score: number }[] = [];
  const index = recommendationIndex(sectionData);
  if (titleWordWeights.size && !index.titleWords) index.titleWords = buildTitleWordIndex(sectionData);
  const titleWordIndex = index.titleWords;
  if (titleWordIndex) {
    const titleWordLimit = Math.max(TITLE_WORD_MIN_LIMIT, sectionData.items.length * TITLE_WORD_MAX_SHARE);
    titleWordWeights.forEach((_, word) => {
      if ((titleWordIndex.wordCounts.get(word) || 0) > titleWordLimit) titleWordWeights.delete(word);
    });
  }
  sectionData.items.forEach((item, itemIndex) => {
    if (watchedKeys.has(String(item.k)) || !allowedCategories.has(item.cat)) return;
    const itemWords = titleWordIndex?.itemWords[itemIndex] ?? [];
    const titleScore = titleWordWeights.size
      ? Math.min(2, 0.8 * itemWords.reduce((total, word) => total + (titleWordWeights.get(word) || 0), 0))
      : 0;
    const affinity = Math.max(categoryWeights.get(item.cat) || 0, 0.6 * (genreScoreByCategory.get(item.cat) || 0)) + titleScore;
    if (affinity <= 0) return;
    const ageInDays = item.added ? (nowInSeconds - item.added) / 86400 : Infinity;
    const newBonus = ageInDays >= 0 && ageInDays < RECOMMENDATION_NEW_DAYS ? 0.2 * (1 - ageInDays / RECOMMENDATION_NEW_DAYS) : 0;
    scored.push({ item, score: affinity + ((item.rate || 0) / 10) * 0.3 + newBonus });
  });
  scored.sort((first, second) => second.score - first.score);

  const items: Item[] = [],
    usedNames = new Set(watchedNames),
    countByCategory = new Map<string, number>();
  for (const { item } of scored) {
    const nameKey = topNameKey(item.name);
    if (usedNames.has(nameKey) || (countByCategory.get(item.cat) || 0) >= RECOMMENDATION_MAX_PER_CATEGORY) continue;
    usedNames.add(nameKey);
    addWeight(countByCategory, item.cat, 1);
    items.push(item);
    if (items.length === RECOMMENDATION_SIZE) break;
  }
  const watchedHere = watched
    .filter(watchedTitle => watchedTitle.sectionName === sectionName)
    .sort((first, second) => second.weight - first.weight);
  const reason = watchedHere[0]
    ? 'Porque você assistiu “' + watchedHere[0].item.name + '”' + (watchedHere.length > 1 ? ' e outros' : '')
    : 'Com base no que você assistiu';
  const result = { items, reason };
  recommendationCache.set(sectionData, { signature, result });
  return result;
}

/**
 * Nome simplificado para não repetir versões do mesmo título (ex.: "Filme [4K]" e "Filme").
 * @param name Nome do título.
 * @returns Nome sem marcações de qualidade, idioma e ano.
 */
export const topNameKey = (name: string): string =>
  String(name)
    .toLowerCase()
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/\b(4k|uhd|fhd|hd|sd|h265|hevc|dublado|legendado|dub|leg|dual)\b/g, ' ')
    .replace(/[^a-z0-9à-ú]+/g, ' ')
    .trim();
/**
 * Categorias da seção que podem aparecer em destaques da tela inicial (Top 10, recomendações):
 * sem as ocultas, as bloqueadas pelo PIN e as adultas.
 * @param sectionName Seção.
 * @returns Ids das categorias.
 */
export const visibleCategoryIds = (sectionName: OnDemandSection): Set<string> =>
  new Set(
    (state.catalog?.[sectionName]?.cats ?? [])
      .filter(
        category =>
          !state.userData.hidden.includes(sectionName + ':' + category.id) &&
          !state.userData.locked.includes(sectionName + ':' + category.id) &&
          !ADULT_PATTERN.test(category.name),
      )
      .map(category => category.id),
  );
