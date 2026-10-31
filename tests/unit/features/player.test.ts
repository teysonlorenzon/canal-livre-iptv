import {
  advance,
  type AppModules,
  bootApp,
  element,
  fire,
  flush,
  inputField,
  openCatalog,
  pressKey,
  readStorage,
  selectField,
  setPageUrl,
} from '../support/boot';
import {
  catalog,
  channel,
  historyEntry,
  mediaDescriptor,
  movie,
  programme,
  sectionData,
  series,
  userData,
  XTREAM_STORAGE,
  xtreamHandler,
} from '../support/fixtures';
import { controlVideo, FakeHls, fakeMpegts, FakeMpegtsPlayer, HLS_EVENTS, type VideoState } from '../support/media';

const PAGE_URL = 'http://127.0.0.1:8765/';

/** App com o vídeo do player sob controle do teste. */
interface PlayerApp {
  app: AppModules;
  video: VideoState;
}

/**
 * Inicia o app com um catálogo e o vídeo controlado.
 * @param catalogData Catálogo.
 * @param preferences Preferências.
 * @returns App e vídeo.
 */
async function bootPlayer(catalogData = catalog(), preferences = userData()): Promise<PlayerApp> {
  const app = await bootApp();
  openCatalog(app, catalogData, preferences);
  return { app, video: controlVideo(app.playback.video()) };
}

/**
 * Inicia o app com uma lista Xtream e o vídeo controlado.
 * @param overrides Respostas da API a trocar.
 * @returns App e vídeo.
 */
async function bootXtreamPlayer(overrides: Record<string, unknown> = {}): Promise<PlayerApp> {
  const app = await bootApp({ storage: XTREAM_STORAGE, fetch: xtreamHandler(overrides) });
  return { app, video: controlVideo(app.playback.video()) };
}

/**
 * Motores tentados na reprodução atual.
 * @returns Motor da etapa atual.
 */
const message = (): string => element('#plMsg').textContent;

describe('player', () => {
  afterEach(() => setPageUrl(PAGE_URL));

  describe('escolha do motor', () => {
    it.each([
      ['http://x/a.m3u8', 'hls'],
      ['http://x/a.m3u8?token=1', 'hls'],
      ['http://x/sem-extensao', 'hls'],
    ])('canal %s usa %s primeiro', async (url, engine) => {
      const { app } = await bootPlayer();
      app.player.playLive(channel(1, { url }));
      expect(app.playback.playback.engine?.eng).toBe(engine);
      expect(FakeHls.latest().loadedUrl).toBe(url);
    });

    it('canal .ts de lista M3U usa o mpegts.js', async () => {
      const { app } = await bootPlayer();
      app.player.playLive(channel(1, { url: 'http://x/a.ts' }));
      expect(app.playback.playback.engine?.eng).toBe('ts');
      expect(FakeMpegtsPlayer.instances[0]?.source).toMatchObject({ type: 'mpegts', isLive: true, url: 'http://x/a.ts' });
    });

    it('canal .ts no Xtream tenta HLS antes', async () => {
      const { app } = await bootXtreamPlayer();
      app.state.state.options.fmt = 'ts';
      app.player.playLive(app.state.state.catalog?.live.items[0]);
      expect(FakeHls.latest().loadedUrl).toBe('http://iptv.test:8080/live/usu%C3%A1rio/se%20nha/1.m3u8');
      FakeHls.latest().emit(HLS_EVENTS.ERROR, { fatal: true, type: 'outro', details: 'falha' });
      expect(app.playback.playback.engine?.eng).toBe('ts');
    });

    it('canal Xtream usa o formato configurado', async () => {
      const { app } = await bootXtreamPlayer();
      app.player.playLive(app.state.state.catalog?.live.items[0]);
      expect(app.playback.playback.currentMedia?.url).toContain('/1.m3u8');
    });

    it('filme usa o vídeo nativo', async () => {
      const { app } = await bootPlayer();
      app.player.playMedia(mediaDescriptor());
      expect(app.playback.playback.engine?.eng).toBe('native');
      expect(app.playback.video().getAttribute('src')).toBe('http://stream.test/m1.mp4');
    });

    it('filme do Xtream tenta HLS se o nativo falhar', async () => {
      const { app, video } = await bootXtreamPlayer();
      app.player.playMedia(mediaDescriptor({ url: 'http://x/f.mp4?a=1' }));
      video.error = { code: 4, message: '' };
      fire(app.playback.video(), 'error');
      expect(FakeHls.latest().loadedUrl).toBe('http://x/f.m3u8?a=1');
    });

    it('filme sem extensão conhecida tenta nativo e HLS', async () => {
      const { app, video } = await bootPlayer();
      app.player.playMedia(mediaDescriptor({ url: 'http://x/filme' }));
      expect(app.playback.playback.engine?.eng).toBe('native');
      video.error = { code: 4, message: 'detalhe' };
      fire(app.playback.video(), 'error');
      expect(app.playback.playback.engine?.eng).toBe('hls');
    });

    it('.ts sob demanda tenta mpegts e nativo', async () => {
      const { app } = await bootPlayer();
      app.player.playMedia(mediaDescriptor({ url: 'http://x/f.ts' }));
      expect(app.playback.playback.engine?.eng).toBe('ts');
      FakeMpegtsPlayer.instances[0]?.errorHandler?.('NetworkError', '');
      expect(app.playback.playback.engine?.eng).toBe('native');
    });
  });

  describe('hls.js', () => {
    it('usa a configuração de ao vivo e de sob demanda', async () => {
      const { app } = await bootPlayer();
      app.player.playLive(channel(1));
      expect(FakeHls.latest().config).toMatchObject({ liveSyncDurationCount: 3 });
      app.player.playMedia(mediaDescriptor({ url: 'http://x/a.m3u8' }));
      expect(FakeHls.latest().config).toMatchObject({ maxBufferLength: 60 });
      expect(FakeHls.latest().attachMedia).toHaveBeenCalledWith(app.playback.video());
    });

    it('começa a tocar quando o manifesto chega', async () => {
      const { app } = await bootPlayer();
      const video = app.playback.video();
      app.player.playLive(channel(1));
      jest.mocked(video.play).mockClear();
      FakeHls.latest().emit(HLS_EVENTS.MANIFEST_PARSED);
      expect(video.play).toHaveBeenCalled();
    });

    it('pede um toque quando o navegador bloqueia o autoplay', async () => {
      const { app } = await bootPlayer();
      app.player.playLive(channel(1));
      const blocked = new Error('bloqueado');
      blocked.name = 'NotAllowedError';
      jest.mocked(app.playback.video().play).mockRejectedValueOnce(blocked);
      FakeHls.latest().emit(HLS_EVENTS.MANIFEST_PARSED);
      await flush();
      expect(message()).toContain('Toque para assistir');
    });

    it('outros erros do play são ignorados', async () => {
      const { app } = await bootPlayer();
      app.player.playLive(channel(1));
      jest.mocked(app.playback.video().play).mockRejectedValueOnce(new Error('outro'));
      FakeHls.latest().emit(HLS_EVENTS.MANIFEST_PARSED);
      await flush();
      expect(message()).not.toContain('Toque para assistir');
    });

    it('tenta recuperar erros de mídia duas vezes e erros de rede uma', async () => {
      const { app } = await bootPlayer();
      app.player.playLive(channel(1));
      const hls = FakeHls.latest();
      hls.emit(HLS_EVENTS.ERROR, { fatal: false });
      expect(hls.recoverMediaError).not.toHaveBeenCalled();
      hls.emit(HLS_EVENTS.ERROR, { fatal: true, type: 'networkError', details: 'fragLoadError' });
      expect(hls.startLoad).toHaveBeenCalledTimes(1);
      hls.emit(HLS_EVENTS.ERROR, { fatal: true, type: 'mediaError', details: 'x' });
      expect(hls.recoverMediaError).toHaveBeenCalledTimes(1);
      hls.emit(HLS_EVENTS.ERROR, { fatal: true, type: 'mediaError', details: 'x' });
      expect(hls.recoverMediaError).toHaveBeenCalledTimes(1);
      expect(app.playback.playback.engine?.eng).toBe('native');
    });

    it('manifesto que não baixa passa para o próximo motor na hora', async () => {
      const { app } = await bootPlayer();
      app.player.playLive(channel(1));
      FakeHls.latest().emit(HLS_EVENTS.ERROR, { fatal: true, type: 'networkError', details: 'manifestLoadError' });
      expect(FakeHls.latest().startLoad).not.toHaveBeenCalled();
      expect(app.playback.playback.engine?.eng).toBe('native');
    });

    it('sem suporte usa o HLS nativo, se houver', async () => {
      const { app, video } = await bootPlayer();
      FakeHls.supported = false;
      video.canPlay = 'yes';
      app.player.playLive(channel(1));
      expect(app.playback.playback.engine?.eng).toBe('hls');
      expect(app.playback.video().getAttribute('src')).toBe('http://stream.test/1.m3u8');
    });

    it('sem suporte nenhum passa para o próximo motor', async () => {
      const { app } = await bootPlayer();
      FakeHls.supported = false;
      app.player.playLive(channel(1));
      expect(app.playback.playback.engine?.eng).toBe('native');
    });

    it('sem a biblioteca também passa adiante', async () => {
      const { app } = await bootPlayer();
      Object.assign(window, { Hls: undefined, mpegts: undefined });
      app.player.playLive(channel(1));
      expect(app.playback.playback.engine?.eng).toBe('native');
    });
  });

  describe('mpegts.js', () => {
    it('sem suporte passa para o próximo motor', async () => {
      const { app } = await bootPlayer();
      fakeMpegts.supported = false;
      app.player.playLive(channel(1, { url: 'http://x/a.ts' }));
      expect(app.playback.playback.engine?.eng).toBe('native');
    });

    it('usa a configuração de ao vivo e sob demanda', async () => {
      const { app } = await bootPlayer();
      app.player.playLive(channel(1, { url: 'http://x/a.ts' }));
      expect(FakeMpegtsPlayer.instances[0]?.config).toMatchObject({ liveBufferLatencyChasing: true });
      app.player.playMedia(mediaDescriptor({ url: 'http://x/f.ts' }));
      expect(FakeMpegtsPlayer.instances[1]?.config).toMatchObject({ lazyLoad: true });
    });

    it('pede um toque se o play for bloqueado e aceita play sem promessa', async () => {
      const { app } = await bootPlayer();
      const blocked = new Error('bloqueado');
      blocked.name = 'NotAllowedError';
      FakeMpegtsPlayer.playResult = Promise.reject(blocked);
      app.player.playLive(channel(1, { url: 'http://x/a.ts' }));
      await flush();
      expect(message()).toContain('Toque para assistir');
      FakeMpegtsPlayer.playResult = undefined;
      app.player.playLive(channel(2, { url: 'http://x/b.ts' }));
      expect(app.playback.playback.engine?.eng).toBe('ts');
    });

    it('descarta o player ao trocar, mesmo se ele falhar', async () => {
      const { app } = await bootPlayer();
      app.player.playLive(channel(1, { url: 'http://x/a.ts' }));
      const first = FakeMpegtsPlayer.instances[0];
      app.player.playLive(channel(2, { url: 'http://x/b.ts' }));
      expect(first?.destroy).toHaveBeenCalled();
      FakeMpegtsPlayer.throwOnPause = true;
      expect(() => app.player.playLive(channel(3))).not.toThrow();
      expect(FakeMpegtsPlayer.instances[1]?.destroy).not.toHaveBeenCalled();
    });

    it('um erro sem detalhe usa o tipo', async () => {
      const { app } = await bootPlayer();
      app.player.playLive(channel(1, { url: 'http://x/a.ts' }));
      FakeMpegtsPlayer.instances[0]?.errorHandler?.('Tipo', 'Detalhe');
      expect(app.playback.playback.engine?.eng).toBe('native');
    });
  });

  describe('limite para começar', () => {
    it('passa para o próximo motor depois de 20 s', async () => {
      const { app } = await bootPlayer();
      app.player.playLive(channel(1));
      await advance(20000);
      expect(app.playback.playback.engine?.eng).toBe('native');
    });

    it('não faz nada se o vídeo já estiver pronto', async () => {
      const { app, video } = await bootPlayer();
      app.player.playLive(channel(1));
      video.readyState = 3;
      await advance(20000);
      expect(app.playback.playback.engine?.eng).toBe('hls');
    });

    it('com o vídeo chegando devagar espera mais e avisa', async () => {
      const { app } = await bootPlayer();
      app.player.playLive(channel(1));
      FakeHls.latest().emit(HLS_EVENTS.FRAG_LOADING, { frag: { stats: { loaded: 100 } } });
      await advance(20000);
      expect(message()).toContain('O servidor está enviando este canal devagar');
      expect(app.playback.playback.engine?.eng).toBe('hls');
      await advance(10000);
      expect(app.playback.playback.engine?.eng).toBe('native');
    });

    it('espera no máximo 40 s a mais', async () => {
      const { app } = await bootPlayer();
      app.player.playLive(channel(1));
      const stats = { loaded: 1 };
      FakeHls.latest().emit(HLS_EVENTS.FRAG_LOADING, { frag: { stats } });
      await advance(19999);
      for (let step = 0; step < 4; step++) {
        stats.loaded += 1;
        await advance(10000);
      }
      expect(app.playback.playback.engine?.eng).toBe('hls');
      stats.loaded += 1;
      await advance(10000);
      expect(app.playback.playback.engine?.eng).toBe('native');
    });

    it('oferece a versão mais leve do canal', async () => {
      const { app } = await bootPlayer();
      const channels = [
        channel(1, { name: 'GLOBO FHD' }),
        channel(2, { name: 'GLOBO [ALT] HD' }),
        channel(3, { name: 'GLOBO HD' }),
        channel(4, { name: 'OUTRO SD' }),
      ];
      app.player.playLive(channels[0], channels);
      FakeHls.latest().emit(HLS_EVENTS.FRAG_LOADING, { frag: { stats: { loaded: 100 } } });
      await advance(20000);
      expect(element('#fLighter').textContent).toBe('Assistir GLOBO HD');
      element('#fLighter').click();
      expect(app.playback.playback.currentMedia?.item?.k).toBe('c3');
    });

    it('na TV foca a versão mais leve', async () => {
      const { app } = await bootPlayer();
      document.documentElement.classList.add('tv');
      const channels = [channel(1, { name: 'GLOBO HD' }), channel(2, { name: 'GLOBO SD' })];
      app.player.playLive(channels[0], channels);
      FakeHls.latest().emit(HLS_EVENTS.FRAG_LOADING, { frag: { stats: { loaded: 100 } } });
      await advance(20000);
      expect(document.activeElement).toBe(element('#fLighter'));
    });

    it('canal sem qualidade no nome ou sem alternativa não oferece nada', async () => {
      const { app } = await bootPlayer();
      app.player.playLive(channel(1, { name: 'SEM QUALIDADE' }), [channel(2, { name: 'SEM QUALIDADE SD' })]);
      FakeHls.latest().emit(HLS_EVENTS.FRAG_LOADING, { frag: { stats: { loaded: 100 } } });
      await advance(20000);
      expect(document.getElementById('fLighter')).toBeNull();
      app.player.playLive(channel(2, { name: 'CANAL SD' }), [channel(3, { name: 'CANAL HD' })]);
      FakeHls.latest().emit(HLS_EVENTS.FRAG_LOADING, { frag: { stats: { loaded: 100 } } });
      await advance(20000);
      expect(document.getElementById('fLighter')).toBeNull();
    });

    it('filme lento não oferece canal mais leve', async () => {
      const { app } = await bootPlayer();
      app.player.playMedia(mediaDescriptor({ url: 'http://x/f.m3u8' }));
      FakeHls.latest().emit(HLS_EVENTS.FRAG_LOADING, { frag: { stats: { loaded: 100 } } });
      await advance(20000);
      expect(document.getElementById('fLighter')).toBeNull();
    });

    it('reprodução antiga não interfere na nova', async () => {
      const { app } = await bootPlayer();
      app.player.playLive(channel(1));
      const oldHandlers = FakeHls.latest();
      app.player.playLive(channel(2));
      oldHandlers.emit(HLS_EVENTS.ERROR, { fatal: true, type: 'outro', details: 'x' });
      expect(app.playback.playback.engine?.eng).toBe('hls');
    });
  });

  describe('falha de reprodução', () => {
    /**
     * Faz todas as etapas de um filme falharem.
     * @param player App e vídeo.
     * @param url URL do filme.
     * @param code Código do erro do vídeo.
     * @param errorMessage Mensagem do erro.
     */
    function failMovie({ app, video }: PlayerApp, url: string, code: number, errorMessage = ''): void {
      app.player.playMedia(mediaDescriptor({ url }));
      video.error = { code, message: errorMessage };
      fire(app.playback.video(), 'error');
    }

    it('mostra o motivo técnico e as opções', async () => {
      const player = await bootPlayer();
      player.video.canPlay = 'yes';
      failMovie(player, 'http://x/f.mp4', 3, 'detalhe');
      expect(message()).toContain('Não foi possível tocar');
      expect(message()).toContain('NATIVE: falha ao decodificar (detalhe)');
      expect(element('#plMsg a').getAttribute('href')).toBe('http://x/f.mp4');
      expect(element('#fWhy').textContent).toContain('HEVC');
    });

    it.each([
      [1, 'NATIVE: interrompido'],
      [2, 'NATIVE: erro de rede'],
      [9, 'NATIVE: erro 9'],
    ])('descreve o erro %s', async (code, description) => {
      const player = await bootPlayer();
      failMovie(player, 'http://x/f.mp4', code);
      expect(message()).toContain(description);
    });

    it('erro sem detalhes', async () => {
      const { app } = await bootPlayer();
      app.player.playMedia(mediaDescriptor({ url: 'http://x/f.mp4' }));
      fire(app.playback.video(), 'error');
      expect(message()).toContain('NATIVE: erro desconhecido');
    });

    it('explica a queda de conexão', async () => {
      const player = await bootPlayer();
      player.video.canPlay = 'yes';
      failMovie(player, 'http://x/f.mp4', 2);
      expect(element('#fWhy').textContent).toContain('A conexão com o servidor caiu');
    });

    it('explica o bloqueio de http em página https', async () => {
      setPageUrl('https://zapp.test/');
      const player = await bootPlayer();
      failMovie(player, 'http://x/f.mp4', 4);
      expect(element('#fWhy').textContent).toContain('a página está em https');
    });

    it('explica MP4 sem suporte', async () => {
      const { app } = await bootPlayer();
      app.player.playMedia(mediaDescriptor({ url: 'http://x/f.mp4' }));
      fire(app.playback.video(), 'error');
      expect(element('#fWhy').textContent).toContain('Este navegador não toca vídeos MP4');
    });

    it('explica o motivo genérico', async () => {
      const { app, video } = await bootPlayer();
      video.canPlay = 'yes';
      app.player.playMedia(mediaDescriptor({ url: 'http://x/f.mp4' }));
      fire(app.playback.video(), 'error');
      expect(element('#fWhy').textContent).toContain('O conteúdo pode estar fora do ar');
    });

    it('explica .mkv e formato não suportado depois de testar o servidor', async () => {
      const player = await bootPlayer();
      jest.mocked(window.fetch).mockResolvedValue(new Response(''));
      player.video.canPlay = 'yes';
      failMovie(player, 'http://x/f.mkv', 4);
      expect(element('#fWhy').textContent).toBe('Verificando a conexão com o servidor do vídeo…');
      await flush();
      expect(element('#fWhy').textContent).toContain('O servidor respondeu');
      expect(window.fetch).toHaveBeenLastCalledWith('http://x/f.mkv', expect.objectContaining({ mode: 'no-cors', cache: 'no-store' }));
    });

    it('avisa quando o servidor não responde ao teste', async () => {
      const player = await bootPlayer();
      jest.mocked(window.fetch).mockRejectedValue(new TypeError('falhou'));
      failMovie(player, 'http://x/f.webm', 4);
      await flush();
      expect(element('#fWhy').textContent).toContain('Não foi possível conectar ao servidor');
    });

    it('o teste do servidor desiste em 8 s', async () => {
      const player = await bootPlayer();
      jest.mocked(window.fetch).mockImplementation(
        (_url, init) =>
          new Promise((_, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('abortado')));
          }),
      );
      failMovie(player, 'http://x/f.webm', 4);
      await advance(8000);
      expect(element('#fWhy').textContent).toContain('Não foi possível conectar ao servidor');
    });

    it('ignora o teste do servidor de uma reprodução antiga', async () => {
      const player = await bootPlayer();
      let finishProbe: (response: Response) => void = () => undefined;
      jest.mocked(window.fetch).mockImplementation(() => new Promise(resolve => (finishProbe = resolve)));
      failMovie(player, 'http://x/f.webm', 4);
      player.app.player.playLive(channel(1));
      finishProbe(new Response(''));
      await flush();
      expect(document.getElementById('fWhy')).toBeNull();
    });

    it('explica .mkv quando não há teste a fazer', async () => {
      const player = await bootPlayer();
      setPageUrl('https://zapp.test/');
      player.video.canPlay = 'yes';
      failMovie(player, 'https://x/f.mkv', 4);
      expect(element('#fWhy').textContent).toContain('Verificando');
      await flush();
    });

    it('formato não suportado em https sobre http não testa o servidor', async () => {
      const player = await bootPlayer();
      setPageUrl('https://zapp.test/');
      player.video.canPlay = 'yes';
      failMovie(player, 'http://x/f.mkv', 4);
      expect(element('#fWhy').textContent).toContain('a página está em https');
    });

    it('Tentar de novo refaz a cadeia', async () => {
      const player = await bootPlayer();
      failMovie(player, 'http://x/f.mp4', 3);
      element('#fRetry').click();
      expect(player.app.playback.playback.engine?.eng).toBe('native');
      expect(document.getElementById('fRetry')).toBeNull();
    });

    it('copia o link', async () => {
      const player = await bootPlayer();
      const writeText = jest.fn(() => Promise.resolve());
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
      failMovie(player, 'http://x/f.mp4', 3);
      element('#fCopy').click();
      await flush();
      expect(writeText).toHaveBeenCalledWith('http://x/f.mp4');
      expect(element('#toast').textContent).toContain('Link copiado');
    });

    it('sem acesso à área de transferência mostra o link', async () => {
      const player = await bootPlayer();
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => Promise.reject(new Error('negado')) },
      });
      const prompt = jest.spyOn(window, 'prompt').mockReturnValue(null);
      failMovie(player, 'http://x/f.mp4', 3);
      element('#fCopy').click();
      await flush();
      expect(prompt).toHaveBeenCalledWith('Copie o link:', 'http://x/f.mp4');
    });

    it('sem mídia não oferece o link', async () => {
      const { app } = await bootPlayer();
      app.player.playMedia(mediaDescriptor({ url: 'http://x/f.mp4' }));
      app.playback.playback.currentMedia = null;
      fire(app.playback.video(), 'error');
      expect(document.getElementById('fCopy')).toBeNull();
    });

    it('sem última cadeia, Tentar de novo não faz nada', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData());
      controlVideo(app.playback.video());
      app.player.playMedia(mediaDescriptor({ url: 'http://x/f.mp4' }));
      fire(app.playback.video(), 'error');
      const retry = element('#fRetry');
      app.player.closePlayer();
      retry.click();
      expect(app.playback.playback.engine?.eng).toBe('native');
    });
  });

  describe('canais ao vivo', () => {
    it('sem canal não faz nada', async () => {
      const { app } = await bootPlayer();
      app.player.playLive(undefined);
      expect(element('#player').hidden).toBe(true);
    });

    it('mostra o canal, salva nos recentes e guarda a lista', async () => {
      const { app } = await bootPlayer(
        catalog({ live: sectionData([channel(1, { logo: 'http://img.test/1.png' }), channel(2)]) }),
        userData({ recentLive: ['c2', 'c1'] }),
      );
      app.player.playLive(app.state.state.catalog?.live.items[0]);
      expect(element('#plTitle').textContent).toBe('1  Canal 1');
      expect(element('#osdName').textContent).toBe('1  Canal 1');
      expect(element('#osdLogo img').getAttribute('src')).toBe('http://img.test/1.png');
      expect(app.state.state.userData.recentLive).toEqual(['c1', 'c2']);
      expect(readStorage('ux_l1')).toMatchObject({ recentLive: ['c1', 'c2'] });
      expect(app.playback.playback.liveChannelList).toHaveLength(2);
      expect(element('#seekRow').hidden).toBe(true);
      expect(element('#cBack10').hidden).toBe(true);
      expect(element('#cEpg').hidden).toBe(false);
    });

    it('canal sem logo usa as iniciais', async () => {
      const { app } = await bootPlayer();
      app.player.playLive(channel(1));
      expect(element('#osdLogo').textContent).toBe('C1');
    });

    it('mostra a estrela do favorito', async () => {
      const { app } = await bootPlayer(catalog(), userData({ fav: { live: ['c1'], vod: [], series: [] } }));
      app.player.playLive(channel(1));
      expect(document.querySelector('#cFav svg')?.classList.contains('on')).toBe(true);
      element('#cFav').click();
      expect(document.querySelector('#cFav svg')?.classList.contains('on')).toBe(false);
      app.player.closePlayer();
      element('#cFav').click();
      expect(app.state.state.userData.fav.live).toEqual([]);
    });

    it('guarda só os 30 canais mais recentes', async () => {
      const { app } = await bootPlayer(catalog(), userData({ recentLive: Array.from({ length: 35 }, (_, index) => 'x' + index) }));
      app.player.playLive(channel(1));
      expect(app.state.state.userData.recentLive).toHaveLength(30);
    });
  });

  describe('programação do canal', () => {
    const NOW = (): number => Date.now();

    it('mostra o programa atual, o tempo restante e o próximo', async () => {
      const { app } = await bootPlayer();
      const now = NOW();
      app.state.state.catalog = catalog({
        epg: new Map([
          [
            'epg1',
            [programme(now - 1800000, now + 7200000, { title: 'Atual' }), programme(now + 7200000, now + 9000000, { title: 'Próximo' })],
          ],
        ]),
      });
      app.player.playLive(channel(1));
      await flush();
      expect(element('#epgT').textContent).toBe('Atual');
      expect(element('#epgLeft').textContent).toBe('faltam 2h00');
      expect(element('#epgN').textContent).toContain('Próximo');
      expect(element('#epgP').style.width).toBe('20%');
      expect(element('#epgNow').classList.contains('none')).toBe(false);
      await advance(30000);
      expect(element('#epgP').style.width).not.toBe('20%');
    });

    it('menos de uma hora mostra em minutos', async () => {
      const { app } = await bootPlayer();
      const now = NOW();
      app.state.state.catalog = catalog({ epg: new Map([['epg1', [programme(now - 1000, now + 600000, { title: 'Atual' })]]]) });
      app.player.playLive(channel(1));
      await flush();
      expect(element('#epgLeft').textContent).toBe('faltam 10 min');
      expect(element('#epgN').textContent).toBe('');
    });

    it('sem guia avisa', async () => {
      const { app } = await bootPlayer();
      app.player.playLive(channel(1));
      await flush();
      expect(element('#epgT').textContent).toBe('Programação não disponível para este canal');
      expect(element('#epgNow').classList.contains('none')).toBe(true);
      expect(element('#epgTime').textContent).toBe('');
    });

    it('ignora o guia de um canal que já saiu', async () => {
      const { app } = await bootPlayer();
      app.player.playLive(channel(1));
      app.player.closePlayer();
      await flush();
      expect(element('#epgT').textContent).toBe('Carregando programação…');
      app.player.playLive(channel(2));
      app.player.playLive(channel(3));
      await flush();
      expect(element('#epgNow').hidden).toBe(false);
    });
  });

  describe('filmes e episódios', () => {
    it('mostra o título e os controles certos', async () => {
      const { app } = await bootPlayer();
      app.player.playMedia(mediaDescriptor());
      expect(element('#plTitle').textContent).toBe('Filme 1');
      expect(element('#epgNow').hidden).toBe(true);
      expect(element('#seekRow').hidden).toBe(false);
      expect(element('#cBack10').hidden).toBe(false);
      expect(element('#cList').hidden).toBe(true);
      expect(element('#cEpg').hidden).toBe(true);
      expect(element('#cFav').hidden).toBe(true);
    });

    it('série mostra a lista de episódios', async () => {
      const { app } = await bootPlayer();
      app.details.playEpisode(series(1), {}, series(1).eps ?? [], 0);
      expect(element('#cList').hidden).toBe(false);
      expect(element('#cList').textContent).toBe('Episódios');
    });

    it('retoma da posição salva quando o vídeo fica pronto', async () => {
      const { app, video } = await bootPlayer();
      app.player.playMedia(mediaDescriptor(), 300);
      video.duration = 1000;
      fire(app.playback.video(), 'canplay');
      expect(video.currentTime).toBe(300);
      video.currentTime = 500;
      fire(app.playback.video(), 'canplay');
      expect(video.currentTime).toBe(500);
    });

    it('não retoma perto do fim', async () => {
      const { app, video } = await bootPlayer();
      app.player.playMedia(mediaDescriptor(), 980);
      video.duration = 1000;
      fire(app.playback.video(), 'canplay');
      expect(video.currentTime).toBe(0);
    });

    it('ao vivo não retoma', async () => {
      const { app, video } = await bootPlayer();
      app.player.playLive(channel(1));
      video.duration = 1000;
      fire(app.playback.video(), 'canplay');
      expect(video.currentTime).toBe(0);
    });

    it('atualiza a barra de progresso e os tempos', async () => {
      const { app, video } = await bootPlayer();
      app.player.playMedia(mediaDescriptor());
      video.duration = 100;
      video.currentTime = 25;
      fire(app.playback.video(), 'timeupdate');
      expect(inputField('#seek').value).toBe('250');
      expect(element('#tCur').textContent).toBe('0:25');
      expect(element('#tDur').textContent).toBe('1:40');
    });

    it('ao vivo e duração desconhecida não atualizam a barra', async () => {
      const { app, video } = await bootPlayer();
      app.player.playMedia(mediaDescriptor());
      video.duration = Infinity;
      fire(app.playback.video(), 'timeupdate');
      video.duration = 0;
      fire(app.playback.video(), 'timeupdate');
      expect(inputField('#seek').value).toBe('0');
      app.player.playLive(channel(1));
      video.duration = 100;
      video.currentTime = 25;
      fire(app.playback.video(), 'timeupdate');
      expect(inputField('#seek').value).toBe('0');
      app.playback.playback.currentMedia = null;
      fire(app.playback.video(), 'timeupdate');
    });

    it('arrastar a barra mostra o tempo e pula ao soltar', async () => {
      const { app, video } = await bootPlayer();
      app.player.playMedia(mediaDescriptor());
      video.duration = 100;
      const seek = inputField('#seek');
      seek.value = '500';
      fire(seek, 'input');
      expect(element('#tCur').textContent).toBe('0:50');
      video.currentTime = 10;
      fire(app.playback.video(), 'timeupdate');
      expect(seek.value).toBe('500');
      fire(seek, 'change');
      expect(video.currentTime).toBe(50);
      video.duration = Infinity;
      video.currentTime = 1;
      fire(seek, 'change');
      expect(video.currentTime).toBe(1);
    });

    it('salva o progresso a cada 5 s', async () => {
      const { app, video } = await bootPlayer();
      app.player.playMedia(mediaDescriptor());
      video.duration = 1000;
      video.currentTime = 100;
      fire(app.playback.video(), 'timeupdate');
      await advance(6000);
      fire(app.playback.video(), 'timeupdate');
      expect(app.state.state.userData.hist[0]).toMatchObject({
        ref: 'vod:m1',
        pos: 100,
        dur: 1000,
        desc: expect.objectContaining({ ref: 'vod:m1' }),
      });
      await advance(1000);
      video.currentTime = 200;
      fire(app.playback.video(), 'timeupdate');
      expect(app.state.state.userData.hist[0]?.pos).toBe(100);
    });

    it('não salva vídeos curtos nem o começo', async () => {
      const { app, video } = await bootPlayer();
      app.player.playMedia(mediaDescriptor());
      video.duration = 30;
      video.currentTime = 20;
      app.player.closePlayer();
      expect(app.state.state.userData.hist).toEqual([]);
      app.player.playMedia(mediaDescriptor());
      video.duration = 1000;
      video.currentTime = 2;
      app.player.closePlayer();
      video.duration = NaN;
      app.player.playMedia(mediaDescriptor());
      app.player.closePlayer();
      expect(app.state.state.userData.hist).toEqual([]);
    });

    it('não salva catch-up nem canais', async () => {
      const { app, video } = await bootPlayer();
      video.duration = 1000;
      video.currentTime = 100;
      app.player.playLive(channel(1));
      app.player.closePlayer();
      app.player.playCatchup(channel(1), programme(1000, 2000));
      app.player.closePlayer();
      expect(app.state.state.userData.hist).toEqual([]);
    });

    it('não salva sem lista ativa', async () => {
      const { app, video } = await bootPlayer();
      app.player.playMedia(mediaDescriptor());
      video.duration = 1000;
      video.currentTime = 100;
      app.state.state.activePlaylist = null;
      app.player.closePlayer();
      expect(app.state.state.userData.hist).toEqual([]);
    });

    it('episódio guarda o último da série e o progresso de cada um', async () => {
      const { app, video } = await bootPlayer(catalog(), userData({ hist: [historyEntry({ ref: 'ep:e1', series: 'series:s1' })] }));
      app.details.playEpisode(series(1), {}, series(1).eps ?? [], 1);
      video.duration = 1000;
      video.currentTime = 100;
      app.player.closePlayer();
      app.details.playEpisode(series(1), {}, series(1).eps ?? [], 1);
      video.currentTime = 200;
      app.player.closePlayer();
      const { hist } = app.state.state.userData;
      expect(hist.filter(entry => !entry.hidden).map(entry => entry.ref)).toEqual(['ep:e2']);
      expect(hist.filter(entry => entry.hidden).map(entry => [entry.ref, entry.pos])).toEqual([['ep:e2', 200]]);
    });

    it('limita o histórico', async () => {
      const { app, video } = await bootPlayer(
        catalog(),
        userData({ hist: Array.from({ length: 70 }, (_, index) => historyEntry({ ref: 'vod:' + index })) }),
      );
      app.player.playMedia(mediaDescriptor());
      video.duration = 1000;
      video.currentTime = 100;
      app.player.closePlayer();
      expect(app.state.state.userData.hist).toHaveLength(60);
    });

    it('ao terminar toca o próximo episódio, se ativado', async () => {
      const { app } = await bootPlayer();
      app.details.playEpisode(series(1), {}, series(1).eps ?? [], 0);
      fire(app.playback.video(), 'ended');
      expect(element('#toast').textContent).toBe('Próximo episódio');
      expect(app.playback.playback.currentMedia?.ctx?.i).toBe(1);
    });

    it('não avança sem a opção, no último episódio ou sem mídia', async () => {
      const { app } = await bootPlayer();
      app.state.state.options.auto = '0';
      app.details.playEpisode(series(1), {}, series(1).eps ?? [], 0);
      fire(app.playback.video(), 'ended');
      expect(app.playback.playback.currentMedia?.ctx?.i).toBe(0);
      app.state.state.options.auto = '1';
      app.details.playEpisode(series(1), {}, series(1).eps ?? [], 2);
      fire(app.playback.video(), 'ended');
      expect(app.playback.playback.currentMedia?.ctx?.i).toBe(2);
      app.player.playMedia(mediaDescriptor());
      fire(app.playback.video(), 'ended');
      app.playback.playback.currentMedia = null;
      fire(app.playback.video(), 'ended');
      expect(element('#toast').textContent).toBe('');
    });
  });

  describe('catch-up', () => {
    it('monta a URL do timeshift pelo início do servidor', async () => {
      const { app } = await bootXtreamPlayer();
      app.player.playLive(app.state.state.catalog?.live.items[0]);
      app.player.playCatchup(channel(1, { k: '1' }), programme(0, 3600000, { title: 'Jornal', start: '2026-06-15 10:30:00' }));
      expect(app.playback.playback.currentMedia).toMatchObject({ kind: 'catchup', desc: { title: 'Canal 1 · Jornal' } });
      expect(app.playback.playback.currentMedia?.url).toBe(
        'http://iptv.test:8080/timeshift/usu%C3%A1rio/se%20nha/60/2026-06-15:10-30/1.ts',
      );
      expect(element('#plTitle').textContent).toContain('Canal 1 · Jornal');
      expect(FakeMpegtsPlayer.instances).toHaveLength(1);
    });

    it('sem início do servidor usa a data do programa', async () => {
      const { app } = await bootXtreamPlayer();
      app.player.playCatchup(channel(1, { k: '1' }), programme(Date.UTC(2026, 5, 15, 9, 5), Date.UTC(2026, 5, 15, 10, 5)));
      expect(app.playback.playback.currentMedia?.url).toContain('/2026-06-15:09-05/1.ts');
    });

    it('lista M3U usa a URL do canal e tenta HLS e nativo', async () => {
      const { app } = await bootPlayer();
      app.player.playCatchup(channel(1, { url: 'http://x/canal.ts' }), programme(1000, 2000));
      expect(app.playback.playback.currentMedia?.url).toBe('http://x/canal.ts');
      FakeMpegtsPlayer.instances[0]?.errorHandler?.('x', 'y');
      expect(FakeHls.latest().loadedUrl).toBe('http://x/canal.m3u8');
    });
  });

  describe('faixas', () => {
    it('preenche qualidade, áudio e legenda do hls.js', async () => {
      const { app } = await bootPlayer();
      app.player.playLive(channel(1));
      const hls = FakeHls.latest();
      hls.levels = [{ height: 720, bitrate: 1 }, { bitrate: 500000 }];
      hls.audioTracks = [{ name: 'Português' }, { lang: 'en' }, {}];
      hls.subtitleTracks = [{ name: 'PT' }, { lang: 'en' }, {}];
      hls.audioTrack = 1;
      hls.subtitleTrack = 0;
      hls.emit(HLS_EVENTS.MANIFEST_PARSED);
      expect(selectField('#cQual').textContent).toContain('720p');
      expect(selectField('#cQual').textContent).toContain('500 kbps');
      expect(selectField('#cQual').value).toBe('-1');
      expect(selectField('#cAudio').textContent).toContain('Áudio 3');
      expect(selectField('#cAudio').value).toBe('1');
      expect(selectField('#cSub').textContent).toContain('Legenda 3');
      expect(selectField('#cSub').value).toBe('0');
      hls.autoLevelEnabled = false;
      hls.currentLevel = 1;
      hls.emit(HLS_EVENTS.AUDIO_TRACKS_UPDATED);
      expect(selectField('#cQual').value).toBe('1');
      hls.emit(HLS_EVENTS.SUBTITLE_TRACKS_UPDATED);
    });

    it('escolher muda o hls.js', async () => {
      const { app } = await bootPlayer();
      app.player.playLive(channel(1));
      const hls = FakeHls.latest();
      hls.levels = [
        { height: 720, bitrate: 1 },
        { height: 360, bitrate: 1 },
      ];
      hls.audioTracks = [{ name: 'a' }, { name: 'b' }];
      hls.subtitleTracks = [{ name: 's' }];
      hls.emit(HLS_EVENTS.MANIFEST_PARSED);
      selectField('#cQual').value = '1';
      fire(element('#cQual'), 'change');
      expect(hls.currentLevel).toBe(1);
      selectField('#cAudio').value = '1';
      fire(element('#cAudio'), 'change');
      expect(hls.audioTrack).toBe(1);
      selectField('#cSub').value = '0';
      fire(element('#cSub'), 'change');
      expect(hls.subtitleTrack).toBe(0);
      expect(hls.subtitleDisplay).toBe(true);
      selectField('#cSub').value = '-1';
      fire(element('#cSub'), 'change');
      expect(hls.subtitleDisplay).toBe(false);
    });

    it('uma faixa só não mostra o seletor', async () => {
      const { app } = await bootPlayer();
      app.player.playLive(channel(1));
      FakeHls.latest().emit(HLS_EVENTS.MANIFEST_PARSED);
      expect(element('#cQual').hidden).toBe(true);
      expect(element('#cAudio').hidden).toBe(true);
      expect(element('#cSub').hidden).toBe(true);
    });

    it('sem hls.js ativo não faz nada', async () => {
      const { app } = await bootPlayer();
      app.player.playLive(channel(1));
      const hls = FakeHls.latest();
      app.player.closePlayer();
      hls.levels = [
        { height: 720, bitrate: 1 },
        { height: 360, bitrate: 1 },
      ];
      hls.emit(HLS_EVENTS.MANIFEST_PARSED);
      expect(element('#cQual').hidden).toBe(true);
      selectField('#cQual').innerHTML = '<option value="1">1</option>';
      fire(element('#cQual'), 'change');
    });

    it('preenche as faixas da reprodução nativa', async () => {
      const { app, video } = await bootPlayer();
      const audioTracks = [
        { label: 'Português', language: 'pt', enabled: true },
        { label: '', language: 'en', enabled: false },
        { label: '', language: '', enabled: false },
      ];
      Object.defineProperty(app.playback.video(), 'audioTracks', { configurable: true, value: audioTracks });
      video.textTracks = [
        { label: 'PT', language: 'pt', mode: 'disabled' },
        { label: '', language: 'en', mode: 'disabled' },
        { label: '', language: '', mode: 'disabled' },
      ];
      app.player.playMedia(mediaDescriptor());
      fire(app.playback.video(), 'loadedmetadata');
      expect(selectField('#cAudio').textContent).toContain('Áudio 3');
      expect(selectField('#cSub').textContent).toContain('Legenda 3');
      selectField('#cAudio').value = '1';
      fire(element('#cAudio'), 'change');
      expect(audioTracks.map(track => track.enabled)).toEqual([false, true, false]);
      selectField('#cSub').value = '1';
      fire(element('#cSub'), 'change');
      expect(video.textTracks.map(track => track.mode)).toEqual(['disabled', 'showing', 'disabled']);
    });

    it('sem faixas nativas não mostra seletores', async () => {
      const { app } = await bootPlayer();
      app.player.playMedia(mediaDescriptor());
      fire(app.playback.video(), 'loadedmetadata');
      expect(element('#cAudio').hidden).toBe(true);
      selectField('#cAudio').innerHTML = '<option value="0">0</option>';
      fire(element('#cAudio'), 'change');
    });

    it('com hls.js ignora o evento nativo', async () => {
      const { app, video } = await bootPlayer();
      video.textTracks = [{ label: 'PT', language: 'pt', mode: 'disabled' }];
      app.player.playLive(channel(1));
      fire(app.playback.video(), 'loadedmetadata');
      expect(element('#cSub').hidden).toBe(true);
    });
  });

  describe('controles', () => {
    it('Voltar fecha o player e volta à tela anterior', async () => {
      const { app } = await bootPlayer();
      app.player.playLive(channel(1));
      element('#plBack').click();
      expect(element('#player').hidden).toBe(true);
      expect(app.playback.playback.currentMedia).toBeNull();
      expect(FakeHls.latest().destroy).toHaveBeenCalled();
    });

    it('fechar na tela de seção atualiza os itens', async () => {
      const { app } = await bootPlayer();
      await app.section.openSection('live');
      app.player.playLive(app.state.state.catalog?.live.items[0]);
      app.section.renderItems();
      expect(document.querySelector('#items li.on')).not.toBeNull();
      app.player.closePlayer();
      expect(document.querySelector('#items li.on')).toBeNull();
    });

    it('fechar sai da tela cheia', async () => {
      const { app } = await bootPlayer();
      const exitFullscreen = jest.fn(() => Promise.resolve());
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: element('#player') });
      document.exitFullscreen = exitFullscreen;
      app.player.closePlayer();
      expect(exitFullscreen).toHaveBeenCalled();
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
    });

    it('play e pause', async () => {
      const { app, video } = await bootPlayer();
      const videoElement = app.playback.video();
      video.paused = true;
      element('#cPlay').click();
      expect(videoElement.play).toHaveBeenCalled();
      video.paused = false;
      element('#cPlay').click();
      expect(videoElement.pause).toHaveBeenCalled();
      jest.mocked(videoElement.play).mockRejectedValueOnce(new Error('falhou'));
      video.paused = true;
      element('#cPlay').click();
      await flush();
    });

    it('o ícone mostra a ação disponível', async () => {
      const { app, video } = await bootPlayer();
      const pauseIcon = element('#cPlay').innerHTML;
      video.paused = true;
      fire(app.playback.video(), 'pause');
      expect(element('#cPlay').innerHTML).not.toBe(pauseIcon);
      video.paused = false;
      fire(app.playback.video(), 'play');
      expect(element('#cPlay').innerHTML).toBe(pauseIcon);
    });

    it('volta e avança 10 s', async () => {
      const { video } = await bootPlayer();
      video.currentTime = 5;
      element('#cBack10').click();
      expect(video.currentTime).toBe(0);
      element('#cFwd10').click();
      expect(video.currentTime).toBe(10);
    });

    it('mudo', async () => {
      const { app } = await bootPlayer();
      const volumeIcon = element('#cMute').innerHTML;
      element('#cMute').click();
      expect(app.playback.video().muted).toBe(true);
      expect(element('#cMute').innerHTML).not.toBe(volumeIcon);
      element('#cMute').click();
      expect(element('#cMute').innerHTML).toBe(volumeIcon);
    });

    it('proporção da tela é salva por perfil', async () => {
      const { app } = await bootPlayer();
      selectField('#cRatio').value = 'cover';
      fire(element('#cRatio'), 'change');
      expect(app.playback.video().style.objectFit).toBe('cover');
      expect(readStorage('ratio')).toBe('cover');
      app.player.applyVideoRatio();
      expect(selectField('#cRatio').value).toBe('cover');
    });

    it('anterior e próximo trocam de canal, circulando', async () => {
      const { app } = await bootPlayer();
      const items = app.state.state.catalog?.live.items ?? [];
      app.player.playLive(items[0], items);
      element('#cNext').click();
      expect(app.playback.playback.currentMedia?.item?.k).toBe('c2');
      element('#cPrev').click();
      element('#cPrev').click();
      expect(app.playback.playback.currentMedia?.item?.k).toBe('c3');
      app.player.playCatchup(items[2] ?? channel(3), programme(1000, 2000));
      element('#cNext').click();
      expect(app.playback.playback.currentMedia?.item?.k).toBe('c1');
    });

    it('anterior e próximo trocam de episódio, sem passar das pontas', async () => {
      const { app } = await bootPlayer();
      app.details.playEpisode(series(1), {}, series(1).eps ?? [], 0);
      element('#cPrev').click();
      expect(app.playback.playback.currentMedia?.ctx?.i).toBe(0);
      element('#cNext').click();
      expect(app.playback.playback.currentMedia?.ctx?.i).toBe(1);
    });

    it('filme solto e player fechado não trocam', async () => {
      const { app } = await bootPlayer();
      element('#cNext').click();
      app.player.playMedia(mediaDescriptor());
      element('#cNext').click();
      expect(app.playback.playback.currentMedia?.desc).toMatchObject({ ref: 'vod:m1' });
    });

    it('tela cheia: entra, trava em paisagem e sai', async () => {
      const { app } = await bootPlayer();
      const lock = jest.fn(() => Promise.resolve());
      Object.defineProperty(screen, 'orientation', { configurable: true, value: { lock } });
      const requestFullscreen = jest.fn(() => Promise.resolve());
      element('#player').requestFullscreen = requestFullscreen;
      element('#cFs').click();
      await flush();
      expect(requestFullscreen).toHaveBeenCalled();
      expect(lock).toHaveBeenCalledWith('landscape');
      lock.mockImplementationOnce(() => Promise.reject(new Error('negado')));
      element('#cFs').click();
      await flush();
      Object.defineProperty(screen, 'orientation', { configurable: true, value: undefined });
      element('#cFs').click();
      await flush();
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: element('#player') });
      document.exitFullscreen = jest.fn(() => Promise.reject(new Error('falhou')));
      element('#cFs').click();
      await flush();
      expect(document.exitFullscreen).toHaveBeenCalled();
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
      expect(app.playback.playback.engine).toBeNull();
    });

    it('sem tela cheia na página usa a do vídeo (Safari)', async () => {
      const { app } = await bootPlayer();
      const webkitEnterFullscreen = jest.fn();
      app.playback.video().webkitEnterFullscreen = webkitEnterFullscreen;
      element('#player').requestFullscreen = jest.fn(() => Promise.reject(new Error('negado')));
      element('#cFs').click();
      await flush();
      expect(webkitEnterFullscreen).toHaveBeenCalledTimes(1);
      Object.setPrototypeOf(element('#player'), HTMLElement.prototype);
      Reflect.deleteProperty(element('#player'), 'requestFullscreen');
      element('#cFs').click();
      expect(webkitEnterFullscreen).toHaveBeenCalledTimes(2);
    });

    it('Picture-in-Picture', async () => {
      const { app } = await bootPlayer();
      const requestPictureInPicture = jest.fn(() => Promise.resolve(new EventTarget() as PictureInPictureWindow));
      app.playback.video().requestPictureInPicture = requestPictureInPicture;
      element('#cPip').click();
      await flush();
      expect(requestPictureInPicture).toHaveBeenCalled();
      Object.defineProperty(document, 'pictureInPictureElement', { configurable: true, value: app.playback.video() });
      document.exitPictureInPicture = jest.fn(() => Promise.resolve());
      element('#cPip').click();
      await flush();
      expect(document.exitPictureInPicture).toHaveBeenCalled();
      Object.defineProperty(document, 'pictureInPictureElement', { configurable: true, value: null });
      requestPictureInPicture.mockRejectedValueOnce(new Error('negado'));
      element('#cPip').click();
      await flush();
      expect(element('#toast').textContent).toBe('Picture-in-Picture indisponível neste navegador.');
    });

    it('esconde os controles depois de 5 s, salvo pausado ou com a lista aberta', async () => {
      const { app, video } = await bootPlayer();
      app.player.playLive(channel(1));
      video.paused = true;
      await advance(5000);
      expect(element('#player').classList.contains('idle')).toBe(false);
      video.paused = false;
      await advance(5000);
      expect(element('#player').classList.contains('idle')).toBe(true);
      fire(element('#player'), 'mousemove');
      expect(element('#player').classList.contains('idle')).toBe(false);
      element('#side').hidden = false;
      await advance(5000);
      expect(element('#player').classList.contains('idle')).toBe(false);
    });

    it('mantém a tela ligada, quando suportado', async () => {
      const { app } = await bootPlayer();
      const request = jest.fn(() => Promise.reject(new Error('negado')));
      Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
      app.player.playLive(channel(1));
      await flush();
      expect(request).toHaveBeenCalledWith('screen');
    });

    it('mensagens somem quando toca e o indicador aparece no buffer', async () => {
      const { app } = await bootPlayer();
      app.player.playLive(channel(1));
      fire(app.playback.video(), 'playing');
      expect(message()).toBe('');
      fire(app.playback.video(), 'waiting');
      expect(element('#plMsg .spinner')).toBeDefined();
      app.player.closePlayer();
      element('#plMsg').innerHTML = '';
      fire(app.playback.video(), 'waiting');
      expect(message()).toBe('');
    });
  });

  describe('acessibilidade do player', () => {
    it('vira um modal: fundo inerte, foco dentro e volta ao fechar', async () => {
      const { app } = await bootPlayer();
      await app.section.openSection('live');
      const opener = element('#items .row-main');
      opener.focus();
      app.player.playLive(channel(1));
      expect(document.activeElement).toBe(element('#player'));
      expect(element('header').hasAttribute('inert')).toBe(true);
      expect(element('#app').hasAttribute('inert')).toBe(true);
      app.player.playLive(channel(2));
      expect(element('#app').hasAttribute('inert')).toBe(true);
      app.player.closePlayer();
      expect(element('#app').hasAttribute('inert')).toBe(false);
      expect(document.activeElement).toBe(element('#items .row-main'));
    });

    it('sem foco guardado, fechar leva o foco ao conteúdo principal', async () => {
      const { app } = await bootPlayer();
      element('#appTitle').blur();
      app.player.playLive(channel(1));
      app.player.closePlayer();
      expect(document.activeElement).toBe(element('#app'));
    });

    it('na TV não move o foco ao abrir nem ao fechar sem foco guardado', async () => {
      const { app } = await bootPlayer();
      document.documentElement.classList.add('tv');
      app.playback.playerPlatformHooks.focusPlayer = () => undefined;
      element('#appTitle').blur();
      app.player.playLive(channel(1));
      expect(document.activeElement).toBe(document.body);
      app.player.closePlayer();
      expect(document.activeElement).toBe(document.body);
    });

    it('fechar um player que já está fechado não destrava o fundo de outro modal', async () => {
      const { app } = await bootPlayer();
      app.utils.loading('Baixando…');
      app.player.closePlayer();
      expect(element('#app').hasAttribute('inert')).toBe(true);
      app.utils.loading(null);
    });

    it('o título vai para o vídeo e para a aba, e volta ao fechar', async () => {
      const { app } = await bootPlayer();
      app.player.playLive(channel(1));
      expect(document.title).toBe('1 Canal 1 · Zapp IPTV');
      expect(app.playback.video().getAttribute('aria-label')).toBe('1  Canal 1');
      app.player.closePlayer();
      expect(document.title).toBe('Zapp IPTV');
      expect(app.playback.video().hasAttribute('aria-label')).toBe(false);
    });

    it('mudo e favorito dizem se estão ligados', async () => {
      const { app } = await bootPlayer(catalog(), userData({ fav: { live: ['c1'], vod: [], series: [] } }));
      app.player.playLive(channel(1));
      expect(element('#cFav').getAttribute('aria-pressed')).toBe('true');
      element('#cFav').click();
      expect(element('#cFav').getAttribute('aria-pressed')).toBe('false');
      element('#cMute').click();
      expect(element('#cMute').getAttribute('aria-pressed')).toBe('true');
      element('#cMute').click();
      expect(element('#cMute').getAttribute('aria-pressed')).toBe('false');
    });

    it('a barra de progresso fala o tempo', async () => {
      const { app, video } = await bootPlayer();
      app.player.playMedia(mediaDescriptor());
      video.duration = 100;
      video.currentTime = 25;
      fire(app.playback.video(), 'timeupdate');
      expect(element('#seek').getAttribute('aria-valuetext')).toBe('0:25 de 1:40');
      inputField('#seek').value = '500';
      fire(element('#seek'), 'input');
      expect(element('#seek').getAttribute('aria-valuetext')).toBe('0:50 de 1:40');
    });

    it('as mensagens do carregamento têm texto para o leitor de tela', async () => {
      const { app } = await bootPlayer();
      app.player.playLive(channel(1));
      expect(element('#plMsg').textContent).toContain('Carregando…');
    });

    it('o foco em um controle mostra os controles escondidos', async () => {
      const { app, video } = await bootPlayer();
      app.player.playLive(channel(1));
      video.paused = false;
      await advance(5000);
      expect(element('#player').classList.contains('idle')).toBe(true);
      fire(element('#cPlay'), 'focusin');
      expect(element('#player').classList.contains('idle')).toBe(false);
    });

    it('atalhos só valem com o foco no player', async () => {
      const { app } = await bootPlayer();
      app.player.playLive(channel(1));
      const outside = document.createElement('button');
      document.body.appendChild(outside);
      outside.focus();
      expect(pressKey(document.body, 'm').defaultPrevented).toBe(false);
      expect(app.playback.video().muted).toBe(false);
      element('#cPlay').focus();
      pressKey(document.body, 'm');
      expect(app.playback.video().muted).toBe(true);
    });

    it('o painel lateral recebe o foco ao abrir e devolve ao botão ao fechar', async () => {
      const { app } = await bootPlayer();
      const items = app.state.state.catalog?.live.items ?? [];
      app.player.playLive(items[0], items);
      element('#cList').click();
      expect(document.activeElement).toBe(element('#sideList .on .side-btn'));
      element('#sideClose').click();
      expect(document.activeElement).toBe(element('#cList'));
      element('#cList').click();
      pressKey(document.activeElement ?? document.body, 'Escape');
      expect(element('#side').hidden).toBe(true);
      expect(document.activeElement).toBe(element('#cList'));
    });

    it('o guia abre com foco no programa atual e o painel mantém o foco ao trocar de canal', async () => {
      const { app } = await bootPlayer();
      const now = Date.now();
      app.state.state.catalog = catalog({ epg: new Map([['epg1', [programme(now - 1000, now + 1000, { title: 'Atual' })]]]) });
      const items = app.state.state.catalog.live.items;
      app.player.playLive(items[0], items);
      element('#cEpg').click();
      await flush();
      expect(document.activeElement).toBe(element('#sideList .cur .side-btn'));
      element('#cEpg').click();
      expect(document.activeElement).toBe(element('#cEpg'));
      element('#cList').click();
      const secondChannelButton = element('#sideList li:nth-child(2) .side-btn');
      secondChannelButton.focus();
      secondChannelButton.click();
      expect(document.activeElement).toBe(element('#sideList li:nth-child(2) .side-btn'));
    });

    it('o guia sem programas também recebe o foco', async () => {
      const { app } = await bootPlayer();
      app.player.playLive(channel(1));
      element('#cEpg').click();
      await flush();
      expect(document.activeElement).toBe(element('#sideClose'));
    });
  });

  describe('painel lateral', () => {
    it('lista os canais e toca o escolhido', async () => {
      const { app } = await bootPlayer();
      const items = app.state.state.catalog?.live.items ?? [];
      app.player.playLive(items[0], items);
      element('#cList').click();
      expect(element('#side').hidden).toBe(false);
      expect(element('#sideTitle').textContent).toBe('Canais');
      expect(document.querySelectorAll('#sideList li')).toHaveLength(3);
      expect(element('#sideList .on').textContent).toContain('Canal 1');
      element('#sideList li:nth-child(2)').click();
      expect(app.playback.playback.currentMedia?.item?.k).toBe('c2');
      expect(element('#side').hidden).toBe(false);
      expect(element('#sideList .on').textContent).toContain('Canal 2');
    });

    it('fecha pelo botão ou repetindo o atalho', async () => {
      const { app } = await bootPlayer();
      app.player.playLive(channel(1));
      element('#cList').click();
      element('#cList').click();
      expect(element('#side').hidden).toBe(true);
      element('#cList').click();
      element('#sideClose').click();
      expect(element('#side').hidden).toBe(true);
    });

    it('lista os episódios e toca o escolhido', async () => {
      const { app } = await bootPlayer();
      app.details.playEpisode(series(1), {}, series(1).eps ?? [], 0);
      element('#cList').click();
      expect(element('#sideTitle').textContent).toBe('Série 1');
      expect(element('#sideList .on').textContent).toContain('T1E1');
      element('#sideList').click();
      element('#sideList li:nth-child(3)').click();
      expect(app.playback.playback.currentMedia?.ctx?.i).toBe(2);
    });

    it('ignora cliques fora da lista de canais', async () => {
      const { app } = await bootPlayer();
      app.player.playLive(channel(1));
      element('#cList').click();
      element('#sideList').click();
      expect(app.playback.playback.currentMedia?.item?.k).toBe('c1');
    });

    it('sem mídia mostra os canais sem seleção', async () => {
      const { app } = await bootPlayer();
      app.playback.playback.liveChannelList = [channel(1)];
      element('#cList').click();
      expect(document.querySelector('#sideList .on')).toBeNull();
    });

    it('mostra o guia com programas passados, atual e futuros', async () => {
      const { app } = await bootPlayer();
      const now = Date.now();
      const item = channel(1, { archive: 3 });
      app.state.state.catalog = catalog({
        epg: new Map([
          [
            'epg1',
            [
              programme(now - 7200000, now - 3600000, { title: 'Passado', desc: 'Resumo' }),
              programme(now - 1000, now + 1000, { title: 'Agora' }),
              programme(now + 1000, now + 2000, { title: 'Depois' }),
            ],
          ],
        ]),
      });
      app.player.playLive(item);
      element('#cEpg').click();
      await flush();
      expect(element('#sideTitle').textContent).toBe('Guia · Canal 1');
      expect(document.querySelectorAll('#sideList li')).toHaveLength(3);
      expect(element('#sideList .past').textContent).toContain('CATCH-UP');
      expect(element('#sideList .past').textContent).toContain('Resumo');
      expect(element('#sideList .cur').textContent).toContain('AGORA');
      element('#sideList li:nth-child(3)').click();
      expect(element('#toast').textContent).toBe('Programa ainda não começou.');
      element('#sideList').click();
      element('#sideList li:nth-child(2)').click();
      expect(app.playback.playback.currentMedia?.kind).toBe('live');
      await flush();
      element('#sideList li:nth-child(1)').click();
      expect(app.playback.playback.currentMedia?.kind).toBe('catchup');
    });

    it('avisa quando o canal não tem catch-up', async () => {
      const { app } = await bootPlayer();
      const now = Date.now();
      app.state.state.catalog = catalog({ epg: new Map([['epg1', [programme(now - 7200000, now - 3600000, { archive: false })]]]) });
      app.player.playLive(channel(1));
      element('#cEpg').click();
      await flush();
      element('#sideList li').click();
      expect(element('#toast').textContent).toBe('Este canal não tem catch-up para esse programa.');
    });

    it('programa com gravação libera o catch-up', async () => {
      const { app } = await bootPlayer();
      const now = Date.now();
      app.state.state.catalog = catalog({ epg: new Map([['epg1', [programme(now - 7200000, now - 3600000, { archive: true })]]]) });
      app.player.playLive(channel(1));
      element('#cEpg').click();
      await flush();
      element('#sideList li').click();
      expect(app.playback.playback.currentMedia?.kind).toBe('catchup');
    });

    it('ignora programa inválido', async () => {
      const { app } = await bootPlayer();
      const now = Date.now();
      app.state.state.catalog = catalog({ epg: new Map([['epg1', [programme(now - 7200000, now - 3600000)]]]) });
      app.player.playLive(channel(1));
      element('#cEpg').click();
      await flush();
      element('#sideList li').dataset.x = '9';
      element('#sideList li').click();
      expect(element('#toast').textContent).toBe('');
    });

    it('sem guia avisa, e repetir o atalho fecha', async () => {
      const { app } = await bootPlayer();
      app.player.playLive(channel(1));
      element('#cEpg').click();
      expect(element('#sideList').textContent).toBe('Carregando guia…');
      await flush();
      expect(element('#sideList').textContent).toBe('Sem guia de programação para este canal.');
      element('#cEpg').click();
      expect(element('#side').hidden).toBe(true);
    });

    it('sem canal não abre o guia', async () => {
      const { app } = await bootPlayer();
      app.player.playMedia(mediaDescriptor());
      element('#cEpg').click();
      await flush();
      expect(element('#side').hidden).toBe(true);
    });

    it('trocar de canal com o guia aberto atualiza o guia', async () => {
      const { app } = await bootPlayer();
      const items = app.state.state.catalog?.live.items ?? [];
      app.player.playLive(items[0], items);
      element('#cEpg').click();
      await flush();
      app.player.playLive(items[1], items);
      await flush();
      expect(element('#sideTitle').textContent).toBe('Guia · Canal 2');
      element('#cList').click();
      app.player.playLive(items[2], items);
      expect(element('#sideTitle').textContent).toBe('Canais');
    });
  });

  describe('atalhos de teclado', () => {
    /**
     * Inicia o player com um canal tocando.
     * @returns App e vídeo.
     */
    async function bootPlaying(): Promise<PlayerApp> {
      const player = await bootPlayer();
      const items = player.app.state.state.catalog?.live.items ?? [];
      player.app.player.playLive(items[0], items);
      return player;
    }

    it('fora do player só o / funciona', async () => {
      const { app } = await bootPlayer();
      pressKey(document.body, 'a');
      expect(element('#player').hidden).toBe(true);
      expect(app.playback.playback.engine).toBeNull();
    });

    it('ignora teclas em campos e com diálogo aberto', async () => {
      const { app } = await bootPlaying();
      pressKey(element('#q'), 'ArrowDown');
      expect(app.playback.playback.currentMedia?.item?.k).toBe('c1');
      element('#openSettings').click();
      pressKey(document.body, 'ArrowDown');
      expect(app.playback.playback.currentMedia?.item?.k).toBe('c1');
    });

    it.each([
      ['ArrowDown', 'c2'],
      ['PageDown', 'c2'],
      ['ChannelDown', 'c2'],
      ['ArrowUp', 'c3'],
      ['PageUp', 'c3'],
      ['ChannelUp', 'c3'],
    ])('%s troca de canal', async (key, expected) => {
      const { app } = await bootPlaying();
      expect(pressKey(document.body, key).defaultPrevented).toBe(true);
      expect(app.playback.playback.currentMedia?.item?.k).toBe(expected);
    });

    it('setas laterais pulam 10 s em filmes e não ao vivo', async () => {
      const { app, video } = await bootPlaying();
      video.currentTime = 50;
      pressKey(document.body, 'ArrowLeft');
      pressKey(document.body, 'ArrowRight');
      expect(video.currentTime).toBe(50);
      app.player.playMedia(mediaDescriptor());
      pressKey(document.body, 'ArrowLeft');
      expect(video.currentTime).toBe(40);
      pressKey(document.body, 'ArrowRight');
      expect(video.currentTime).toBe(50);
    });

    it.each([[' '], ['MediaPlayPause']])('tecla "%s" alterna a reprodução', async key => {
      const { app, video } = await bootPlaying();
      video.paused = true;
      jest.mocked(app.playback.video().play).mockClear();
      pressKey(document.body, key);
      expect(app.playback.video().play).toHaveBeenCalled();
    });

    it('F, M, L e G acionam os controles', async () => {
      const { app } = await bootPlaying();
      element('#player').requestFullscreen = jest.fn(() => Promise.resolve());
      pressKey(document.body, 'f');
      pressKey(document.body, 'F');
      expect(element('#player').requestFullscreen).toHaveBeenCalledTimes(2);
      pressKey(document.body, 'm');
      expect(app.playback.video().muted).toBe(true);
      pressKey(document.body, 'M');
      expect(app.playback.video().muted).toBe(false);
      pressKey(document.body, 'l');
      expect(element('#side').hidden).toBe(false);
      pressKey(document.body, 'L');
      expect(element('#side').hidden).toBe(true);
      pressKey(document.body, 'g');
      await flush();
      expect(element('#side').dataset.mode).toBe('epg');
      pressKey(document.body, 'G');
      expect(element('#side').hidden).toBe(true);
      app.player.playMedia(mediaDescriptor());
      pressKey(document.body, 'g');
      expect(element('#side').hidden).toBe(true);
    });

    it.each([['Escape'], ['Backspace'], ['BrowserBack']])('%s fecha o painel e depois o player', async key => {
      await bootPlaying();
      element('#cList').click();
      pressKey(document.body, key);
      expect(element('#side').hidden).toBe(true);
      expect(element('#player').hidden).toBe(false);
      pressKey(document.body, key);
      expect(element('#player').hidden).toBe(true);
    });

    it('Esc em tela cheia não fecha o player', async () => {
      await bootPlaying();
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: element('#player') });
      pressKey(document.body, 'Escape');
      expect(element('#player').hidden).toBe(false);
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
    });

    it('digitar o número troca de canal, respeitando PIN e ocultos', async () => {
      const { app } = await bootPlaying();
      pressKey(document.body, '2');
      expect(element('#numpad').hidden).toBe(false);
      expect(element('#numpad').textContent).toBe('2');
      await advance(1500);
      expect(element('#numpad').hidden).toBe(true);
      expect(app.playback.playback.currentMedia?.item?.k).toBe('c2');
      app.state.state.userData.locked.push('live:abertos');
      pressKey(document.body, '3');
      await advance(1500);
      expect(element('#dPin').hasAttribute('open')).toBe(true);
    });

    it('número inexistente avisa e os outros dígitos acumulam', async () => {
      await bootPlaying();
      pressKey(document.body, '1');
      pressKey(document.body, '2');
      await advance(1000);
      pressKey(document.body, '3');
      pressKey(document.body, '4');
      pressKey(document.body, '5');
      expect(element('#numpad').textContent).toBe('2345');
      await advance(1500);
      expect(element('#toast').textContent).toBe('Canal 2345 não existe.');
    });

    it('em filmes os dígitos não fazem nada', async () => {
      const { app } = await bootPlaying();
      app.player.playMedia(mediaDescriptor());
      pressKey(document.body, '1');
      expect(element('#numpad').hidden).toBe(true);
      pressKey(document.body, 'x');
    });
  });

  it('ao vivo sem mídia fica sem canal atual', async () => {
    const { app } = await bootPlayer(catalog({ vod: sectionData([movie(1)]) }));
    app.player.playMedia(mediaDescriptor());
    expect(app.playback.playback.currentMedia?.item).toBeUndefined();
    app.state.state.activePlaylist = null;
    expect(() => app.player.playMedia(mediaDescriptor({ url: 'http://x/f.ts' }))).not.toThrow();
  });
});
