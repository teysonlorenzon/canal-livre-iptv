/**
 * Liga os eventos desta parte do app. Chamada uma vez, na ordem de `main.ts`.
 */
export function renderOverlaysView(): void {
  document.body.insertAdjacentHTML(
    'beforeend',
    `
<div class="loading" id="loading" hidden>
  <div class="loading-card" role="status" aria-live="polite">
    <svg class="loading-logo" viewBox="0 0 130 100" aria-hidden="true"><path class="loading-z-track" d="M41 24h48L45 70h46"/><path class="loading-z" d="M41 24h48L45 70h46"/><circle class="loading-dot" cx="98" cy="20" r="7.5"/></svg>
    <div><p class="loading-title" id="loadingTxt">Carregando…</p><p class="loading-note" id="loadingNote"></p></div>
    <div class="loading-bar" aria-hidden="true"><i></i></div>
    <ol class="loading-steps" id="loadingSteps"></ol>
    <p class="loading-time" id="loadingSec"></p>
    <p class="loading-hint" id="loadingHint" hidden>Alguns servidores IPTV demoram para responder. Você pode cancelar quando quiser.</p>
    <button class="btn" id="loadCancel">Cancelar</button>
  </div>
</div>
<div class="toast" id="toast"></div>
`,
  );
}
