import { icon } from '../../ui/icons';

/**
 * Liga os eventos desta parte do app. Chamada uma vez, na ordem de `main.ts`.
 */
export function renderPlayerView(): void {
  document.body.insertAdjacentHTML(
    'beforeend',
    `
<div id="player" role="dialog" aria-modal="true" aria-labelledby="plTitle" tabindex="-1" hidden>
  <video id="v" playsinline aria-label="Vídeo"></video>
  <div class="pl-msg" id="plMsg" role="status" aria-live="polite"></div>
  <div class="numpad" id="numpad" role="status" aria-live="polite" hidden></div>
  <div class="pl-ui">
    <div class="pl-top gut">
      <button class="btn ib" id="plBack" type="button">${icon('back')}<span>Voltar</span></button>
      <h2 id="plTitle"></h2>
      <span class="clock" id="plClock" aria-hidden="true"></span>
    </div>
    <div class="pl-bot gut">
      <div class="epgnow" id="epgNow" hidden>
        <div class="osd-logo" id="osdLogo" aria-hidden="true"></div>
        <div class="osd-main">
          <div class="osd-ch"><span class="osd-live">AO VIVO</span><b id="osdName"></b></div>
          <div class="t" id="epgT"></div>
          <div class="osd-time"><span id="epgTime"></span><div class="prog"><i id="epgP"></i></div><span id="epgLeft"></span></div>
          <div class="n" id="epgN"></div>
        </div>
      </div>
      <div class="seek" id="seekRow" hidden>
        <span id="tCur" aria-hidden="true">0:00</span><input id="seek" type="range" min="0" max="1000" value="0" aria-label="Posição" aria-valuetext="0:00"><span id="tDur" aria-hidden="true">0:00</span>
      </div>
      <div class="pctrl">
        <button class="btn ib" id="cPrev" type="button" title="Anterior (↑ / PgUp)" aria-label="Anterior" aria-keyshortcuts="ArrowUp PageUp">${icon('prev')}</button>
        <button class="btn ib" id="cBack10" type="button" title="Voltar 10s (←)" aria-label="Voltar 10 segundos" aria-keyshortcuts="ArrowLeft">${icon('rew10')}</button>
        <button class="btn ib play" id="cPlay" type="button" title="Play/Pause (Espaço)" aria-label="Play/Pause" aria-keyshortcuts="Space">${icon('pause')}</button>
        <button class="btn ib" id="cFwd10" type="button" title="Avançar 10s (→)" aria-label="Avançar 10 segundos" aria-keyshortcuts="ArrowRight">${icon('fwd10')}</button>
        <button class="btn ib" id="cNext" type="button" title="Próximo (↓ / PgDn)" aria-label="Próximo" aria-keyshortcuts="ArrowDown PageDown">${icon('next')}</button>
        <button class="btn ib" id="cMute" type="button" title="Mudo (M)" aria-label="Mudo" aria-pressed="false" aria-keyshortcuts="m">${icon('vol')}</button>
        <span class="sp"></span>
        <select id="cAudio" title="Áudio" aria-label="Faixa de áudio" hidden></select>
        <select id="cSub" title="Legendas" aria-label="Legendas" hidden></select>
        <select id="cQual" title="Qualidade" aria-label="Qualidade do vídeo" hidden></select>
        <select id="cRatio" title="Formato da tela" aria-label="Formato da tela">
          <option value="contain">Ajustar</option>
          <option value="cover">Preencher</option>
          <option value="fill">Esticar</option>
        </select>
        <button class="btn ib" id="cList" type="button" title="Lista de canais (L)" aria-keyshortcuts="l">${icon('list')}<span>Canais</span></button>
        <button class="btn ib" id="cEpg" type="button" title="Guia e catch-up (G)" aria-keyshortcuts="g">${icon('guide')}<span>Guia</span></button>
        <button class="btn ib" id="cFav" type="button" title="Favorito" aria-label="Favoritar" aria-pressed="false">${icon('star')}</button>
        <button class="btn ib" id="cCast" type="button" title="Transmitir para a TV" aria-label="Transmitir para a TV" aria-pressed="false">${icon('cast')}</button>
        <button class="btn ib" id="cPip" type="button" title="Picture-in-Picture" aria-label="Picture-in-Picture">${icon('pip')}</button>
        <button class="btn ib" id="cFs" type="button" title="Tela cheia (F)" aria-label="Tela cheia" aria-keyshortcuts="f">${icon('fs')}</button>
      </div>
    </div>
  </div>
  <aside class="pl-side" id="side" aria-labelledby="sideTitle" hidden>
    <header><h2 id="sideTitle"></h2><button class="btn sm ib" id="sideClose" type="button" style="margin-left:auto" title="Fechar" aria-label="Fechar">${icon('close')}</button></header>
    <ul id="sideList"></ul>
  </aside>
</div>
`,
  );
}
