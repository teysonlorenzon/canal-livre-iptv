import { advance, type AppModules, bootApp, element, fire, openCatalog } from '../support/boot';
import { catalog, channel, mediaDescriptor, userData } from '../support/fixtures';
import { controlVideo, FakeHls, HLS_EVENTS, timeRanges, type VideoState } from '../support/media';

/** App com um canal tocando e o vídeo sob controle. */
interface GuardApp {
  app: AppModules;
  video: VideoState;
}

/**
 * Inicia o app com um canal ao vivo já tocando.
 * @param url URL do canal.
 * @returns App e vídeo.
 */
async function bootLive(url = 'http://x/a.m3u8'): Promise<GuardApp> {
  const app = await bootApp();
  openCatalog(app, catalog(), userData());
  const video = controlVideo(app.playback.video());
  app.player.playLive(channel(1, { url }));
  fire(app.playback.video(), 'playing');
  return { app, video };
}

/**
 * Avança o relógio com o vídeo andando.
 * @param video Estado do vídeo.
 * @param seconds Segundos.
 */
async function playFor(video: VideoState, seconds: number): Promise<void> {
  for (let step = 0; step < seconds; step++) {
    video.currentTime += 1;
    await advance(1000);
  }
}

describe('guardião da TV ao vivo', () => {
  it('marca a etapa como funcionando quando toca', async () => {
    const { app } = await bootLive();
    expect(app.playback.playback.engine?.started).toBe(true);
    expect(app.playback.playback.engine?.retrying).toBe(false);
  });

  it('ignora o evento de tocar sem etapa ativa', async () => {
    const { app } = await bootLive();
    app.playback.playback.engine = null;
    expect(() => fire(app.playback.video(), 'playing')).not.toThrow();
    app.playback.playback.engine = {
      my: -1,
      eng: 'hls',
      live: true,
      started: false,
      retrying: false,
      restart: jest.fn(),
      giveUp: jest.fn(),
    };
    fire(app.playback.video(), 'playing');
    expect(app.playback.playback.engine.started).toBe(false);
  });

  it('não faz nada com o vídeo pausado, buscando ou com o player fechado', async () => {
    const { app, video } = await bootLive();
    video.paused = true;
    await advance(15000);
    expect(FakeHls.instances).toHaveLength(1);
    video.paused = false;
    video.seeking = true;
    await advance(15000);
    expect(FakeHls.instances).toHaveLength(1);
    video.seeking = false;
    element('#player').hidden = true;
    await advance(15000);
    expect(FakeHls.instances).toHaveLength(1);
    element('#player').hidden = false;
    app.playback.playback.engine = null;
    await advance(15000);
    expect(FakeHls.instances).toHaveLength(1);
  });

  it('reconecta o ao vivo parado há 8 s, com espera crescente', async () => {
    const { video } = await bootLive();
    video.currentTime = 1;
    await advance(10000);
    expect(element('#plMsg').textContent).toContain('Reconectando… (tentativa 1 de 6)');
    await advance(1000);
    expect(FakeHls.instances).toHaveLength(2);
  });

  it('pula buracos logo à frente no buffer', async () => {
    const { video } = await bootLive();
    video.currentTime = 10;
    await advance(1000);
    video.buffered = timeRanges([
      [0, 10],
      [11, 30],
    ]);
    await advance(2000);
    expect(video.currentTime).toBeCloseTo(11.05);
  });

  it('destrava com um pequeno avanço quando há buffer', async () => {
    const { video } = await bootLive();
    video.currentTime = 10;
    await advance(1000);
    video.buffered = timeRanges([[5, 20]]);
    await advance(2000);
    expect(video.currentTime).toBeCloseTo(10.1);
  });

  it('não pula quando não há buffer à frente', async () => {
    const { video } = await bootLive();
    video.currentTime = 10;
    await advance(1000);
    video.buffered = timeRanges([
      [2, 3],
      [100, 110],
    ]);
    await advance(2000);
    expect(video.currentTime).toBe(10);
  });

  it('depois de 6 falhas troca de motor', async () => {
    const { app } = await bootLive();
    const { liveRecover } = await import('../../../src/features/player/live-guard');
    for (let attempt = 0; attempt < 6; attempt++) liveRecover('travou');
    expect(app.playback.playback.engine?.eng).toBe('hls');
    liveRecover('travou');
    expect(app.playback.playback.engine?.eng).toBe('native');
  });

  it('um erro depois que o canal tocou reconecta no mesmo motor', async () => {
    const { app } = await bootLive();
    FakeHls.latest().emit(HLS_EVENTS.ERROR, { fatal: true, type: 'outro', details: 'x' });
    expect(app.playback.playback.engine?.eng).toBe('hls');
    expect(element('#plMsg').textContent).toContain('Reconectando');
    await advance(1000);
    expect(app.playback.playback.engine?.retrying).toBe(true);
    FakeHls.latest().emit(HLS_EVENTS.ERROR, { fatal: true, type: 'outro', details: 'x' });
    expect(element('#plMsg').textContent).toContain('tentativa 2');
  });

  it('a reconexão é cancelada se a etapa mudou', async () => {
    const { app } = await bootLive();
    const { liveRecover } = await import('../../../src/features/player/live-guard');
    liveRecover('travou');
    app.player.playMedia(mediaDescriptor());
    await advance(2000);
    expect(FakeHls.instances).toHaveLength(1);
  });

  it('liveRecover sem etapa válida não faz nada', async () => {
    const { app } = await bootLive();
    const { liveRecover } = await import('../../../src/features/player/live-guard');
    const giveUp = jest.fn();
    app.playback.playback.engine = null;
    liveRecover('x');
    app.playback.playback.engine = { my: -1, eng: 'hls', live: true, started: true, retrying: false, restart: jest.fn(), giveUp };
    liveRecover('x');
    expect(giveUp).not.toHaveBeenCalled();
  });

  it('volta para perto do ao vivo sem hls.js quando o atraso passa de 20 s', async () => {
    const { app, video } = await bootLive('http://x/a.ts');
    expect(app.playback.playback.engine?.eng).toBe('ts');
    video.buffered = timeRanges([[0, 50]]);
    video.currentTime = 10;
    await advance(1000);
    expect(video.currentTime).toBe(46);
  });

  it('não mexe com atraso pequeno ou sem buffer', async () => {
    const { app, video } = await bootLive('http://x/a.ts');
    video.currentTime = 10;
    await advance(1000);
    video.buffered = timeRanges([[0, 20]]);
    video.currentTime = 11;
    await advance(1000);
    expect(video.currentTime).toBe(11);
    expect(app.playback.playback.engine?.eng).toBe('ts');
  });

  it('zera as falhas depois de 20 s estável', async () => {
    const { video } = await bootLive();
    const { liveRecover } = await import('../../../src/features/player/live-guard');
    liveRecover('travou');
    await advance(1000);
    fire(document.querySelector('video') ?? window, 'playing');
    await playFor(video, 25);
    liveRecover('travou');
    expect(element('#plMsg').textContent).toContain('tentativa 1 de 6');
  });

  it('avisa quando a internet cai', async () => {
    await bootLive();
    fire(window, 'offline');
    expect(element('#plMsg').textContent).toContain('Sem internet');
  });

  it('não avisa fora do ao vivo', async () => {
    const { app } = await bootLive();
    app.player.playMedia(mediaDescriptor());
    element('#plMsg').textContent = '';
    fire(window, 'offline');
    fire(window, 'online');
    expect(element('#plMsg').textContent).toBe('');
    app.player.closePlayer();
    fire(window, 'offline');
    fire(window, 'online');
    expect(element('#plMsg').textContent).toBe('');
  });

  it('com o player escondido não avisa nem reconecta', async () => {
    await bootLive();
    element('#player').hidden = true;
    element('#plMsg').textContent = '';
    fire(window, 'offline');
    fire(window, 'online');
    expect(element('#plMsg').textContent).toBe('');
    expect(FakeHls.instances).toHaveLength(1);
  });

  it('reconecta quando a internet volta', async () => {
    await bootLive();
    fire(window, 'online');
    expect(FakeHls.instances).toHaveLength(2);
  });
});
