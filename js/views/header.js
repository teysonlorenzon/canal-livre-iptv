document.body.insertAdjacentHTML('beforeend', `
<header class="gut">
  <button class="brand" id="goHome" title="Início"><i></i>ZAPP IPTV</button>
  <div class="dd" id="plDd">
    <button class="dd-btn" id="plSel" type="button" title="Lista ativa" aria-haspopup="listbox" aria-expanded="false" aria-controls="plMenu"><span id="plSelTxt"></span></button>
    <ul class="dd-menu" id="plMenu" role="listbox" aria-label="Listas" hidden></ul>
  </div>
  <div class="hr">
    <span class="clock" id="clock"></span>
    <button class="btn ib" id="themeBtn"></button>
    <button class="btn ib" id="openSettings" title="Configurações">${icon('gear')}<span>Configurações</span></button>
  </div>
</header>
`);
