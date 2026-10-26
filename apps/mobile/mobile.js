'use strict';
/**
 * Ajustes do app de celular (Capacitor, Android e iOS):
 * - listas e APIs IPTV são buscadas pelo lado nativo (CapacitorHttp), sem o bloqueio de CORS
 *   da WebView; os vídeos continuam no player web (hls.js / mpegts.js / nativo);
 * - o botão Voltar do Android fecha um nível por vez e, na tela inicial, sai do app;
 * - com o player aberto, sair do app (Início/gesto) leva o vídeo para o PiP e, ao fechar o
 *   player, sai da tela cheia; o botão voltar do player é religado à nova `closePlayer`, pois
 *   guardou a função original.
 */
(() => {
  const capacitor = window.Capacitor;
  if (!capacitor || !capacitor.isNativePlatform || !capacitor.isNativePlatform()) return;
  document.documentElement.classList.add('mobile', 'platform-' + capacitor.getPlatform());

  const nativeHttp = capacitor.Plugins.CapacitorHttp;
  const webFetch = window.fetch.bind(window);

  /**
   * Converte Base64 em bytes (respostas binárias do CapacitorHttp).
   * @param {string} base64Text Conteúdo em Base64.
   * @returns {Uint8Array} Bytes.
   */
  const base64ToBytes = base64Text => { const binaryText = atob(base64Text), byteArray = new Uint8Array(binaryText.length); for (let index = 0; index < binaryText.length; index++) byteArray[index] = binaryText.charCodeAt(index); return byteArray; };

  /**
   * `fetch` que busca URLs externas pelo lado nativo. Mantém o `fetch` da WebView para
   * arquivos do próprio app e para pedidos `no-cors` (teste de conexão do player, que
   * aponta para o vídeo e não deve baixá-lo inteiro).
   * @param {RequestInfo} input URL ou Request.
   * @param {RequestInit} [init] Opções.
   * @returns {Promise<Response>} Resposta.
   */
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!/^https?:/i.test(url) || url.startsWith(location.origin) || init.mode === 'no-cors') return webFetch(input, init);
    const isBinary = /\.gz(\?|$)/i.test(url);
    const nativeResponse = await nativeHttp.request({ url, method: init.method || 'GET', headers: init.headers || {}, responseType: isBinary ? 'arraybuffer' : 'text', connectTimeout: 30000, readTimeout: 120000 });
    let body = nativeResponse.data;
    if (isBinary) body = base64ToBytes(body);
    else if (typeof body !== 'string') body = JSON.stringify(body);
    let headers;
    try { headers = new Headers(nativeResponse.headers || {}); } catch { headers = undefined; }
    return new Response(body, { status: nativeResponse.status || 200, headers });
  };

  /**
   * Botão Voltar do Android: fecha diálogo, menu, tela cheia, lista lateral, player ou seção, nessa ordem.
   * @returns {void}
   */
  const handleBackButton = () => {
    const openDialog = document.querySelector('dialog[open]');
    if (openDialog) return openDialog.close();
    if (!$('plMenu').hidden) return togglePlaylistMenu(false);
    if (!$('player').hidden) {
      if (isFullscreen) return setFullscreen(false);
      if (!$('side').hidden) $('side').hidden = true; else closePlayer();
      return;
    }
    if (!$('section').hidden) return show('home');
    capacitor.Plugins.App.exitApp();
  };
  if (capacitor.Plugins.App) capacitor.Plugins.App.addListener('backButton', handleBackButton);

  /**
   * Picture-in-picture e tela cheia. A WebView não tem esses recursos do navegador:
   * no Android usamos o plugin nativo ZappPlayer (MainActivity), no iOS os modos de
   * apresentação do próprio <video>.
   */
  const zappPlayer = capacitor.Plugins.ZappPlayer, isIos = capacitor.getPlatform() === 'ios';
  let isFullscreen = false;

  /**
   * Liga ou desliga a tela cheia (Android: esconde as barras e gira para paisagem).
   * @param {boolean} enabled Ligar.
   * @returns {void}
   */
  const setFullscreen = enabled => { isFullscreen = enabled; document.documentElement.classList.toggle('app-full', enabled); if (zappPlayer) zappPlayer.setFullscreen({ enabled }); };

  $('cFs').onclick = () => {
    if (isIos) { if (video.webkitEnterFullscreen) video.webkitEnterFullscreen(); return; }
    setFullscreen(!isFullscreen);
  };
  $('cPip').onclick = async () => {
    if (isIos) {
      if (video.webkitSupportsPresentationMode && video.webkitSupportsPresentationMode('picture-in-picture')) video.webkitSetPresentationMode(video.webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture');
      else toast('Picture-in-Picture indisponível neste aparelho.');
      return;
    }
    const pipResult = zappPlayer ? await zappPlayer.enterPip() : { entered: false };
    if (!pipResult.entered) toast('Picture-in-Picture indisponível neste aparelho.');
  };
  /** No modo PiP, só o vídeo aparece na janela flutuante. */
  if (zappPlayer) zappPlayer.addListener('pipChanged', pipState => { document.documentElement.classList.toggle('pip', !!pipState.active); if (pipState.active) $('side').hidden = true; });

  /**
   * Vídeos de outro servidor cujo áudio será analisado (episódios de séries e o vídeo auxiliar
   * da calibração da abertura) tocam pelo proxy de vídeo do app Android
   * (MediaProxyWebViewClient), que os serve pela origem do app: sem isso a WebView recusa a
   * leitura do áudio (servidor sem CORS). No player, se o proxy falhar, a cadeia original
   * continua como reserva.
   */
  if (!isIos) mediaUrlForAudioAnalysis = url => /^https?:/i.test(url) && !url.startsWith(location.origin) ? location.origin + '/_zapp_media_?u=' + encodeURIComponent(url) : url;
  const webChainFor = chainFor;
  chainFor = (url, live) => {
    const originalChain = webChainFor(url, live), analysisUrl = mediaUrlForAudioAnalysis(url);
    const isSeriesEpisode = !live && currentMedia && currentMedia.kind === 'series';
    if (!isSeriesEpisode || analysisUrl === url || originalChain[0].eng !== 'native' || !isIntroAudioDetectionEnabled()) return originalChain;
    return [{ eng: 'native', url: analysisUrl }, ...originalChain];
  };

  const webOpenPlayer = openPlayer, webClosePlayer = closePlayer;
  openPlayer = () => { webOpenPlayer(); if (zappPlayer) zappPlayer.setAutoPip({ enabled: true }); };
  closePlayer = () => { webClosePlayer(); if (zappPlayer) zappPlayer.setAutoPip({ enabled: false }); if (isFullscreen) setFullscreen(false); };
  $('plBack').onclick = () => closePlayer();
})();
