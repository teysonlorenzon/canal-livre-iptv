/**
 * Liga os eventos desta parte do app. Chamada uma vez, na ordem de `main.ts`.
 */
export function renderSettingsView(): void {
  document.body.insertAdjacentHTML(
    'beforeend',
    `
<dialog id="dSettings">
  <div class="dlg">
    <h3>Configurações</h3>
    <h4>Listas</h4>
    <div id="plList" style="display:flex;flex-direction:column;gap:8px"></div>
    <h4>Adicionar lista</h4>
    <div class="seg" id="addSeg">
      <button data-t="xtream" class="on">Xtream Codes</button>
      <button data-t="m3u">URL M3U</button>
      <button data-t="file">Arquivo / colar</button>
    </div>
    <form id="addForm" novalidate style="display:flex;flex-direction:column;gap:10px">
      <div class="fld"><label for="aName">Nome da lista</label><input id="aName" placeholder="Minha lista"></div>
      <div data-for="xtream" class="fld"><label for="aServer">Servidor (com porta)</label><input id="aServer" placeholder="http://servidor.com:8080"></div>
      <div data-for="xtream" class="two">
        <div class="fld"><label for="aUser">Usuário</label><input id="aUser" autocomplete="off"></div>
        <div class="fld"><label for="aPass">Senha</label><input id="aPass" type="password" autocomplete="off"></div>
      </div>
      <div data-for="m3u" class="fld" hidden><label for="aUrl">URL da lista M3U</label><input id="aUrl" type="url" placeholder="http://…/get.php?username=…&password=…&type=m3u_plus"></div>
      <div data-for="file" class="fld" hidden><label for="aFile">Arquivo .m3u</label><input id="aFile" type="file" accept=".m3u,.m3u8,.txt"></div>
      <div data-for="file" class="fld" hidden><label for="aRaw">Ou cole o conteúdo</label><textarea id="aRaw" placeholder="#EXTM3U"></textarea></div>
      <div data-for="m3u file" class="fld" hidden><label for="aEpg">URL do EPG (XMLTV, opcional)</label><input id="aEpg" type="url" placeholder="http://…/xmltv.php?username=…&password=…"></div>
      <p class="hint" data-for="m3u">Dica: se sua URL M3U tem usuário e senha de um servidor Xtream, prefira a aba Xtream Codes. Filmes e séries ficam organizados e o EPG vem junto.</p>
      <div class="row"><button class="btn primary" type="button" id="addBtn">Adicionar e abrir</button></div>
    </form>

    <h4>Usuários</h4>
    <p class="hint">As listas valem para todos. Histórico, favoritos, bloqueios, PIN e preferências são de cada usuário.</p>
    <div id="profileList" style="display:flex;flex-direction:column;gap:8px"></div>
    <div class="row"><button class="btn" type="button" id="profileAdd">Adicionar usuário</button></div>

    <h4 id="parentalTitle">Controle parental</h4>
    <div class="two">
      <div class="fld"><label for="pinOld">PIN atual</label><input id="pinOld" inputmode="numeric" maxlength="8" placeholder="padrão 0000"></div>
      <div class="fld"><label for="pinNew">Novo PIN</label><input id="pinNew" inputmode="numeric" maxlength="8"></div>
    </div>
    <div class="row"><button class="btn" id="pinSave">Alterar PIN</button></div>
    <div class="fld"><label for="catSec">Bloquear ou ocultar categorias da lista ativa</label>
      <select id="catSec"><option value="live">TV ao vivo</option><option value="vod">Filmes</option><option value="series">Séries</option></select>
    </div>
    <div class="catrows" id="catRows"></div>
    <div class="row"><button class="btn sm" id="autoAdult">Bloquear categorias adultas automaticamente</button></div>

    <h4>Reprodução</h4>
    <div class="two">
      <div class="fld"><label for="optFmt">Formato da TV ao vivo (Xtream)</label>
        <select id="optFmt"><option value="m3u8">HLS (.m3u8)</option><option value="ts">MPEG-TS (.ts)</option></select></div>
      <div class="fld"><label for="optAuto">Próximo episódio automático</label>
        <select id="optAuto"><option value="1">Ligado</option><option value="0">Desligado</option></select></div>
    </div>
    <div class="row">
      <button class="btn danger" id="clearHist">Limpar histórico</button>
      <button class="btn primary" id="closeSettings">Fechar</button>
    </div>
  </div>
</dialog>
`,
  );
}
