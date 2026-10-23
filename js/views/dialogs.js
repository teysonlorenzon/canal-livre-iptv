document.body.insertAdjacentHTML('beforeend', `
<dialog id="dDetail"><div class="dlg" id="detailBody"></div></dialog>

<dialog id="dPin" style="width:min(340px,calc(100vw - 32px))">
  <form class="dlg" id="pinForm" novalidate>
    <h3>Conteúdo bloqueado</h3>
    <p class="hint">Digite o PIN do controle parental.</p>
    <input id="pinIn" class="pin" inputmode="numeric" maxlength="8" autocomplete="off" aria-label="PIN">
    <div class="row"><button class="btn" type="button" id="pinCancel">Cancelar</button><button class="btn primary" type="button" id="pinOk">Desbloquear</button></div>
  </form>
</dialog>
`);
