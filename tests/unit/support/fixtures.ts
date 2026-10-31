import type { Catalog, HistoryEntry, Item, MediaDescriptor, Programme, SectionData, UserData } from '../../../src/core/types';

/** Lista M3U com canais, filmes e séries, usada em vários testes. */
export const SAMPLE_M3U = [
  '#EXTM3U x-tvg-url="http://epg.test/guia.xml,http://epg.test/outro.xml"',
  '#EXTINF:-1 tvg-id="canal.um" tvg-name="Canal Um" tvg-logo="http://img.test/um.png" group-title="Abertos",Canal Um HD',
  'http://stream.test/um.m3u8',
  '#EXTINF:-1 tvg-id="canal.dois" tvg-logo="" group-title="Abertos" catchup-days="3",Canal Dois',
  'http://stream.test/dois.ts',
  '#EXTINF:-1 group-title="Notícias",Canal Três',
  '#EXTGRP:Jornalismo',
  'http://stream.test/tres',
  '#EXTINF:-1 group-title="Filmes Ação",Filme Bom',
  'http://stream.test/filme.mp4',
  '#EXTINF:-1 group-title="Séries Drama",Minha Série S01E02',
  'http://stream.test/series/ep2.mp4',
  '#EXTINF:-1 group-title="Séries Drama",Minha Série S01E01',
  'http://stream.test/series/ep1.mp4',
  '#EXTINF:-1 group-title="Séries Drama",Sem Marcação',
  'http://stream.test/series/especial.mp4',
  'http://stream.test/sem-meta.m3u8',
].join('\n');

/**
 * Canal de teste.
 * @param number Número do canal.
 * @param extra Campos a trocar.
 * @returns Canal.
 */
export const channel = (number: number, extra: Partial<Item> = {}): Item => ({
  k: 'c' + number,
  name: 'Canal ' + number,
  cat: 'abertos',
  num: number,
  url: `http://stream.test/${number}.m3u8`,
  logo: '',
  epg: 'epg' + number,
  ...extra,
});

/**
 * Filme de teste.
 * @param number Número do filme.
 * @param extra Campos a trocar.
 * @returns Filme.
 */
export const movie = (number: number, extra: Partial<Item> = {}): Item => ({
  k: 'm' + number,
  name: 'Filme ' + number,
  cat: 'acao',
  url: `http://stream.test/m${number}.mp4`,
  rate: 7,
  added: 0,
  ...extra,
});

/**
 * Série de teste, com dois episódios por temporada.
 * @param number Número da série.
 * @param extra Campos a trocar.
 * @returns Série.
 */
export const series = (number: number, extra: Partial<Item> = {}): Item => ({
  k: 's' + number,
  name: 'Série ' + number,
  cat: 'drama',
  rate: 8,
  added: 0,
  plot: 'Sinopse',
  logo: 'http://img.test/s.png',
  eps: [
    { id: 'e1', title: 'Episódio 1', season: 1, num: 1, url: 'http://stream.test/e1.mp4' },
    { id: 'e2', title: 'Episódio 2', season: 1, num: 2, url: 'http://stream.test/e2.mp4', dur: '40 min' },
    { id: 'e3', title: 'Episódio 3', season: 2, num: 1, url: 'http://stream.test/e3.mp4' },
  ],
  ...extra,
});

/**
 * Seção de teste.
 * @param items Itens.
 * @param categories Categorias (`id: nome`).
 * @returns Seção.
 */
export const sectionData = (items: Item[], categories: Record<string, string> = {}): SectionData => ({
  cats: Object.entries(categories).map(([id, name]) => ({ id, name })),
  items,
});

/**
 * Catálogo de teste com canais, filmes e séries.
 * @param extra Campos a trocar.
 * @returns Catálogo.
 */
export const catalog = (extra: Partial<Catalog> = {}): Catalog => ({
  live: sectionData([channel(1), channel(2), channel(3)], { abertos: 'Abertos' }),
  vod: sectionData([movie(1), movie(2)], { acao: 'Ação' }),
  series: sectionData([series(1)], { drama: 'Drama' }),
  ...extra,
});

/**
 * Descrição de mídia de teste.
 * @param extra Campos a trocar.
 * @returns Descrição.
 */
export const mediaDescriptor = (extra: Partial<MediaDescriptor> = {}): MediaDescriptor => ({
  kind: 'vod',
  ref: 'vod:m1',
  title: 'Filme 1',
  url: 'http://stream.test/m1.mp4',
  ...extra,
});

/**
 * Registro de histórico de teste.
 * @param extra Campos a trocar.
 * @returns Registro.
 */
export const historyEntry = (extra: Partial<HistoryEntry> = {}): HistoryEntry => {
  const desc = mediaDescriptor();
  return { ...desc, desc, pos: 300, dur: 1000, t: Date.now(), ...extra };
};

/**
 * Preferências vazias de teste.
 * @param extra Campos a trocar.
 * @returns Preferências.
 */
export const userData = (extra: Partial<UserData> = {}): UserData => ({
  fav: { live: [], vod: [], series: [] },
  locked: [],
  hidden: [],
  hist: [],
  recentLive: [],
  ...extra,
});

/**
 * Programa de teste.
 * @param start Início em ms.
 * @param end Fim em ms.
 * @param extra Campos a trocar.
 * @returns Programa.
 */
export const programme = (start: number, end: number, extra: Partial<Programme> = {}): Programme => ({
  s: start,
  e: end,
  title: 'Programa',
  desc: '',
  ...extra,
});

/**
 * Resposta de login do Xtream.
 * @param extra Campos a trocar em `user_info`.
 * @returns Resposta.
 */
export const xtreamLogin = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  user_info: { auth: 1, status: 'Active', exp_date: '1893456000', active_cons: 1, max_connections: 2, username: 'teste', ...extra },
});

/** Respostas da API Xtream por ação. */
export const XTREAM_RESPONSES: Record<string, unknown> = {
  '': xtreamLogin(),
  get_live_categories: [{ category_id: 10, category_name: 'Abertos' }],
  get_live_streams: [
    {
      stream_id: 1,
      name: 'Canal X',
      stream_icon: 'http://img.test/x.png',
      category_id: 10,
      num: 5,
      epg_channel_id: 'x',
      tv_archive: 1,
      tv_archive_duration: 3,
    },
    { stream_id: 2, name: 'Canal Y', stream_icon: null, category_id: 10, tv_archive: '1' },
    'inválido',
  ],
  get_vod_categories: [{ category_id: 20, category_name: 'Filmes' }],
  get_vod_streams: [
    { stream_id: 30, name: 'Filme X', stream_icon: '', category_id: 20, rating: '7.5', added: '1000', container_extension: 'mkv' },
    { stream_id: 31, name: 'Filme Y', category_id: 20 },
  ],
  get_series_categories: [{ category_id: 40, category_name: 'Séries' }],
  get_series: [
    { series_id: 50, name: 'Série X', cover: 'http://img.test/c.png', category_id: 40, rating: 8, last_modified: 2000, plot: 'Resumo' },
  ],
};

/** Lista Xtream de teste. */
export const XTREAM_PLAYLIST = {
  id: 'x1',
  name: 'Minha Xtream',
  type: 'xtream',
  server: 'http://iptv.test:8080/',
  user: 'usuário',
  pass: 'se nha',
};

/** Dados salvos de uma lista Xtream ativa. */
export const XTREAM_STORAGE = { pls: [XTREAM_PLAYLIST], active: XTREAM_PLAYLIST.id };

/** Lista M3U de teste. */
export const M3U_PLAYLIST = { id: 'l1', name: 'Minha M3U', type: 'm3u', url: 'http://lista.test/a.m3u' };

/**
 * Responde como um servidor Xtream.
 * @param overrides Respostas a trocar por ação; um `Error` faz o pedido falhar.
 * @returns Função para o `fetch` do teste.
 */
export const xtreamHandler =
  (overrides: Record<string, unknown> = {}) =>
  (url: string): Response => {
    const action = new URL(url).searchParams.get('action') ?? '';
    const body = action in overrides ? overrides[action] : XTREAM_RESPONSES[action];
    if (body instanceof Error) throw body;
    if (body instanceof Response) return body;
    return new Response(typeof body === 'string' ? body : JSON.stringify(body ?? null));
  };
