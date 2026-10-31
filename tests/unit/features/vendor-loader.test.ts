import { preloadHlsLibrary, whenLibraryReady } from '../../../src/features/player/vendor-loader';
import { FakeHls, fakeMpegts, installFakeMediaLibraries } from '../support/media';

/** Scripts que a página tentou baixar, por endereço. */
let requestedScripts: HTMLScriptElement[] = [];

beforeEach(() => {
  requestedScripts = [];
  jest.spyOn(document.head, 'appendChild').mockImplementation(<NodeType extends Node>(node: NodeType): NodeType => {
    if (node instanceof HTMLScriptElement) requestedScripts.push(node);
    return node;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  installFakeMediaLibraries();
});

describe('carregamento sob demanda das bibliotecas de vídeo', () => {
  it('chama na hora quando a biblioteca já está na página', () => {
    installFakeMediaLibraries();
    const onReady = jest.fn();
    whenLibraryReady('hls', onReady);
    whenLibraryReady('mpegts', onReady);
    expect(onReady).toHaveBeenCalledTimes(2);
    expect(requestedScripts).toHaveLength(0);
  });

  it('baixa uma vez e avisa todos que esperavam', () => {
    Object.assign(window, { Hls: undefined, mpegts: undefined });
    const firstWaiter = jest.fn();
    const secondWaiter = jest.fn();
    whenLibraryReady('hls', firstWaiter);
    whenLibraryReady('hls', secondWaiter);
    expect(requestedScripts).toHaveLength(1);
    expect(requestedScripts[0]?.getAttribute('src')).toBe('vendor/hls.min.js');
    expect(firstWaiter).not.toHaveBeenCalled();
    Object.assign(window, { Hls: FakeHls });
    requestedScripts[0]?.onload?.(new Event('load'));
    expect(firstWaiter).toHaveBeenCalledTimes(1);
    expect(secondWaiter).toHaveBeenCalledTimes(1);
  });

  it('chama mesmo quando o download falha, para o motor tratar a falta da biblioteca', () => {
    Object.assign(window, { Hls: undefined, mpegts: undefined });
    const onReady = jest.fn();
    whenLibraryReady('mpegts', onReady);
    expect(requestedScripts[0]?.getAttribute('src')).toBe('vendor/mpegts.js');
    requestedScripts[0]?.onerror?.(new Event('error'));
    expect(onReady).toHaveBeenCalledTimes(1);
    Object.assign(window, { mpegts: fakeMpegts });
    whenLibraryReady('mpegts', onReady);
    expect(onReady).toHaveBeenCalledTimes(2);
  });

  it('tenta baixar de novo depois de uma falha', () => {
    Object.assign(window, { Hls: undefined, mpegts: undefined });
    whenLibraryReady('hls', jest.fn());
    requestedScripts[0]?.onerror?.(new Event('error'));
    whenLibraryReady('hls', jest.fn());
    expect(requestedScripts).toHaveLength(2);
    requestedScripts[1]?.onerror?.(new Event('error'));
  });

  it('pré-carrega só o hls.js, pouco depois da abertura', () => {
    jest.useFakeTimers();
    Object.assign(window, { Hls: undefined, mpegts: undefined });
    preloadHlsLibrary();
    expect(requestedScripts).toHaveLength(0);
    jest.advanceTimersByTime(4000);
    expect(requestedScripts.map(script => script.getAttribute('src'))).toEqual(['vendor/hls.min.js']);
    jest.useRealTimers();
  });
});
