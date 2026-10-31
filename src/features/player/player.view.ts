import { icon } from '../../ui/icons';

/**
 * Liga os eventos desta parte do app. Chamada uma vez, na ordem de `main.ts`.
 */
export function renderPlayerView(): void {
  document.body.insertAdjacentHTML(
    'beforeend',
    `
<div id="player" hidden>
  <video id="v" playsinline></video>
  <div class="pl-msg" id="plMsg"></div>
  <div class="numpad" id="numpad" hidden></div>
  <div class="pl-ui">
    <div class="pl-top gut">
      <button class="btn ib" id="plBack">${icon('back')}<span>Voltar</span></button>
      <b id="plTitle"></b>
      <span class="clock" id="plClock"></span>
    </div>
    <div class="pl-bot gut">
      <div class="epgnow" id="epgNow" hidden>
        <div class="osd-logo" id="osdLogo"></div>
        <div class="osd-main">
          <div class="osd-ch"><span class="osd-live">AO VIVO</span><b id="osdName"></b></div>
          <div class="t" id="epgT"></div>
          <div class="osd-time"><span id="epgTime"></span><div class="prog"><i id="epgP"></i></div><span id="epgLeft"></span></div>
          <div class="n" id="epgN"></div>
        </div>
      </div>
      <div class="seek" id="seekRow" hidden>
        <span id="tCur">0:00</span><input id="seek" type="range" min="0" max="1000" value="0" aria-label="Posição"><span id="tDur">0:00</span>
      </div>
      <div class="pctrl">
        <button class="btn ib" id="cPrev" title="Anterior (↑ / PgUp)" aria-label="Anterior">${icon('prev')}</button>
        <button class="btn ib" id="cBack10" title="Voltar 10s (←)" aria-label="Voltar 10 segundos">${icon('rew10')}</button>
        <button class="btn ib play" id="cPlay" title="Play/Pause (Espaço)" aria-label="Play/Pause">${icon('pause')}</button>
        <button class="btn ib" id="cFwd10" title="Avançar 10s (→)" aria-label="Avançar 10 segundos">${icon('fwd10')}</button>
        <button class="btn ib" id="cNext" title="Próximo (↓ / PgDn)" aria-label="Próximo">${icon('next')}</button>
        <button class="btn ib" id="cMute" title="Mudo (M)" aria-label="Mudo">${icon('vol')}</button>
        <span class="sp"></span>
        <select id="cAudio" title="Áudio" hidden></select>
        <select id="cSub" title="Legendas" hidden></select>
        <select id="cQual" title="Qualidade" hidden></select>
        <select id="cRatio" title="Formato da tela">
          <option value="contain">Ajustar</option>
          <option value="cover">Preencher</option>
          <option value="fill">Esticar</option>
        </select>
        <button class="btn ib" id="cList" title="Lista de canais (L)">${icon('list')}<span>Canais</span></button>
        <button class="btn ib" id="cEpg" title="Guia e catch-up (G)">${icon('guide')}<span>Guia</span></button>
        <button class="btn ib" id="cFav" title="Favorito" aria-label="Favorito">${icon('star')}</button>
        <button class="btn ib" id="cPip" title="Picture-in-Picture" aria-label="Picture-in-Picture">${icon('pip')}</button>
        <button class="btn ib" id="cFs" title="Tela cheia (F)" aria-label="Tela cheia">${icon('fs')}</button>
      </div>
    </div>
  </div>
  <aside class="pl-side" id="side" hidden>
    <header><b id="sideTitle"></b><button class="btn sm ib" id="sideClose" style="margin-left:auto" title="Fechar" aria-label="Fechar">${icon('close')}</button></header>
    <ul id="sideList"></ul>
  </aside>
</div>
`,
  );
}
