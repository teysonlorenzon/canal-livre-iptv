import type Hls from 'hls.js';
import type Mpegts from 'mpegts.js';

/** Eventos do hls.js usados pelo player. */
export const HLS_EVENTS = {
  MANIFEST_PARSED: 'hlsManifestParsed',
  FRAG_LOADING: 'hlsFragLoading',
  AUDIO_TRACKS_UPDATED: 'hlsAudioTracksUpdated',
  SUBTITLE_TRACKS_UPDATED: 'hlsSubtitleTracksUpdated',
  ERROR: 'hlsError',
};

/** Reprodutor hls.js falso, que dispara eventos sob comando do teste. */
export class FakeHls {
  static supported = true;
  static instances: FakeHls[] = [];
  static Events = HLS_EVENTS;
  static ErrorTypes = { MEDIA_ERROR: 'mediaError', NETWORK_ERROR: 'networkError' };
  static ErrorDetails = { MANIFEST_LOAD_ERROR: 'manifestLoadError' };
  static isSupported = (): boolean => FakeHls.supported;

  handlers = new Map<string, (eventName: string, eventData: unknown) => void>();
  levels: { height?: number; bitrate: number }[] = [];
  audioTracks: { name?: string; lang?: string }[] = [];
  subtitleTracks: { name?: string; lang?: string }[] = [];
  autoLevelEnabled = true;
  currentLevel = -1;
  audioTrack = 0;
  subtitleTrack = -1;
  subtitleDisplay = false;
  loadedUrl = '';
  destroy = jest.fn();
  recoverMediaError = jest.fn();
  startLoad = jest.fn();
  attachMedia = jest.fn();

  config: Record<string, unknown>;

  constructor(config: Record<string, unknown>) {
    this.config = config;
    FakeHls.instances.push(this);
  }

  on(eventName: string, handler: (eventName: string, eventData: unknown) => void): void {
    this.handlers.set(eventName, handler);
  }

  loadSource(url: string): void {
    this.loadedUrl = url;
  }

  /**
   * Dispara um evento registrado pelo player.
   * @param eventName Nome do evento.
   * @param eventData Dados do evento.
   */
  emit(eventName: string, eventData: unknown = {}): void {
    this.handlers.get(eventName)?.(eventName, eventData);
  }

  /**
   * Instância mais recente.
   * @returns A instância.
   * @throws Se nenhuma foi criada.
   */
  static latest(): FakeHls {
    const instance = FakeHls.instances[FakeHls.instances.length - 1];
    if (!instance) throw new Error('Nenhum hls.js foi criado.');
    return instance;
  }
}

/** Reprodutor mpegts.js falso. */
export class FakeMpegtsPlayer {
  static instances: FakeMpegtsPlayer[] = [];
  static throwOnPause = false;
  static playResult: Promise<void> | undefined = Promise.resolve();

  errorHandler: ((errorType: string, errorDetail: string) => void) | null = null;
  pause = jest.fn(() => {
    if (FakeMpegtsPlayer.throwOnPause) throw new Error('falhou');
  });
  unload = jest.fn();
  detachMediaElement = jest.fn();
  destroy = jest.fn();
  attachMediaElement = jest.fn();
  load = jest.fn();
  play = jest.fn(() => FakeMpegtsPlayer.playResult);

  source: Record<string, unknown>;
  config: Record<string, unknown>;

  constructor(source: Record<string, unknown>, config: Record<string, unknown>) {
    this.source = source;
    this.config = config;
    FakeMpegtsPlayer.instances.push(this);
  }

  on(_eventName: string, handler: (errorType: string, errorDetail: string) => void): void {
    this.errorHandler = handler;
  }
}

/** Biblioteca mpegts.js falsa. */
export const fakeMpegts = {
  supported: true,
  Events: { ERROR: 'error' },
  isSupported: (): boolean => fakeMpegts.supported,
  createPlayer: (source: Record<string, unknown>, config: Record<string, unknown>): FakeMpegtsPlayer =>
    new FakeMpegtsPlayer(source, config),
};

/**
 * Lista de trechos carregados de um vídeo.
 * @param ranges Pares de início e fim.
 * @returns Lista no formato de `video.buffered`.
 */
export const timeRanges = (ranges: [number, number][]): TimeRanges => ({
  length: ranges.length,
  start: index => ranges[index]?.[0] ?? 0,
  end: index => ranges[index]?.[1] ?? 0,
});

/** Estado do `<video>` que o jsdom não simula. */
export interface VideoState {
  paused: boolean;
  currentTime: number;
  duration: number;
  readyState: number;
  seeking: boolean;
  buffered: TimeRanges;
  error: { code: number; message: string } | null;
  canPlay: string;
  textTracks: { label: string; language: string; mode: string }[];
}

/**
 * Faz o `<video>` do player obedecer ao estado devolvido, que o teste altera à vontade.
 * @param videoElement Elemento.
 * @returns Estado do vídeo.
 */
export function controlVideo(videoElement: HTMLVideoElement): VideoState {
  const videoState: VideoState = {
    paused: false,
    currentTime: 0,
    duration: NaN,
    readyState: 0,
    seeking: false,
    buffered: timeRanges([]),
    error: null,
    canPlay: '',
    textTracks: [],
  };
  for (const key of ['paused', 'currentTime', 'duration', 'readyState', 'seeking', 'buffered', 'error', 'textTracks'] as const)
    Object.defineProperty(videoElement, key, {
      configurable: true,
      get: () => videoState[key],
      set: (value: never) => {
        videoState[key] = value;
      },
    });
  videoElement.canPlayType = () => (videoState.canPlay ? 'maybe' : '');
  return videoState;
}

/**
 * Instala as bibliotecas de vídeo falsas na página.
 */
export function installFakeMediaLibraries(): void {
  FakeHls.supported = true;
  FakeHls.instances = [];
  FakeMpegtsPlayer.instances = [];
  FakeMpegtsPlayer.throwOnPause = false;
  FakeMpegtsPlayer.playResult = Promise.resolve();
  fakeMpegts.supported = true;
  Object.assign(window, {
    Hls: FakeHls satisfies Pick<typeof Hls, 'isSupported'>,
    mpegts: fakeMpegts satisfies Pick<typeof Mpegts, 'isSupported'>,
  });
}
