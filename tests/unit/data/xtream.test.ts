import { advance, bootApp, element, flush, setPageUrl } from '../support/boot';
import { XTREAM_RESPONSES, XTREAM_STORAGE, xtreamHandler, xtreamLogin } from '../support/fixtures';

const PAGE_URL = 'http://127.0.0.1:8765/';

describe('API Xtream', () => {
  afterEach(() => setPageUrl(PAGE_URL));

  it('carrega canais, filmes e séries e normaliza os dados', async () => {
    const { state } = await bootApp({ storage: XTREAM_STORAGE, fetch: xtreamHandler() });
    const catalog = state.state.catalog;
    expect(catalog?.account).toEqual({
      status: 'Active',
      expiresAt: 1893456000,
      activeConnections: '1',
      maxConnections: '2',
      username: 'teste',
    });
    expect(catalog?.live.cats).toEqual([{ id: '10', name: 'Abertos' }]);
    expect(catalog?.live.items).toEqual([
      { k: '1', name: 'Canal X', logo: 'http://img.test/x.png', cat: '10', num: 5, epg: 'x', archive: 3 },
      { k: '2', name: 'Canal Y', logo: '', cat: '10', num: 2, epg: '', archive: 1 },
    ]);
    expect(catalog?.vod?.items[0]).toEqual({ k: '30', name: 'Filme X', logo: '', cat: '20', ext: 'mkv', rate: 7.5, added: 1000 });
    expect(catalog?.vod?.items[1]).toMatchObject({ ext: 'mp4', rate: 0, added: 0 });
    expect(catalog?.series?.items[0]).toEqual({
      k: '50',
      name: 'Série X',
      logo: 'http://img.test/c.png',
      cat: '40',
      rate: 8,
      added: 2000,
      plot: 'Resumo',
    });
  });

  it('manda usuário e senha codificados', async () => {
    await bootApp({ storage: XTREAM_STORAGE, fetch: xtreamHandler() });
    expect(jest.mocked(window.fetch).mock.calls[0]?.[0]).toBe(
      'http://iptv.test:8080/player_api.php?username=usu%C3%A1rio&password=se%20nha',
    );
  });

  it.each([
    ['usuário errado', { '': xtreamLogin({ auth: 0 }) }, 'Usuário ou senha inválidos'],
    ['usuário errado em texto', { '': xtreamLogin({ auth: '0' }) }, 'Usuário ou senha inválidos'],
    ['resposta sem conta', { '': {} }, 'Usuário ou senha inválidos'],
    ['resposta que não é objeto', { '': [] }, 'Usuário ou senha inválidos'],
    ['conta bloqueada', { '': xtreamLogin({ status: 'Banned' }) }, 'Conta Banned no servidor'],
    ['resposta que não é JSON', { '': '<html>' }, 'O servidor não respondeu no formato Xtream esperado'],
    ['erro do servidor', { '': new Response('', { status: 500 }) }, 'O servidor respondeu com erro 500'],
  ])('mostra o erro de %s', async (_name, overrides, message) => {
    await bootApp({ storage: XTREAM_STORAGE, fetch: xtreamHandler(overrides) });
    expect(element('#home').textContent).toContain(message);
  });

  it('aceita conta sem status', async () => {
    const { state } = await bootApp({ storage: XTREAM_STORAGE, fetch: xtreamHandler({ '': { user_info: { username: 'x' } } }) });
    expect(state.state.catalog?.account?.status).toBe('');
  });

  it('avisa quando o servidor não responde a tempo', async () => {
    await bootApp({ storage: XTREAM_STORAGE, fetch: () => new Promise<Response>(() => undefined) });
    await advance(25000);
    expect(element('#home').textContent).toContain('O servidor não respondeu em 25 segundos');
  });

  it('o botão Cancelar interrompe o carregamento', async () => {
    await bootApp({ storage: XTREAM_STORAGE, fetch: () => new Promise<Response>(() => undefined) });
    element('#loadCancel').click();
    await flush();
    expect(element('#loading').hidden).toBe(true);
    expect(element('#home').textContent).toContain('Carregamento cancelado.');
  });

  it('o botão Cancelar sem carregamento só esconde a tela', async () => {
    const { xtream } = await bootApp({ storage: { pls: [] } });
    expect(() => xtream.cancelLoading()).not.toThrow();
  });

  it('explica falhas de conexão por CORS', async () => {
    await bootApp({ storage: XTREAM_STORAGE, fetch: xtreamHandler({ '': new TypeError('Failed to fetch') }) });
    expect(element('#home').textContent).toContain('CORS');
  });

  it('explica o bloqueio de http em página https', async () => {
    setPageUrl('https://zapp.test/');
    await bootApp({ storage: XTREAM_STORAGE, fetch: xtreamHandler({ '': new TypeError('Failed to fetch') }) });
    expect(element('#home').textContent).toContain('Bloqueado: esta página está em https');
    expect(element('#home').textContent).toContain('Atenção: esta página está aberta em https');
  });

  it('avisa quando uma seção falha e abre mesmo assim', async () => {
    const { state } = await bootApp({
      storage: XTREAM_STORAGE,
      fetch: xtreamHandler({ get_vod_streams: new Response('', { status: 503 }) }),
    });
    expect(state.state.catalog?.vod).toBeNull();
    expect(state.state.catalog?.series).not.toBeNull();
    expect(element('#toast').textContent).toContain('Filmes: O servidor respondeu com erro 503');
  });

  it('avisa também quando as séries falham', async () => {
    await bootApp({ storage: XTREAM_STORAGE, fetch: xtreamHandler({ get_series: new Response('', { status: 503 }) }) });
    expect(element('#toast').textContent).toBe('Séries: O servidor respondeu com erro 503');
  });

  it('cancelar no meio das seções abre com o que já veio', async () => {
    const { state } = await bootApp({
      storage: XTREAM_STORAGE,
      fetch: url => (url.includes('get_vod_categories') ? new Promise<Response>(() => undefined) : xtreamHandler()(url)),
    });
    element('#loadCancel').click();
    await flush();
    expect(state.state.catalog?.vod).toBeNull();
    expect(state.state.catalog?.series).toBeNull();
    expect(element('#home').textContent).toContain('Toque para carregar');
  });

  it('tenta de novo uma seção que falhou', async () => {
    const { xtream, state } = await bootApp({
      storage: XTREAM_STORAGE,
      fetch: xtreamHandler({ get_vod_streams: new Response('', { status: 503 }) }),
    });
    jest.mocked(window.fetch).mockImplementation((input: RequestInfo | URL) => Promise.resolve(xtreamHandler()(String(input))));
    await expect(xtream.ensureSection('vod')).resolves.toBe(true);
    expect(state.state.catalog?.vod?.items).toHaveLength(2);
    await expect(xtream.ensureSection('vod')).resolves.toBe(true);
    await expect(xtream.ensureSection('live')).resolves.toBe(true);
  });

  it('avisa quando a seção falha de novo', async () => {
    const { xtream } = await bootApp({ storage: XTREAM_STORAGE, fetch: xtreamHandler({ get_series: new Response('', { status: 503 }) }) });
    jest
      .mocked(window.fetch)
      .mockImplementation((input: RequestInfo | URL) =>
        Promise.resolve(xtreamHandler({ get_series: new Response('', { status: 404 }) })(String(input))),
      );
    await expect(xtream.ensureSection('series')).resolves.toBe(false);
    expect(element('#toast').textContent).toBe('O servidor respondeu com erro 404');
  });

  it('não avisa quando o usuário cancela a seção', async () => {
    const { xtream } = await bootApp({
      storage: XTREAM_STORAGE,
      fetch: xtreamHandler({ get_vod_streams: new Response('', { status: 503 }) }),
    });
    element('#toast').textContent = 'antes';
    jest.mocked(window.fetch).mockImplementation(() => new Promise<Response>(() => undefined));
    const sectionLoaded = xtream.ensureSection('vod');
    await flush();
    element('#loadCancel').click();
    await expect(sectionLoaded).resolves.toBe(false);
    expect(element('#toast').textContent).toBe('antes');
  });

  it('monta as URLs de reprodução', async () => {
    const { xtream } = await bootApp({ storage: XTREAM_STORAGE, fetch: xtreamHandler() });
    expect(xtream.xtreamStreamUrl('live', '1', 'm3u8')).toBe('http://iptv.test:8080/live/usu%C3%A1rio/se%20nha/1.m3u8');
    expect(xtream.xtreamTimeshiftUrl(60, '2026-01-01:10-00', '1')).toBe(
      'http://iptv.test:8080/timeshift/usu%C3%A1rio/se%20nha/60/2026-01-01:10-00/1.ts',
    );
  });

  it('falha ao pedir URL Xtream em lista M3U', async () => {
    const { xtream } = await bootApp();
    expect(() => xtream.xtreamStreamUrl('live', '1', 'ts')).toThrow('A lista ativa não é Xtream.');
  });

  it('errText trata erros que não são Error', async () => {
    const { xtream } = await bootApp();
    expect(xtream.errText('texto')).toBe('texto');
  });

  it('usa categorias vazias quando a resposta não é uma lista', async () => {
    const { state } = await bootApp({ storage: XTREAM_STORAGE, fetch: xtreamHandler({ get_live_categories: {}, get_live_streams: null }) });
    expect(state.state.catalog?.live).toEqual({ cats: [], items: [] });
    expect(XTREAM_RESPONSES.get_live_streams).toBeDefined();
  });
});
