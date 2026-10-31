import '../../src/main';
import './mobile.css';

import { $, query } from '../../src/core/dom';
import { toast } from '../../src/core/utils';
import { show } from '../../src/features/home/home';
import { playerPlatformHooks, video } from '../../src/features/player/playback';
import { closePlayer } from '../../src/features/player/player';
import { togglePlaylistMenu } from '../../src/features/playlists/playlists';

/**
 * Ajustes do app de celular (Capacitor, Android e iOS):
 * - listas e APIs IPTV são buscadas pelo lado nativo (CapacitorHttp), sem o bloqueio de CORS
 *   da WebView; os vídeos continuam no player web (hls.js / mpegts.js / nativo);
 * - o botão Voltar do Android fecha um nível por vez e, na tela inicial, sai do app;
 * - com o player aberto, sair do app (Início/gesto) leva o vídeo para o PiP e, ao fechar o
 *   player, sai da tela cheia.
 */
(() => {
  const capacitor = window.Capacitor;
  if (!capacitor || !capacitor.isNativePlatform || !capacitor.isNativePlatform()) return;
  document.documentElement.classList.add('mobile', 'platform-' + capacitor.getPlatform());

  const nativeHttp = capacitor.Plugins.CapacitorHttp;
  const webFetch = window.fetch.bind(window);

  /**
   * Converte Base64 em bytes (respostas binárias do CapacitorHttp).
   * @param base64Text Conteúdo em Base64.
   * @returns Bytes.
   */
  const base64ToBytes = (base64Text: string): Uint8Array<ArrayBuffer> => {
    const binaryText = atob(base64Text),
      byteArray = new Uint8Array(binaryText.length);
    for (let index = 0; index < binaryText.length; index++) byteArray[index] = binaryText.charCodeAt(index);
    return byteArray;
  };

  /**
   * `fetch` que busca URLs externas pelo lado nativo. Mantém o `fetch` da WebView para
   * arquivos do próprio app e para pedidos `no-cors` (teste de conexão do player, que
   * aponta para o vídeo e não deve baixá-lo inteiro).
   * @param input URL ou Request.
   * @param init Opções.
   * @returns Resposta.
   */
  window.fetch = async (input, init = {}) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!/^https?:/i.test(url) || url.startsWith(location.origin) || init.mode === 'no-cors') return webFetch(input, init);
    const isBinary = /\.gz(\?|$)/i.test(url);
    const nativeResponse = await nativeHttp.request({
      url,
      method: init.method || 'GET',
      headers: init.headers || {},
      responseType: isBinary ? 'arraybuffer' : 'text',
      connectTimeout: 30000,
      readTimeout: 120000,
    });
    const responseData = nativeResponse.data;
    let body: string | Uint8Array<ArrayBuffer>;
    if (typeof responseData !== 'string') body = JSON.stringify(responseData);
    else body = isBinary ? base64ToBytes(responseData) : responseData;
    let headers;
    try {
      headers = new Headers(nativeResponse.headers || {});
    } catch {
      headers = undefined;
    }
    return new Response(body, { status: nativeResponse.status || 200, headers });
  };

  /**
   * Botão Voltar do Android: fecha diálogo, menu, tela cheia, lista lateral, player ou seção, nessa ordem.
   */
  const handleBackButton = (): void => {
    const openDialog = query(document, 'dialog[open]', HTMLDialogElement);
    if (openDialog) return openDialog.close();
    if (!$('plMenu').hidden) return togglePlaylistMenu(false);
    if (!$('player').hidden) {
      if (isFullscreen) return setFullscreen(false);
      if (!$('side').hidden) $('side').hidden = true;
      else closePlayer();
      return;
    }
    if (!$('section').hidden) return show('home');
    capacitor.Plugins.App?.exitApp();
  };
  if (capacitor.Plugins.App) capacitor.Plugins.App.addListener('backButton', handleBackButton);

  /**
   * Picture-in-picture e tela cheia. A WebView não tem esses recursos do navegador:
   * no Android usamos o plugin nativo ZappPlayer (MainActivity), no iOS os modos de
   * apresentação do próprio <video>.
   */
  const zappPlayer = capacitor.Plugins.ZappPlayer,
    isIos = capacitor.getPlatform() === 'ios';
  let isFullscreen = false;

  /**
   * Liga ou desliga a tela cheia (Android: esconde as barras e gira para paisagem).
   * @param enabled Ligar.
   */
  const setFullscreen = (enabled: boolean): void => {
    isFullscreen = enabled;
    document.documentElement.classList.toggle('app-full', enabled);
    if (zappPlayer) zappPlayer.setFullscreen({ enabled });
  };

  $('cFs').onclick = () => {
    if (isIos) {
      video().webkitEnterFullscreen?.();
      return;
    }
    setFullscreen(!isFullscreen);
  };
  $('cPip').onclick = async () => {
    if (isIos) {
      if (video().webkitSupportsPresentationMode?.('picture-in-picture'))
        video().webkitSetPresentationMode?.(video().webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture');
      else toast('Picture-in-Picture indisponível neste aparelho.');
      return;
    }
    const pipResult = zappPlayer ? await zappPlayer.enterPip() : { entered: false };
    if (!pipResult.entered) toast('Picture-in-Picture indisponível neste aparelho.');
  };
  /** No modo PiP, só o vídeo aparece na janela flutuante. */
  if (zappPlayer)
    zappPlayer.addListener('pipChanged', pipState => {
      document.documentElement.classList.toggle('pip', !!pipState.active);
      if (pipState.active) $('side').hidden = true;
    });

  playerPlatformHooks.afterOpen = () => {
    if (zappPlayer) zappPlayer.setAutoPip({ enabled: true });
  };
  playerPlatformHooks.afterClose = () => {
    if (zappPlayer) zappPlayer.setAutoPip({ enabled: false });
    if (isFullscreen) setFullscreen(false);
  };
})();
