import { bootApp, element, flush, openCatalog } from '../support/boot';
import { catalog, channel, userData } from '../support/fixtures';

/** Destino remoto falso do `<video>`. */
class FakeRemotePlayback extends EventTarget {
  prompt = jest.fn(() => Promise.resolve());
}

/**
 * Inicia o app com um canal tocando e, se pedido, com a Remote Playback API disponível.
 * @param remote Destino remoto, ou `undefined` para navegador sem a API.
 * @returns App iniciado.
 */
async function bootCast(remote?: FakeRemotePlayback): Promise<Awaited<ReturnType<typeof bootApp>>> {
  const app = await bootApp({
    beforeLoad: () => {
      if (remote) Object.defineProperty(HTMLMediaElement.prototype, 'remote', { configurable: true, value: remote });
    },
  });
  openCatalog(app, catalog(), userData());
  app.player.playLive(channel(1, { url: 'http://x/a.m3u8' }));
  return app;
}

afterEach(() => {
  Reflect.deleteProperty(HTMLMediaElement.prototype, 'remote');
});

describe('transmitir para a TV', () => {
  it('abre o seletor da Remote Playback API com o endereço original como fonte', async () => {
    const remote = new FakeRemotePlayback();
    const app = await bootCast(remote);
    element('#cCast').click();
    await flush();
    expect(remote.prompt).toHaveBeenCalledTimes(1);
    expect(app.playback.video().disableRemotePlayback).toBe(false);
    expect(app.playback.video().querySelector('source')?.getAttribute('src')).toBe('http://x/a.m3u8');
  });

  it('não deixa fonte alternativa sem mídia tocando', async () => {
    const remote = new FakeRemotePlayback();
    const app = await bootCast(remote);
    element('#cCast').click();
    app.player.closePlayer();
    element('#cCast').click();
    await flush();
    expect(app.playback.video().querySelector('source')).toBeNull();
  });

  it('acompanha a conexão e a desconexão', async () => {
    const remote = new FakeRemotePlayback();
    await bootCast(remote);
    remote.dispatchEvent(new Event('connect'));
    expect(element('#cCast').getAttribute('aria-pressed')).toBe('true');
    remote.dispatchEvent(new Event('disconnect'));
    expect(element('#cCast').getAttribute('aria-pressed')).toBe('false');
  });

  it('não avisa quando o usuário fecha o seletor', async () => {
    const remote = new FakeRemotePlayback();
    remote.prompt.mockRejectedValueOnce(new DOMException('fechou', 'NotAllowedError'));
    await bootCast(remote);
    element('#cCast').click();
    await flush();
    expect(element('#toast').textContent).toBe('');
  });

  it('avisa quando não há TV na rede', async () => {
    const remote = new FakeRemotePlayback();
    remote.prompt.mockRejectedValueOnce(new DOMException('sem aparelhos', 'NotFoundError'));
    await bootCast(remote);
    element('#cCast').click();
    await flush();
    expect(element('#toast').textContent).toContain('Nenhuma TV encontrada');
    remote.prompt.mockRejectedValueOnce(new Error('falhou'));
    element('#cCast').click();
    await flush();
    expect(element('#toast').textContent).toContain('Nenhuma TV encontrada');
  });

  it('usa o AirPlay no Safari', async () => {
    const app = await bootCast();
    const showPicker = jest.fn();
    app.playback.video().webkitShowPlaybackTargetPicker = showPicker;
    element('#cCast').click();
    expect(showPicker).toHaveBeenCalledTimes(1);
  });

  it('ensina a transmitir a aba quando o navegador não suporta', async () => {
    await bootCast();
    element('#cCast').click();
    await flush();
    expect(element('#toast').textContent).toContain('Transmitir aba ou tela');
  });
});
