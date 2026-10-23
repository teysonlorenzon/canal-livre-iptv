document.body.insertAdjacentHTML('beforeend', `
<div class="loading" id="loading" hidden><div><div class="spinner"></div><p id="loadingTxt">Carregando…</p><p id="loadingSec" style="margin-top:4px"></p><button class="btn" id="loadCancel" style="margin-top:14px">Cancelar</button></div></div>
<div class="toast" id="toast"></div>
`);
