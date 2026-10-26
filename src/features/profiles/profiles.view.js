document.body.insertAdjacentHTML('beforeend', `
<dialog id="dProfiles" style="width:min(560px,calc(100vw - 32px))">
  <div class="dlg">
    <h3 style="text-align:center">Quem está assistindo?</h3>
    <div class="profiles" id="profileCards"></div>
    <div class="row" style="justify-content:center"><button class="btn" type="button" id="profilesManage">Gerenciar usuários</button><button class="btn" type="button" id="profilesClose">Fechar</button></div>
  </div>
</dialog>

<dialog id="dProfileEdit" style="width:min(520px,calc(100vw - 32px))">
  <form class="dlg" id="profileEditForm" novalidate>
    <h3 id="profileEditTitle">Novo usuário</h3>
    <div class="profile-preview" id="profileEditPreview"></div>
    <div class="fld"><label for="profileEditName">Nome</label><input id="profileEditName" maxlength="24" autocomplete="off" placeholder="Nome"></div>
    <div class="fld"><label>Ícone</label><div class="icon-grid" id="profileIcons"></div></div>
    <div class="fld"><label>Cor</label><div class="color-row" id="profileColors"></div></div>
    <div class="row"><button class="btn" type="button" id="profileEditCancel">Cancelar</button><button class="btn primary" type="button" id="profileEditSave">Salvar</button></div>
  </form>
</dialog>
`);
