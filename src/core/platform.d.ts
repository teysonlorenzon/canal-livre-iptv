import type Hls from 'hls.js';
import type Mpegts from 'mpegts.js';

/** Resposta do pedido HTTP feito pelo lado nativo. */
interface NativeHttpResponse {
  data: unknown;
  status?: number;
  headers?: Record<string, string>;
}

/** Plugin CapacitorHttp: faz pedidos pelo lado nativo, sem o CORS da WebView. */
interface NativeHttpPlugin {
  request(options: {
    url: string;
    method: string;
    headers: HeadersInit;
    responseType: 'arraybuffer' | 'text';
    connectTimeout: number;
    readTimeout: number;
  }): Promise<NativeHttpResponse>;
}

/** Plugin App: botão Voltar do Android e saída do aplicativo. */
interface NativeAppPlugin {
  addListener(eventName: 'backButton', listener: () => void): void;
  exitApp(): void;
}

/** Plugin ZappPlayer (`ZappPlayerPlugin.java`): PiP e tela cheia no Android. */
interface ZappPlayerPlugin {
  setFullscreen(options: { enabled: boolean }): void;
  setAutoPip(options: { enabled: boolean }): void;
  enterPip(): Promise<{ entered: boolean }>;
  addListener(eventName: 'pipChanged', listener: (pipState: { active?: boolean }) => void): void;
}

/** Parte usada do `Capacitor`, que existe só no app de celular. */
interface CapacitorRuntime {
  isNativePlatform?(): boolean;
  getPlatform(): string;
  Plugins: {
    CapacitorHttp: NativeHttpPlugin;
    App?: NativeAppPlugin;
    ZappPlayer?: ZappPlayerPlugin;
  };
}

/** Faixa de áudio de um `<video>` na reprodução nativa. */
interface NativeAudioTrack {
  label: string;
  language: string;
  enabled: boolean;
}

declare global {
  interface Window {
    /** Biblioteca hls.js, carregada por `vendor/hls.min.js`. */
    Hls?: typeof Hls;
    /** Biblioteca mpegts.js, carregada por `vendor/mpegts.js`. */
    mpegts?: typeof Mpegts;
    Capacitor?: CapacitorRuntime;
  }

  interface HTMLVideoElement {
    /** Faixas de áudio (não existe em todos os navegadores). */
    audioTracks?: ArrayLike<NativeAudioTrack> & Iterable<NativeAudioTrack>;
    /** Tela cheia do Safari. */
    webkitEnterFullscreen?(): void;
    /** Modos de apresentação do Safari (PiP no iOS). */
    webkitSupportsPresentationMode?(mode: string): boolean;
    webkitSetPresentationMode?(mode: string): void;
    webkitPresentationMode?: string;
    /** Seletor de destinos do AirPlay (Safari). */
    webkitShowPlaybackTargetPicker?(): void;
  }
}
