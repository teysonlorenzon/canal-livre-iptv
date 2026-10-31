import { expect, type Locator, type Page, type Route, test as base } from '@playwright/test';

/** Endereço do servidor falso de listas, guias e vídeos. */
export const MOCK_ORIGIN = 'http://mock.test';

/** Endereço do servidor Xtream falso. */
export const XTREAM_ORIGIN = 'http://xtream.test:8080';

/** Lista M3U usada nos testes. */
export const M3U_TEXT = [
  `#EXTM3U x-tvg-url="${MOCK_ORIGIN}/guia.xml"`,
  '#EXTINF:-1 tvg-id="um" tvg-logo="" group-title="Abertos",Canal Um',
  `${MOCK_ORIGIN}/live/um.m3u8`,
  '#EXTINF:-1 tvg-id="dois" group-title="Abertos" catchup-days="3",Canal Dois',
  `${MOCK_ORIGIN}/live/dois.m3u8`,
  '#EXTINF:-1 tvg-id="tres" group-title="Notícias",Canal Três',
  `${MOCK_ORIGIN}/live/tres.m3u8`,
  '#EXTINF:-1 group-title="Filmes Ação",Velozes e Furiosos',
  `${MOCK_ORIGIN}/filmes/velozes.mp4`,
  '#EXTINF:-1 group-title="Filmes Ação",Velozes e Furiosos 2',
  `${MOCK_ORIGIN}/filmes/velozes2.mp4`,
  '#EXTINF:-1 group-title="Filmes Terror",O Chamado',
  `${MOCK_ORIGIN}/filmes/chamado.mp4`,
  '#EXTINF:-1 group-title="Adultos XXX",Filme Proibido',
  `${MOCK_ORIGIN}/filmes/proibido.mp4`,
  '#EXTINF:-1 group-title="Séries Drama",Minha Série S01E01',
  `${MOCK_ORIGIN}/series/s1e1.mp4`,
  '#EXTINF:-1 group-title="Séries Drama",Minha Série S01E02',
  `${MOCK_ORIGIN}/series/s1e2.mp4`,
  '#EXTINF:-1 group-title="Séries Drama",Minha Série S02E01',
  `${MOCK_ORIGIN}/series/s2e1.mp4`,
].join('\n');

/** Lista M3U cadastrada nos testes. */
export const M3U_PLAYLIST = { id: 'e2e', name: 'Lista de Teste', type: 'm3u', url: `${MOCK_ORIGIN}/lista.m3u` };

/** Lista Xtream cadastrada nos testes. */
export const XTREAM_PLAYLIST = { id: 'xt', name: 'Xtream de Teste', type: 'xtream', server: XTREAM_ORIGIN, user: 'eu', pass: 'senha' };

/**
 * Áudio WAV de silêncio, que qualquer navegador toca pelo `<video>` sem depender de codec.
 * @param seconds Duração.
 * @returns Arquivo.
 */
function silentWav(seconds: number): Buffer {
  const sampleRate = 8000,
    dataSize = sampleRate * seconds;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate, 28);
  header.writeUInt16LE(1, 32);
  header.writeUInt16LE(8, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, Buffer.alloc(dataSize, 128)]);
}

const VIDEO_FILE = silentWav(120);
const SHORT_VIDEO_FILE = silentWav(2);

/**
 * Data no formato do XMLTV.
 * @param timestamp Instante em ms.
 * @returns Data formatada.
 */
function xmltvDate(timestamp: number): string {
  return new Date(timestamp).toISOString().replace(/[-:T]/g, '').slice(0, 14) + ' +0000';
}

/**
 * Guia XMLTV relativo ao momento atual.
 * @returns Conteúdo do guia.
 */
function xmltvGuide(): string {
  const now = Date.now(),
    hour = 3600000;
  const programme = (channelId: string, start: number, end: number, title: string): string =>
    `<programme start="${xmltvDate(start)}" stop="${xmltvDate(end)}" channel="${channelId}"><title>${title}</title><desc>Sobre ${title}</desc></programme>`;
  return `<tv>
    ${programme('dois', now - 2 * hour, now - hour, 'Programa Passado')}
    ${programme('dois', now - hour, now + hour, 'Programa Atual')}
    ${programme('dois', now + hour, now + 2 * hour, 'Programa Futuro')}
    ${programme('um', now - hour, now + hour, 'Jornal da Hora')}
  </tv>`;
}

/** Respostas da API do Xtream por ação. */
const XTREAM_API: Record<string, unknown> = {
  '': { user_info: { auth: 1, status: 'Active', exp_date: '1893456000', active_cons: 0, max_connections: 2, username: 'eu' } },
  get_live_categories: [{ category_id: 1, category_name: 'Esportes' }],
  get_live_streams: [
    { stream_id: 11, name: 'Xtream Esporte', stream_icon: '', category_id: 1, num: 7, epg_channel_id: 'esporte' },
    { stream_id: 12, name: 'Xtream Notícias', stream_icon: '', category_id: 1, num: 8 },
  ],
  get_vod_categories: [{ category_id: 2, category_name: 'Lançamentos' }],
  get_vod_streams: [
    { stream_id: 21, name: 'Filme Xtream', stream_icon: '', category_id: 2, rating: '8.5', added: '1000', container_extension: 'mp4' },
  ],
  get_series_categories: [{ category_id: 3, category_name: 'Séries Xtream' }],
  get_series: [{ series_id: 31, name: 'Série Xtream', cover: '', category_id: 3, rating: 9, last_modified: 1000, plot: 'Resumo da série' }],
  get_vod_info: {
    info: {
      name: 'Filme Xtream',
      plot: 'Sinopse completa',
      releasedate: '2024-01-01',
      duration: '01:30:00',
      genre: 'Ação',
      cast: 'Elenco Xtream',
    },
  },
  get_series_info: {
    info: { plot: 'Resumo da série', genre: 'Drama' },
    episodes: { 1: [{ id: 41, title: 'Piloto', episode_num: 1, container_extension: 'mp4', info: { duration: '45 min' } }] },
  },
  get_short_epg: { epg_listings: [] },
};

const CORS_HEADERS = { 'access-control-allow-origin': '*' };

/**
 * Responde a um pedido com texto.
 * @param route Pedido.
 * @param body Conteúdo.
 * @returns Promessa do envio.
 */
const fulfillText = (route: Route, body: string): Promise<void> => route.fulfill({ status: 200, headers: CORS_HEADERS, body });

/**
 * Responde como um servidor de vídeo: com suporte a `Range`, sem o qual o navegador não pula no vídeo.
 * @param route Pedido.
 * @param file Arquivo.
 * @returns Promessa do envio.
 */
function fulfillVideo(route: Route, file: Buffer): Promise<void> {
  const rangeMatch = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range ?? '');
  const headers = { 'accept-ranges': 'bytes', 'content-type': 'audio/wav' };
  if (!rangeMatch) return route.fulfill({ status: 200, headers, body: file });
  const start = Number(rangeMatch[1]),
    end = rangeMatch[2] ? Number(rangeMatch[2]) : file.length - 1;
  return route.fulfill({
    status: 206,
    headers: { ...headers, 'content-range': `bytes ${start}-${end}/${file.length}` },
    body: file.subarray(start, end + 1),
  });
}

/** Estado do `<video>` do player. */
interface VideoSnapshot {
  paused: boolean;
  currentTime: number;
  duration: number;
  muted: boolean;
  objectFit: string;
}

/** Como abrir o app no teste. */
export interface OpenOptions {
  /** Dados salvos antes de abrir (sem o prefixo `cl_`). */
  storage?: Record<string, unknown>;
  /** Não esperar a abertura acabar. */
  keepIntro?: boolean;
}

/** Ações comuns dos testes. */
export interface AppDriver {
  page: Page;
  /** Erros de JavaScript que aconteceram na página. */
  pageErrors: string[];
  /** Abre o app. */
  open(options?: OpenOptions): Promise<void>;
  /** Abre o app com a lista M3U de teste já ativa. */
  openWithList(storage?: Record<string, unknown>): Promise<void>;
  /** Lê um valor do `localStorage` do app. */
  stored(key: string): Promise<unknown>;
  /** Abre uma seção pelos blocos da tela inicial. */
  openSection(name: 'live' | 'vod' | 'series'): Promise<void>;
  /** Digita o PIN e confirma. */
  enterPin(pin: string): Promise<void>;
  /** Estado do `<video>` do player. */
  videoState(): Promise<VideoSnapshot>;
  /** Espera o vídeo começar a tocar. */
  waitForPlayback(): Promise<void>;
  /** Aviso (toast) na tela. */
  toast: Locator;
}

export const test = base.extend<{ app: AppDriver }>({
  app: async ({ page, baseURL }, use) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
    await page.route(`${MOCK_ORIGIN}/**`, async route => {
      const { pathname } = new URL(route.request().url());
      if (pathname === '/lista.m3u') return fulfillText(route, M3U_TEXT);
      if (pathname === '/guia.xml') return fulfillText(route, xmltvGuide());
      if (pathname === '/erro.m3u') return route.fulfill({ status: 500, headers: CORS_HEADERS, body: '' });
      if (pathname === '/lenta.m3u') return undefined;
      if (pathname.endsWith('.m3u8')) return route.fulfill({ status: 404, headers: CORS_HEADERS, body: '' });
      return fulfillVideo(route, pathname.includes('curto') ? SHORT_VIDEO_FILE : VIDEO_FILE);
    });
    await page.route(`${XTREAM_ORIGIN}/**`, route => {
      const url = new URL(route.request().url());
      if (url.pathname !== '/player_api.php') return fulfillVideo(route, VIDEO_FILE);
      if (url.searchParams.get('password') !== 'senha')
        return route.fulfill({ status: 200, headers: CORS_HEADERS, json: { user_info: { auth: 0 } } });
      return route.fulfill({ status: 200, headers: CORS_HEADERS, json: XTREAM_API[url.searchParams.get('action') ?? ''] ?? [] });
    });

    /**
     * Abre o app, salvando os dados uma vez só: recarregar a página mantém o que o app mudou.
     * @param options Como abrir.
     */
    const open = async ({ storage = {}, keepIntro = false }: OpenOptions = {}): Promise<void> => {
      await page.addInitScript((values: Record<string, unknown>) => {
        if (sessionStorage.getItem('e2e-seeded')) return;
        sessionStorage.setItem('e2e-seeded', '1');
        for (const [key, value] of Object.entries(values)) localStorage.setItem('cl_' + key, JSON.stringify(value));
      }, storage);
      await page.goto(baseURL ?? '/');
      if (!keepIntro) await page.locator('#intro').waitFor({ state: 'detached' });
    };

    const driver: AppDriver = {
      page,
      pageErrors,
      open,
      openWithList: (storage = {}) => open({ storage: { pls: [M3U_PLAYLIST], active: M3U_PLAYLIST.id, ...storage } }),
      stored: key => page.evaluate(storageKey => JSON.parse(localStorage.getItem('cl_' + storageKey) ?? 'null') as unknown, key),
      openSection: async name => {
        await page.locator(`[data-sec="${name}"]`).click();
        await expect(page.locator('#section')).toBeVisible();
      },
      enterPin: async pin => {
        await page.locator('#pinIn').fill(pin);
        await page.locator('#pinOk').click();
      },
      videoState: () =>
        page.locator('#v').evaluate((video: HTMLVideoElement) => ({
          paused: video.paused,
          currentTime: video.currentTime,
          duration: video.duration,
          muted: video.muted,
          objectFit: video.style.objectFit,
        })),
      waitForPlayback: async () => {
        await expect.poll(async () => (await driver.videoState()).currentTime, { timeout: 15000 }).toBeGreaterThan(0);
      },
      toast: page.locator('#toast'),
    };
    await use(driver);
  },
});

export { expect };
