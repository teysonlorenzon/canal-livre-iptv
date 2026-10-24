'use strict';
/**
 * Ajustes do app de celular (Capacitor, Android e iOS):
 * - listas e APIs IPTV são buscadas pelo lado nativo (CapacitorHttp), sem o bloqueio de CORS
 *   da WebView; os vídeos continuam no player web (hls.js / mpegts.js / nativo);
 * - o botão Voltar do Android fecha um nível por vez e, na tela inicial, sai do app.
 */
(() => {
  const C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
  document.documentElement.classList.add('mobile', 'platform-' + C.getPlatform());

  const Http = C.Plugins.CapacitorHttp;
  const webFetch = window.fetch.bind(window);

  /**
   * Converte Base64 em bytes (respostas binárias do CapacitorHttp).
   * @param {string} b64 Conteúdo em Base64.
   * @returns {Uint8Array} Bytes.
   */
  const bytes = b64 => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };

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
    const bin = /\.gz(\?|$)/i.test(url);
    const r = await Http.request({ url, method: init.method || 'GET', headers: init.headers || {}, responseType: bin ? 'arraybuffer' : 'text', connectTimeout: 30000, readTimeout: 120000 });
    let body = r.data;
    if (bin) body = bytes(body);
    else if (typeof body !== 'string') body = JSON.stringify(body);
    let headers;
    try { headers = new Headers(r.headers || {}); } catch { headers = undefined; }
    return new Response(body, { status: r.status || 200, headers });
  };

  /**
   * Botão Voltar do Android: fecha diálogo, menu, lista lateral, player ou seção, nessa ordem.
   * @returns {void}
   */
  const back = () => {
    const dlg = document.querySelector('dialog[open]');
    if (dlg) return dlg.close();
    if (!$('plMenu').hidden) return togglePlMenu(false);
    if (!$('player').hidden) { if (!$('side').hidden) $('side').hidden = true; else closePlayer(); return; }
    if (!$('section').hidden) return show('home');
    C.Plugins.App.exitApp();
  };
  if (C.Plugins.App) C.Plugins.App.addListener('backButton', back);

  /**
   * Picture-in-picture e tela cheia. A WebView não tem esses recursos do navegador:
   * no Android usamos o plugin nativo ZappPlayer (MainActivity), no iOS os modos de
   * apresentação do próprio <video>.
   */
  const ZP = C.Plugins.ZappPlayer, ios = C.getPlatform() === 'ios';
  let full = false;

  /**
   * Liga ou desliga a tela cheia (Android: esconde as barras e gira para paisagem).
   * @param {boolean} on Ligar.
   * @returns {void}
   */
  const setFull = on => { full = on; document.documentElement.classList.toggle('app-full', on); if (ZP) ZP.setFullscreen({ enabled: on }); };

  $('cFs').onclick = () => {
    if (ios) { if (v.webkitEnterFullscreen) v.webkitEnterFullscreen(); return; }
    setFull(!full);
  };
  $('cPip').onclick = async () => {
    if (ios) {
      if (v.webkitSupportsPresentationMode && v.webkitSupportsPresentationMode('picture-in-picture')) v.webkitSetPresentationMode(v.webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture');
      else toast('Picture-in-Picture indisponível neste aparelho.');
      return;
    }
    const r = ZP ? await ZP.enterPip() : { entered: false };
    if (!r.entered) toast('Picture-in-Picture indisponível neste aparelho.');
  };
  // No modo PiP, só o vídeo aparece na janela flutuante.
  if (ZP) ZP.addListener('pipChanged', e => { document.documentElement.classList.toggle('pip', !!e.active); if (e.active) $('side').hidden = true; });

  // Com o player aberto, sair do app (Início/gesto) leva o vídeo para o PiP; ao fechar o player,
  // sai da tela cheia.
  const webOpen = openPlayer, webClose = closePlayer;
  openPlayer = () => { webOpen(); if (ZP) ZP.setAutoPip({ enabled: true }); };
  closePlayer = () => { webClose(); if (ZP) ZP.setAutoPip({ enabled: false }); if (full) setFull(false); };
})();
