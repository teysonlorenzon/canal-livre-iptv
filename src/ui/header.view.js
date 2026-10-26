document.body.insertAdjacentHTML('beforeend', `
<header class="gut">
  <button class="brand" id="goHome" title="Início"><i></i>ZAPP IPTV</button>
  <span class="clock" id="clock"></span>
  <button class="btn ib" id="themeBtn"></button>
  <div class="dd" id="plDd">
    <button class="dd-btn" id="plSel" type="button" title="Lista ativa" aria-haspopup="listbox" aria-expanded="false" aria-controls="plMenu">${icon('playlist', 'pl-ico')}<span id="plSelTxt"></span></button>
    <ul class="dd-menu" id="plMenu" role="listbox" aria-label="Listas" hidden></ul>
  </div>
  <div class="hr">
    <button class="btn ib" id="openSettings" title="Configurações">${icon('gear')}<span>Configurações</span></button>
    <button class="avatar-btn" id="profileBtn" type="button"></button>
  </div>
</header>
`);
