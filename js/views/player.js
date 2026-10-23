document.body.insertAdjacentHTML('beforeend', `
<div id="player" hidden>
  <video id="v" playsinline></video>
  <div class="pl-msg" id="plMsg"></div>
  <div class="numpad" id="numpad" hidden></div>
  <div class="pl-ui">
    <div class="pl-top gut">
      <button class="btn" id="plBack">← Voltar</button>
      <b id="plTitle"></b>
      <span class="clock" id="plClock"></span>
    </div>
    <div class="pl-bot gut">
      <div class="epgnow" id="epgNow" hidden>
        <div class="t" id="epgT"></div>
        <div class="prog"><i id="epgP"></i></div>
        <div class="n" id="epgN"></div>
      </div>
      <div class="seek" id="seekRow" hidden>
        <span id="tCur">0:00</span><input id="seek" type="range" min="0" max="1000" value="0" aria-label="Posição"><span id="tDur">0:00</span>
      </div>
      <div class="pctrl">
        <button class="btn" id="cPrev" title="Anterior (↑ / PgUp)">⏮</button>
        <button class="btn" id="cBack10" title="Voltar 10s (←)">-10s</button>
        <button class="btn" id="cPlay" title="Play/Pause (Espaço)">⏯</button>
        <button class="btn" id="cFwd10" title="Avançar 10s (→)">+10s</button>
        <button class="btn" id="cNext" title="Próximo (↓ / PgDn)">⏭</button>
        <button class="btn" id="cMute" title="Mudo (M)">🔊</button>
        <span class="sp"></span>
        <select id="cAudio" title="Áudio" hidden></select>
        <select id="cSub" title="Legendas" hidden></select>
        <select id="cQual" title="Qualidade" hidden></select>
        <select id="cRatio" title="Formato da tela">
          <option value="contain">Ajustar</option>
          <option value="cover">Preencher</option>
          <option value="fill">Esticar</option>
        </select>
        <button class="btn" id="cList" title="Lista de canais (L)">Canais</button>
        <button class="btn" id="cEpg" title="Guia e catch-up (G)">Guia</button>
        <button class="btn" id="cFav" title="Favorito">☆</button>
        <button class="btn" id="cPip" title="Picture-in-Picture">PiP</button>
        <button class="btn" id="cFs" title="Tela cheia (F)">⛶</button>
      </div>
    </div>
  </div>
  <aside class="pl-side" id="side" hidden>
    <header><b id="sideTitle"></b><button class="btn sm" id="sideClose" style="margin-left:auto">Fechar</button></header>
    <ul id="sideList"></ul>
  </aside>
</div>
`);
