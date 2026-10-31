/** Bibliotecas de vídeo baixadas só quando um motor precisa delas. */
export type VendorLibrary = 'hls' | 'mpegts';

/** Arquivo de cada biblioteca e como saber se ela já está na página. */
const LIBRARIES: Record<VendorLibrary, { path: string; isLoaded: () => boolean }> = {
  hls: { path: 'vendor/hls.min.js', isLoaded: () => window.Hls !== undefined },
  mpegts: { path: 'vendor/mpegts.js', isLoaded: () => window.mpegts !== undefined },
};

/** Esperas em andamento, para não baixar a mesma biblioteca duas vezes. */
const pending = new Map<VendorLibrary, Array<() => void>>();

/**
 * Chama `onReady` assim que a biblioteca estiver disponível: na hora, se já foi baixada, ou
 * depois do download. Se o download falhar, chama do mesmo jeito: quem chama confere se a
 * biblioteca existe e trata a falta como falha do motor.
 * @param library Biblioteca necessária.
 * @param onReady Chamada quando a biblioteca está disponível (ou o download terminou).
 */
export function whenLibraryReady(library: VendorLibrary, onReady: () => void): void {
  const { path, isLoaded } = LIBRARIES[library];
  if (isLoaded()) return onReady();
  const waiting = pending.get(library);
  if (waiting) {
    waiting.push(onReady);
    return;
  }
  pending.set(library, [onReady]);
  const scriptElement = document.createElement('script');
  const finish = (): void => {
    const callbacks = pending.get(library) ?? [];
    pending.delete(library);
    scriptElement.remove();
    callbacks.forEach(callback => callback());
  };
  scriptElement.onload = finish;
  scriptElement.onerror = finish;
  scriptElement.src = path;
  document.head.appendChild(scriptElement);
}

/** Espera depois da abertura antes de baixar o hls.js, para não competir com a lista. */
const PRELOAD_DELAY_MS = 4000;

/**
 * Baixa o hls.js em segundo plano, pouco depois da abertura, para o primeiro canal começar sem
 * esperar o download. O mpegts.js só vem quando um canal precisa dele.
 */
export function preloadHlsLibrary(): void {
  setTimeout(() => whenLibraryReady('hls', () => undefined), PRELOAD_DELAY_MS);
}
