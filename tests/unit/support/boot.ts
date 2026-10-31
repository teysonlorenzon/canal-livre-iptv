import type { Catalog, UserData } from '../../../src/core/types';
import { installFakeMediaLibraries } from './media';
import { resetBrowser } from './setup';

/** Instante fixo dos testes. */
export const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);

/** Respostas de `fetch` do teste: texto do corpo, ou função que decide pela URL. */
export type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;

/** Módulos do app, com a mesma instância que está rodando na página. */
export interface AppModules {
  dom: typeof import('../../../src/core/dom');
  state: typeof import('../../../src/core/state');
  utils: typeof import('../../../src/core/utils');
  xtream: typeof import('../../../src/data/xtream');
  epg: typeof import('../../../src/data/epg');
  home: typeof import('../../../src/features/home/home');
  recommendations: typeof import('../../../src/features/home/recommendations');
  section: typeof import('../../../src/features/section/section');
  details: typeof import('../../../src/features/details/details');
  player: typeof import('../../../src/features/player/player');
  playback: typeof import('../../../src/features/player/playback');
  playlists: typeof import('../../../src/features/playlists/playlists');
  profiles: typeof import('../../../src/features/profiles/profiles');
  settings: typeof import('../../../src/features/settings/settings');
  scrollArrows: typeof import('../../../src/ui/scroll-arrows');
}

/** Como iniciar o app no teste. */
export interface BootOptions {
  /** Valores do `localStorage` (sem o prefixo `cl_`), salvos em JSON. */
  storage?: Record<string, unknown>;
  /** Resposta de `fetch`. */
  fetch?: FetchHandler;
  /** Entrada do app (padrão: o player web). */
  entry?: 'web' | 'tv' | 'mobile' | 'desktop';
  /** Terminar a abertura e a abertura da lista (padrão: sim). */
  finishIntro?: boolean;
  /** Antes de carregar o app (ex.: instalar `window.Capacitor`). */
  beforeLoad?: () => void;
}

/**
 * Espera as promessas pendentes.
 */
export const flush = (): Promise<void> => jest.advanceTimersByTimeAsync(0);

/**
 * Avança o relógio do teste, esperando as promessas pendentes.
 * @param milliseconds Tempo a avançar.
 */
export const advance = (milliseconds: number): Promise<void> => jest.advanceTimersByTimeAsync(milliseconds);

/**
 * Salva valores no `localStorage` com o prefixo do app.
 * @param values Valores por chave (sem o prefixo).
 */
export function seedStorage(values: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(values)) localStorage.setItem('cl_' + key, JSON.stringify(value));
}

/**
 * Lê um valor do `localStorage` do app.
 * @param key Chave (sem o prefixo).
 * @returns Valor salvo.
 */
export function readStorage(key: string): unknown {
  const savedValue = localStorage.getItem('cl_' + key);
  return savedValue === null ? null : JSON.parse(savedValue);
}

/**
 * Prepara uma página limpa, com relógio falso e sem carregar o app.
 * @param options Dados salvos e `fetch`.
 */
export function preparePage({ storage = {}, fetch: fetchHandler }: Pick<BootOptions, 'storage' | 'fetch'> = {}): void {
  jest.clearAllTimers();
  jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'], now: NOW });
  resetBrowser();
  jest.resetModules();
  installFakeMediaLibraries();
  seedStorage(storage);
  window.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(fetchHandler ? fetchHandler(input instanceof Request ? input.url : String(input), init) : new Response('')),
  );
}

/**
 * Carrega os módulos do app já em execução.
 * @returns Módulos.
 */
export async function loadModules(): Promise<AppModules> {
  return {
    dom: await import('../../../src/core/dom'),
    state: await import('../../../src/core/state'),
    utils: await import('../../../src/core/utils'),
    xtream: await import('../../../src/data/xtream'),
    epg: await import('../../../src/data/epg'),
    home: await import('../../../src/features/home/home'),
    recommendations: await import('../../../src/features/home/recommendations'),
    section: await import('../../../src/features/section/section'),
    details: await import('../../../src/features/details/details'),
    player: await import('../../../src/features/player/player'),
    playback: await import('../../../src/features/player/playback'),
    playlists: await import('../../../src/features/playlists/playlists'),
    profiles: await import('../../../src/features/profiles/profiles'),
    settings: await import('../../../src/features/settings/settings'),
    scrollArrows: await import('../../../src/ui/scroll-arrows'),
  };
}

/**
 * Inicia o app numa página limpa.
 * @param options Como iniciar.
 * @returns Módulos do app.
 */
export async function bootApp({ entry = 'web', finishIntro = true, beforeLoad, ...pageOptions }: BootOptions = {}): Promise<AppModules> {
  preparePage(pageOptions);
  beforeLoad?.();
  if (entry === 'tv') await import('../../../apps/tv-webos/tv');
  else if (entry === 'mobile') await import('../../../apps/mobile/mobile');
  else if (entry === 'desktop') await import('../../../apps/desktop/desktop');
  else await import('../../../src/main');
  if (finishIntro) await advance(3000);
  return loadModules();
}

/**
 * Dispara uma tecla no alvo.
 * @param target Elemento ou documento.
 * @param key Nome da tecla.
 * @param keyCode Código da tecla (teclas do controle da TV).
 * @returns O evento disparado.
 */
export function pressKey(target: EventTarget, key: string, keyCode = 0): KeyboardEvent {
  const keyEvent = new KeyboardEvent('keydown', { key, keyCode, bubbles: true, cancelable: true });
  target.dispatchEvent(keyEvent);
  return keyEvent;
}

/**
 * Dispara um evento simples que sobe pela página.
 * @param target Elemento.
 * @param eventName Nome do evento.
 */
export function fire(target: EventTarget, eventName: string): void {
  target.dispatchEvent(new Event(eventName, { bubbles: true, cancelable: true }));
}

/**
 * Elemento por seletor, para os testes.
 * @param selector Seletor CSS.
 * @returns O elemento.
 * @throws Se não existir.
 */
export function element(selector: string): HTMLElement {
  const found = document.querySelector(selector);
  if (!(found instanceof HTMLElement)) throw new Error('Elemento não encontrado: ' + selector);
  return found;
}

/**
 * Campo de texto por seletor, para os testes.
 * @param selector Seletor CSS.
 * @returns O campo.
 * @throws Se não existir ou for de outro tipo.
 */
export function inputField(selector: string): HTMLInputElement {
  const found = document.querySelector(selector);
  if (!(found instanceof HTMLInputElement)) throw new Error('Campo não encontrado: ' + selector);
  return found;
}

/**
 * Seletor (`<select>`) por seletor CSS, para os testes.
 * @param selector Seletor CSS.
 * @returns O elemento.
 * @throws Se não existir ou for de outro tipo.
 */
export function selectField(selector: string): HTMLSelectElement {
  const found = document.querySelector(selector);
  if (!(found instanceof HTMLSelectElement)) throw new Error('Seletor não encontrado: ' + selector);
  return found;
}

/**
 * Altera o endereço da página.
 * @param url Novo endereço.
 */
export function setPageUrl(url: string): void {
  jsdom.reconfigure({ url });
}

declare global {
  /** Instância do jsdom, exposta por `support/environment.ts`. */
  var jsdom: { reconfigure(options: { url: string }): void };
}

/** Resultado de `matchMedia` com "reduzir movimento" ligado. */
export const REDUCED_MOTION: MediaQueryList = Object.assign(new EventTarget(), {
  matches: true,
  media: '(prefers-reduced-motion: reduce)',
  onchange: null,
  addListener: () => undefined,
  removeListener: () => undefined,
});

/**
 * Abre um catálogo pronto no app, sem passar pelo carregamento da lista.
 * @param app Módulos do app.
 * @param catalogData Catálogo.
 * @param preferences Preferências do perfil.
 */
export function openCatalog(app: AppModules, catalogData: Catalog, preferences?: UserData): void {
  const { state } = app.state;
  state.activePlaylist = { id: 'l1', name: 'Minha lista', type: 'm3u', url: 'http://lista.test/a.m3u' };
  state.playlists = [state.activePlaylist];
  state.catalog = catalogData;
  if (preferences) state.userData = preferences;
  app.home.renderHome();
}
