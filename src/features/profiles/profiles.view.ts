/**
 * Liga os eventos desta parte do app. Chamada uma vez, na ordem de `main.ts`.
 */
export function renderProfilesView(): void {
  document.body.insertAdjacentHTML(
    'beforeend',
    `
<dialog id="dProfiles" aria-labelledby="profilesTitle" style="width:min(560px,calc(100vw - 32px))">
  <div class="dlg">
    <h2 id="profilesTitle" style="text-align:center">Quem está assistindo?</h2>
    <div class="profiles" id="profileCards"></div>
    <div class="row" style="justify-content:center"><button class="btn" type="button" id="profilesManage">Gerenciar usuários</button><button class="btn" type="button" id="profilesClose">Fechar</button></div>
  </div>
</dialog>

<dialog id="dProfileEdit" aria-labelledby="profileEditTitle" style="width:min(520px,calc(100vw - 32px))">
  <form class="dlg" id="profileEditForm" novalidate>
    <h2 id="profileEditTitle">Novo usuário</h2>
    <div class="profile-preview" id="profileEditPreview" aria-hidden="true"></div>
    <div class="fld"><label for="profileEditName">Nome</label><input id="profileEditName" maxlength="24" autocomplete="off" placeholder="Nome" aria-describedby="profileEditError"></div>
    <p class="form-error" id="profileEditError" role="alert" hidden></p>
    <div class="fld"><span class="fld-label" id="profileIconsLabel">Ícone</span><div class="icon-grid" id="profileIcons" role="group" aria-labelledby="profileIconsLabel"></div></div>
    <div class="fld"><span class="fld-label" id="profileColorsLabel">Cor</span><div class="color-row" id="profileColors" role="group" aria-labelledby="profileColorsLabel"></div></div>
    <div class="row"><button class="btn" type="button" id="profileEditCancel">Cancelar</button><button class="btn primary" type="button" id="profileEditSave">Salvar</button></div>
  </form>
</dialog>
`,
  );
}
