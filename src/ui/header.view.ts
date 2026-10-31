import { icon } from './icons';

/**
 * Liga os eventos desta parte do app. Chamada uma vez, na ordem de `main.ts`.
 */
export function renderHeaderView(): void {
  document.body.insertAdjacentHTML(
    'beforeend',
    `
<header class="gut">
  <button class="brand" id="goHome" type="button" title="Início" aria-label="Zapp IPTV, ir para o início"><i aria-hidden="true"></i>ZAPP IPTV</button>
  <span class="clock" id="clock"></span>
  <button class="btn ib" id="themeBtn" type="button"></button>
  <div class="dd" id="plDd">
    <button class="dd-btn" id="plSel" type="button" title="Lista ativa" aria-haspopup="menu" aria-expanded="false" aria-controls="plMenu">${icon('playlist', 'pl-ico')}<span id="plSelTxt"></span></button>
    <ul class="dd-menu" id="plMenu" role="menu" aria-label="Listas" hidden></ul>
  </div>
  <div class="hr">
    <button class="btn ib" id="openSettings" type="button" title="Configurações" aria-label="Configurações">${icon('gear')}<span>Configurações</span></button>
    <button class="avatar-btn" id="profileBtn" type="button"></button>
  </div>
</header>
`,
  );
}
