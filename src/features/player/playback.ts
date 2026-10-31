import type Hls from 'hls.js';
import type Mpegts from 'mpegts.js';

import { $ } from '../../core/dom';
import type { CurrentMedia, EngineName, Item, TimerId } from '../../core/types';

/**
 * Elemento `<video>` do player.
 * @returns O elemento.
 */
export const video = (): HTMLVideoElement => $('v');

/**
 * Tela do player.
 * @returns O elemento.
 */
export const playerScreen = (): HTMLElement => $('player');

/** Etapa da cadeia de reprodução em uso, com os controles usados pelo guardião da TV ao vivo. */
export interface ActiveStage {
  /** Token da reprodução a que a etapa pertence. */
  my: number;
  /** Motor em uso. */
  eng: EngineName;
  /** Se é transmissão ao vivo. */
  live: boolean;
  /** Se o vídeo já começou a tocar nesta etapa. */
  started: boolean;
  /** Se a etapa é uma reconexão automática. */
  retrying: boolean;
  /** Timer do limite de 20 s para começar. */
  wd?: TimerId;
  /** Pedaço de vídeo sendo baixado pelo hls.js. */
  frag?: { stats: { loaded: number } };
  /** Recarrega a mesma etapa (reconexão). */
  restart: () => void;
  /** Desiste desta etapa e passa para a próxima. */
  giveUp: (reason: string) => void;
}

/** Estado da reprodução, compartilhado entre o player e o guardião da TV ao vivo. */
export interface PlaybackState {
  hlsPlayer: Hls | null;
  mpegtsPlayer: Mpegts.Player | null;
  /** Identifica a reprodução atual; respostas de reproduções antigas são ignoradas. */
  playbackToken: number;
  /** Mídia em reprodução. */
  currentMedia: CurrentMedia | null;
  /** Lista usada para trocar de canal. */
  liveChannelList: Item[];
  /** Etapa em uso. */
  engine: ActiveStage | null;
}

export const playback: PlaybackState = {
  hlsPlayer: null,
  mpegtsPlayer: null,
  playbackToken: 0,
  currentMedia: null,
  liveChannelList: [],
  engine: null,
};

/** O que cada plataforma faz ao abrir e fechar o player (ex.: PiP automático no celular). */
export const playerPlatformHooks: { afterOpen: () => void; afterClose: () => void } = {
  afterOpen: () => undefined,
  afterClose: () => undefined,
};
