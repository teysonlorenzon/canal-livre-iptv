import { type AppModules, bootApp, element, fire, flush, openCatalog } from '../support/boot';
import { catalog, channel, mediaDescriptor, userData } from '../support/fixtures';
import { controlVideo } from '../support/media';

/** Plugins nativos falsos do celular. */
interface FakeNative {
  request: jest.Mock;
  exitApp: jest.Mock;
  setFullscreen: jest.Mock;
  setAutoPip: jest.Mock;
  enterPip: jest.Mock;
  backButton: () => void;
  pipChanged: (pipState: { active?: boolean }) => void;
}

/**
 * Instala o `Capacitor` falso.
 * @param platform Plataforma.
 * @param withPlugins Instalar os plugins App e ZappPlayer.
 * @returns Plugins falsos.
 */
function installCapacitor(platform: 'android' | 'ios', withPlugins = true): FakeNative {
  const native: FakeNative = {
    request: jest.fn(() => Promise.resolve({ data: 'ok', status: 200, headers: { 'content-type': 'text/plain' } })),
    exitApp: jest.fn(),
    setFullscreen: jest.fn(),
    setAutoPip: jest.fn(),
    enterPip: jest.fn(() => Promise.resolve({ entered: true })),
    backButton: () => undefined,
    pipChanged: () => undefined,
  };
  Object.assign(window, {
    Capacitor: {
      isNativePlatform: () => true,
      getPlatform: () => platform,
      Plugins: {
        CapacitorHttp: { request: native.request },
        ...(withPlugins
          ? {
              App: {
                exitApp: native.exitApp,
                addListener: (_eventName: string, listener: () => void) => {
                  native.backButton = listener;
                },
              },
              ZappPlayer: {
                setFullscreen: native.setFullscreen,
                setAutoPip: native.setAutoPip,
                enterPip: native.enterPip,
                addListener: (_eventName: string, listener: (pipState: { active?: boolean }) => void) => {
                  native.pipChanged = listener;
                },
              },
            }
          : {}),
      },
    },
  });
  return native;
}

/** App do celular com os plugins falsos. */
interface MobileApp {
  app: AppModules;
  native: FakeNative;
}

/**
 * Inicia o app de celular.
 * @param platform Plataforma.
 * @param withPlugins Instalar os plugins App e ZappPlayer.
 * @returns App e plugins.
 */
async function bootMobile(platform: 'android' | 'ios' = 'android', withPlugins = true): Promise<MobileApp> {
  const installed: FakeNative[] = [];
  const app = await bootApp({
    entry: 'mobile',
    beforeLoad: () => {
      installed.push(installCapacitor(platform, withPlugins));
    },
  });
  const native = installed[0];
  if (!native) throw new Error('sem plugins');
  openCatalog(app, catalog(), userData());
  return { app, native };
}

describe('celular', () => {
  afterEach(() => {
    Object.assign(window, { Capacitor: undefined });
  });

  it('marca a página com a plataforma', async () => {
    await bootMobile('ios');
    expect(document.documentElement.classList.contains('mobile')).toBe(true);
    expect(document.documentElement.classList.contains('platform-ios')).toBe(true);
  });

  it('no navegador comum não faz nada', async () => {
    await bootApp({ entry: 'mobile' });
    expect(document.documentElement.classList.contains('mobile')).toBe(false);
  });

  it('fora do app nativo não faz nada', async () => {
    await bootApp({
      entry: 'mobile',
      beforeLoad: () => {
        Object.assign(window, { Capacitor: { isNativePlatform: () => false } });
      },
    });
    expect(document.documentElement.classList.contains('mobile')).toBe(false);
    await bootApp({
      entry: 'mobile',
      beforeLoad: () => {
        Object.assign(window, { Capacitor: {} });
      },
    });
    expect(document.documentElement.classList.contains('mobile')).toBe(false);
  });

  describe('fetch pelo lado nativo', () => {
    it('busca URLs externas pelo lado nativo', async () => {
      const { native } = await bootMobile();
      const response = await window.fetch('http://lista.test/a.m3u');
      expect(await response.text()).toBe('ok');
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/plain');
      expect(native.request).toHaveBeenCalledWith({
        url: 'http://lista.test/a.m3u',
        method: 'GET',
        headers: {},
        responseType: 'text',
        connectTimeout: 30000,
        readTimeout: 120000,
      });
    });

    it('aceita Request e URL e repassa método e cabeçalhos', async () => {
      const { native } = await bootMobile();
      await window.fetch(new Request('http://lista.test/b'), { method: 'POST', headers: { a: '1' } });
      expect(native.request).toHaveBeenLastCalledWith(
        expect.objectContaining({ url: 'http://lista.test/b', method: 'POST', headers: { a: '1' } }),
      );
      await window.fetch(new URL('http://lista.test/c'));
      expect(native.request).toHaveBeenLastCalledWith(expect.objectContaining({ url: 'http://lista.test/c' }));
    });

    it('converte respostas binárias e JSON', async () => {
      const { native } = await bootMobile();
      native.request.mockResolvedValueOnce({ data: btoa('bytes') });
      const binary = await window.fetch('http://epg.test/guia.gz');
      expect(await binary.text()).toBe('bytes');
      expect(binary.status).toBe(200);
      expect(native.request).toHaveBeenLastCalledWith(expect.objectContaining({ responseType: 'arraybuffer' }));
      native.request.mockResolvedValueOnce({ data: { a: 1 }, status: 201 });
      const json = await window.fetch('http://api.test/x');
      expect(await json.text()).toBe('{"a":1}');
      expect(json.status).toBe(201);
    });

    it('ignora cabeçalhos inválidos', async () => {
      const { native } = await bootMobile();
      native.request.mockResolvedValueOnce({ data: 'x', headers: { 'cabeçalho inválido': 'x' } });
      const response = await window.fetch('http://api.test/x');
      expect(await response.text()).toBe('x');
    });

    it('mantém o fetch da WebView para arquivos do app e pedidos no-cors', async () => {
      let webFetch: jest.Mock = jest.fn();
      const app = await bootApp({
        entry: 'mobile',
        beforeLoad: () => {
          installCapacitor('android');
          webFetch = jest.fn(() => Promise.resolve(new Response('web')));
          window.fetch = webFetch;
        },
      });
      expect(app).toBeDefined();
      await window.fetch('/local.txt');
      await window.fetch(location.origin + '/arquivo');
      await window.fetch('http://video.test/f.mp4', { mode: 'no-cors' });
      expect(webFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('botão Voltar', () => {
    it('fecha um nível por vez e sai do app no início', async () => {
      const { app, native } = await bootMobile();
      element('#openSettings').click();
      native.backButton();
      expect(element('#dSettings').hasAttribute('open')).toBe(false);
      element('#plSel').click();
      native.backButton();
      expect(element('#plMenu').hidden).toBe(true);
      app.player.playLive(channel(1));
      element('#cFs').click();
      native.backButton();
      expect(native.setFullscreen).toHaveBeenLastCalledWith({ enabled: false });
      expect(element('#player').hidden).toBe(false);
      element('#side').hidden = false;
      native.backButton();
      expect(element('#side').hidden).toBe(true);
      native.backButton();
      expect(element('#player').hidden).toBe(true);
      await app.section.openSection('live');
      native.backButton();
      expect(element('#section').hidden).toBe(true);
      native.backButton();
      expect(native.exitApp).toHaveBeenCalled();
    });

    it('sem o plugin App o botão não existe', async () => {
      const { app } = await bootMobile('android', false);
      expect(() => app.player.playLive(channel(1))).not.toThrow();
    });
  });

  describe('tela cheia', () => {
    it('no Android usa o plugin e marca a página', async () => {
      const { native } = await bootMobile();
      element('#cFs').click();
      expect(native.setFullscreen).toHaveBeenLastCalledWith({ enabled: true });
      expect(document.documentElement.classList.contains('app-full')).toBe(true);
      element('#cFs').click();
      expect(native.setFullscreen).toHaveBeenLastCalledWith({ enabled: false });
      expect(document.documentElement.classList.contains('app-full')).toBe(false);
    });

    it('sem o plugin só marca a página', async () => {
      await bootMobile('android', false);
      element('#cFs').click();
      expect(document.documentElement.classList.contains('app-full')).toBe(true);
    });

    it('no iOS usa a tela cheia do vídeo', async () => {
      const { app } = await bootMobile('ios');
      const webkitEnterFullscreen = jest.fn();
      app.playback.video().webkitEnterFullscreen = webkitEnterFullscreen;
      element('#cFs').click();
      expect(webkitEnterFullscreen).toHaveBeenCalled();
    });

    it('sair do player sai da tela cheia', async () => {
      const { app, native } = await bootMobile();
      app.player.playMedia(mediaDescriptor());
      expect(native.setAutoPip).toHaveBeenLastCalledWith({ enabled: true });
      element('#cFs').click();
      element('#plBack').click();
      expect(native.setAutoPip).toHaveBeenLastCalledWith({ enabled: false });
      expect(native.setFullscreen).toHaveBeenLastCalledWith({ enabled: false });
    });

    it('sem o plugin o player abre e fecha normalmente', async () => {
      const { app } = await bootMobile('android', false);
      app.player.playMedia(mediaDescriptor());
      element('#plBack').click();
      expect(element('#player').hidden).toBe(true);
    });
  });

  describe('Picture-in-Picture', () => {
    it('no Android usa o plugin', async () => {
      const { native } = await bootMobile();
      element('#cPip').click();
      await flush();
      expect(native.enterPip).toHaveBeenCalled();
      expect(element('#toast').textContent).toBe('');
      native.enterPip.mockResolvedValueOnce({ entered: false });
      element('#cPip').click();
      await flush();
      expect(element('#toast').textContent).toBe('Picture-in-Picture indisponível neste aparelho.');
    });

    it('sem o plugin avisa', async () => {
      await bootMobile('android', false);
      element('#cPip').click();
      await flush();
      expect(element('#toast').textContent).toBe('Picture-in-Picture indisponível neste aparelho.');
    });

    it('no iOS usa os modos do vídeo', async () => {
      const { app } = await bootMobile('ios');
      const videoElement = app.playback.video();
      element('#cPip').click();
      await flush();
      expect(element('#toast').textContent).toBe('Picture-in-Picture indisponível neste aparelho.');
      const webkitSetPresentationMode = jest.fn();
      Object.assign(videoElement, {
        webkitSupportsPresentationMode: () => true,
        webkitSetPresentationMode,
        webkitPresentationMode: 'inline',
      });
      element('#cPip').click();
      await flush();
      expect(webkitSetPresentationMode).toHaveBeenLastCalledWith('picture-in-picture');
      videoElement.webkitPresentationMode = 'picture-in-picture';
      element('#cPip').click();
      await flush();
      expect(webkitSetPresentationMode).toHaveBeenLastCalledWith('inline');
    });

    it('no modo PiP só o vídeo aparece', async () => {
      const { native } = await bootMobile();
      element('#side').hidden = false;
      native.pipChanged({ active: true });
      expect(document.documentElement.classList.contains('pip')).toBe(true);
      expect(element('#side').hidden).toBe(true);
      element('#side').hidden = false;
      native.pipChanged({});
      expect(document.documentElement.classList.contains('pip')).toBe(false);
      expect(element('#side').hidden).toBe(false);
    });
  });

  it('o vídeo continua respondendo aos eventos', async () => {
    const { app } = await bootMobile();
    const video = controlVideo(app.playback.video());
    video.paused = true;
    fire(app.playback.video(), 'pause');
    expect(element('#cPlay').innerHTML).toContain('svg');
  });
});
