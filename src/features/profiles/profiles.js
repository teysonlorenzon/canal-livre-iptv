'use strict';
/**
 * Se a escolha de perfil está travada: na abertura do app, quando o último perfil usado pede
 * PIN, o seletor não pode ser fechado sem escolher um perfil (ou digitar o PIN dele).
 * @type {boolean}
 */
let profileGateActive = false;

/** @type {number} Quantidade de cores de foto de perfil (`--av0` a `--av5`). */
const PROFILE_COLOR_COUNT = 6;

/**
 * HTML da foto de perfil: círculo colorido com o ícone escolhido ou a inicial do nome.
 * @param {{name: string, icon?: string, color?: number}} profile Perfil (ou rascunho do editor).
 * @returns {string} HTML.
 */
function avatarHtml(profile) {
  const colorIndex =
    profile.color >= 0 ? profile.color % PROFILE_COLOR_COUNT : Math.max(0, profiles.indexOf(profile)) % PROFILE_COLOR_COUNT;
  const content = profile.icon && ICONS[profile.icon] ? icon(profile.icon) : esc((profile.name.trim().charAt(0) || '?').toUpperCase());
  return `<span class="avatar avatar-c${colorIndex}">${content}</span>`;
}

/**
 * Atualiza o botão de perfil do topo e os textos das configurações que dependem do perfil.
 * @returns {void}
 */
function renderProfileButton() {
  const profile = activeProfile(),
    hasManyProfiles = profiles.length > 1;
  $('profileBtn').innerHTML = avatarHtml(profile);
  $('profileBtn').title = 'Usuário: ' + profile.name;
  $('profileBtn').setAttribute('aria-label', $('profileBtn').title);
  $('parentalTitle').textContent = hasManyProfiles ? 'Controle parental — ' + profile.name : 'Controle parental';
  $('clearHist').textContent = hasManyProfiles ? 'Limpar histórico de ' + profile.name : 'Limpar histórico';
}

/**
 * Abre a tela "Quem está assistindo?" com o foco no perfil ativo.
 * @param {boolean} [lockUntilChosen] Não deixar fechar sem escolher (abertura do app com perfil protegido).
 * @returns {void}
 */
function openProfilePicker(lockUntilChosen) {
  if (lockUntilChosen) profileGateActive = true;
  $('profileCards').innerHTML =
    profiles
      .map(
        profile =>
          `<button class="profile-card${profile.id === activeProfileId ? ' on' : ''}" type="button" data-profile="${esc(profile.id)}">${avatarHtml(profile)}<b>${esc(profile.name)}</b>${profile.askPin ? '<small>com PIN</small>' : ''}</button>`,
      )
      .join('') +
    `<button class="profile-card add" type="button" data-add-profile="1"><span class="avatar">${icon('avPlus')}</span><b>Adicionar</b></button>`;
  $('profilesClose').hidden = profileGateActive;
  if (!$('dProfiles').open) $('dProfiles').showModal();
  const activeCard = $('profileCards').querySelector('.on');
  if (activeCard) activeCard.focus();
}

/**
 * Troca para um perfil, pedindo o PIN dele quando o perfil estiver protegido.
 * @param {string} profileId Perfil escolhido.
 * @returns {void}
 */
function switchProfile(profileId) {
  const profile = profiles.find(candidate => candidate.id === profileId);
  if (!profile) return;
  const isSameProfile = profile.id === activeProfileId;
  if (isSameProfile && !profileGateActive) {
    $('dProfiles').close();
    return;
  }
  if (profile.askPin) {
    requestPin(readOptions(profile.id).pin || '0000', () => activateProfile(profile), 'Digite o PIN de ' + profile.name + '.');
    return;
  }
  activateProfile(profile);
}

/**
 * Ativa um perfil: carrega opções, preferências da lista, tema e proporção dele e volta para o início.
 * @param {Perfil} profile Perfil.
 * @returns {void}
 */
function activateProfile(profile) {
  profileGateActive = false;
  if ($('dProfiles').open) $('dProfiles').close();
  const isSameProfile = profile.id === activeProfileId;
  activeProfileId = profile.id;
  store.set('user', profile.id);
  if (isSameProfile) return;
  options = readOptions();
  unlockedCategories.clear();
  if (activePlaylist) loadUserData();
  applyTheme(getTheme());
  applyVideoRatio();
  if (!$('player').hidden) closePlayer();
  renderProfileButton();
  show('home');
  toast('Olá, ' + profile.name + '!');
}

$('profileBtn').onclick = () => openProfilePicker();
/**
 * Executa uma ação só depois do PIN do Principal. Usado para criar usuários: um perfil novo
 * começa sem bloqueios, então só quem tem o PIN do Principal pode criá-lo.
 * @param {Function} action Ação a executar após acertar o PIN.
 * @param {Function} [onCancel] Chamada se o pedido for cancelado.
 * @returns {void}
 */
function withMainProfilePin(action, onCancel) {
  const mainProfile = profiles.find(profile => profile.id === MAIN_PROFILE_ID);
  const mainName = mainProfile ? mainProfile.name : 'Principal';
  requestPin(
    readOptions(MAIN_PROFILE_ID).pin || '0000',
    action,
    'Usuários novos começam sem bloqueios de categorias e sem controle parental. Para ninguém escapar dos bloqueios criando outro usuário, digite o PIN de ' +
      mainName +
      '.',
    onCancel,
    'Criar usuário',
  );
}

/**
 * Escolhe o perfil do cartão clicado, ou cria um novo (com o PIN do Principal).
 * @param {MouseEvent} clickEvent Evento de clique.
 */
$('profileCards').onclick = clickEvent => {
  if (clickEvent.target.closest('[data-add-profile]')) {
    withMainProfilePin(() => {
      const wasGateActive = profileGateActive;
      profileGateActive = false;
      $('dProfiles').close();
      openProfileEditor(null, () => openProfilePicker(wasGateActive));
    });
    return;
  }
  const profileCard = clickEvent.target.closest('[data-profile]');
  if (profileCard) switchProfile(profileCard.dataset.profile);
};
/** Fecha o seletor de perfis. */
$('profilesClose').onclick = () => $('dProfiles').close();
/** Abre as configurações na parte de usuários. */
$('profilesManage').onclick = () => {
  if (profileGateActive)
    return requestPin(
      options.pin || '0000',
      () => {
        activateProfile(activeProfile());
        openManageProfiles();
      },
      'Digite o PIN de ' + activeProfile().name + '.',
    );
  $('dProfiles').close();
  openManageProfiles();
};
/**
 * Com a escolha travada, o seletor reabre se for fechado (Esc ou Voltar).
 */
onDialogClose($('dProfiles'), () => {
  if (profileGateActive) openProfilePicker();
});

/**
 * Abre as configurações já na parte de usuários.
 * @returns {void}
 */
function openManageProfiles() {
  openSettings();
  $('profileList').scrollIntoView({ block: 'center' });
}

/**
 * Desenha a lista de perfis nas configurações (foto, nome, "Pedir PIN", Editar e Remover).
 * O Principal e o perfil ativo não podem ser removidos.
 * @returns {void}
 */
function renderProfileRows() {
  $('profileList').innerHTML = profiles
    .map(
      profile =>
        `<div class="plrow">${avatarHtml(profile)}<div><b>${esc(profile.name)}</b><small>${profile.id === activeProfileId ? 'Usuário atual' : profile.id === MAIN_PROFILE_ID ? 'Usuário principal' : ''}</small></div><label class="profile-pin"><input type="checkbox" data-askpin="${esc(profile.id)}" ${profile.askPin ? 'checked' : ''}>Pedir PIN</label><button class="btn sm" type="button" data-edit-profile="${esc(profile.id)}">Editar</button>${profile.id === MAIN_PROFILE_ID || profile.id === activeProfileId ? '' : `<button class="btn sm danger" type="button" data-del-profile="${esc(profile.id)}">Remover</button>`}</div>`,
    )
    .join('');
}

/**
 * Executa uma ação sobre outro perfil protegido só depois do PIN dele; as configurações
 * fecham durante o pedido e reabrem depois (a não ser que a própria ação cuide disso).
 * @param {Perfil} profile Perfil afetado.
 * @param {Function} action Ação a executar.
 * @param {boolean} [actionReopensSettings] A ação reabre as configurações sozinha.
 * @returns {void}
 */
function withProfilePin(profile, action, actionReopensSettings) {
  if (!profile.askPin || profile.id === activeProfileId) return action();
  $('dSettings').close();
  requestPin(
    readOptions(profile.id).pin || '0000',
    () => {
      action();
      if (!actionReopensSettings) openSettings();
    },
    'Digite o PIN de ' + profile.name + '.',
    openSettings,
  );
}

/**
 * Liga/desliga o "Pedir PIN" de um perfil (em outro perfil protegido, exige o PIN dele).
 * @param {Event} changeEvent Evento de mudança.
 */
$('profileList').onchange = changeEvent => {
  const field = changeEvent.target;
  if (field.dataset.askpin) {
    const profile = profiles.find(candidate => candidate.id === field.dataset.askpin);
    if (!profile) return;
    const wantsPin = field.checked;
    field.checked = !wantsPin;
    withProfilePin(profile, () => {
      profile.askPin = wantsPin;
      saveProfiles();
      renderProfileRows();
      if (wantsPin && (readOptions(profile.id).pin || '0000') === '0000')
        toast('Atenção: o PIN de ' + profile.name + ' ainda é o padrão 0000.');
    });
  }
};

/**
 * Edita um perfil, ou remove (com "Confirmar") apagando os dados dele: opções, tema,
 * proporção e as preferências de cada lista.
 * @param {MouseEvent} clickEvent Evento de clique.
 */
$('profileList').onclick = clickEvent => {
  const editButton = clickEvent.target.closest('[data-edit-profile]');
  if (editButton) {
    const profileToEdit = profiles.find(candidate => candidate.id === editButton.dataset.editProfile);
    if (!profileToEdit) return;
    withProfilePin(
      profileToEdit,
      () => {
        $('dSettings').close();
        openProfileEditor(profileToEdit, openSettings);
      },
      true,
    );
    return;
  }
  const removeButton = clickEvent.target.closest('[data-del-profile]');
  if (!removeButton) return;
  const profile = profiles.find(candidate => candidate.id === removeButton.dataset.delProfile);
  if (!profile) return;
  if (removeButton.dataset.confirm !== '1') {
    removeButton.dataset.confirm = '1';
    removeButton.textContent = 'Confirmar';
    return;
  }
  withProfilePin(profile, () => {
    ['opts', 'theme', 'ratio']
      .concat(playlists.map(playlist => 'ux_' + playlist.id))
      .forEach(baseKey => store.del(profileKey(baseKey, profile.id)));
    profiles = profiles.filter(candidate => candidate.id !== profile.id);
    saveProfiles();
    renderProfileRows();
    renderProfileButton();
    toast('Usuário ' + profile.name + ' removido.');
  });
};

/**
 * Abre o editor para criar um perfil novo a partir das configurações (pede o PIN do Principal).
 */
$('profileAdd').onclick = () => {
  $('dSettings').close();
  withMainProfilePin(() => openProfileEditor(null, openSettings), openSettings);
};

/** @type {{profile: Perfil|null, draft: {name: string, icon: string, color: number}, onDone: Function}|null} Edição em andamento. */
let profileEdit = null;

/**
 * Abre o editor de perfil (nome, ícone e cor).
 * @param {Perfil|null} profile Perfil a editar, ou `null` para criar um novo.
 * @param {Function} onDone Chamada ao salvar ou cancelar (ex.: reabrir a tela de origem).
 * @returns {void}
 */
function openProfileEditor(profile, onDone) {
  const draft = profile
    ? {
        name: profile.name,
        icon: profile.icon || '',
        color: profile.color >= 0 ? profile.color : Math.max(0, profiles.indexOf(profile)) % PROFILE_COLOR_COUNT,
      }
    : { name: '', icon: PROFILE_ICONS[1 + (profiles.length % (PROFILE_ICONS.length - 1))], color: profiles.length % PROFILE_COLOR_COUNT };
  profileEdit = { profile, draft, onDone };
  $('profileEditTitle').textContent = profile ? 'Editar usuário' : 'Novo usuário';
  $('profileEditName').value = draft.name;
  renderProfileEditor();
  $('dProfileEdit').showModal();
  $('profileEditName').focus();
}

/**
 * Redesenha a prévia, os ícones e as cores do editor com a escolha atual.
 * @returns {void}
 */
function renderProfileEditor() {
  const draft = profileEdit.draft,
    previewDraft = { ...draft, name: draft.name || '?' };
  $('profileEditPreview').innerHTML = avatarHtml(previewDraft);
  $('profileIcons').innerHTML = PROFILE_ICONS.map(
    iconName =>
      `<button class="icon-choice${iconName === draft.icon ? ' on' : ''}" type="button" data-icon="${iconName}" aria-label="${iconName ? 'Ícone' : 'Inicial do nome'}">${avatarHtml({ ...previewDraft, icon: iconName })}</button>`,
  ).join('');
  $('profileColors').innerHTML = Array.from(
    { length: PROFILE_COLOR_COUNT },
    (_, colorIndex) =>
      `<button class="color-choice${colorIndex === draft.color ? ' on' : ''}" type="button" data-color="${colorIndex}" aria-label="Cor ${colorIndex + 1}"><span class="avatar-c${colorIndex}"></span></button>`,
  ).join('');
}

/**
 * Escolhe um ícone e mantém o foco nele depois de redesenhar.
 * @param {MouseEvent} clickEvent Evento de clique.
 */
$('profileIcons').onclick = clickEvent => {
  const choice = clickEvent.target.closest('[data-icon]');
  if (!choice) return;
  profileEdit.draft.icon = choice.dataset.icon;
  renderProfileEditor();
  $('profileIcons')
    .querySelector('[data-icon="' + choice.dataset.icon + '"]')
    .focus();
};
/**
 * Escolhe uma cor e mantém o foco nela depois de redesenhar.
 * @param {MouseEvent} clickEvent Evento de clique.
 */
$('profileColors').onclick = clickEvent => {
  const choice = clickEvent.target.closest('[data-color]');
  if (!choice) return;
  profileEdit.draft.color = +choice.dataset.color;
  renderProfileEditor();
  $('profileColors')
    .querySelector('[data-color="' + choice.dataset.color + '"]')
    .focus();
};
/**
 * Atualiza a prévia (inicial) enquanto o nome é digitado.
 */
$('profileEditName').oninput = () => {
  profileEdit.draft.name = $('profileEditName').value;
  $('profileEditPreview').innerHTML = avatarHtml({ ...profileEdit.draft, name: profileEdit.draft.name || '?' });
};
/**
 * Enter no nome salva.
 * @param {KeyboardEvent} keyEvent Evento de tecla.
 */
$('profileEditName').onkeydown = keyEvent => {
  if (keyEvent.key === 'Enter') {
    keyEvent.preventDefault();
    $('profileEditSave').click();
  }
};
$('profileEditForm').onsubmit = submitEvent => submitEvent.preventDefault();

/**
 * Fecha o editor e volta para a tela de origem.
 * @returns {void}
 */
function closeProfileEditor() {
  const onDone = profileEdit && profileEdit.onDone;
  profileEdit = null;
  if ($('dProfileEdit').open) $('dProfileEdit').close();
  if (onDone) onDone();
}
$('profileEditCancel').onclick = closeProfileEditor;
/**
 * Fechar com Esc ou Voltar equivale a cancelar.
 */
onDialogClose($('dProfileEdit'), () => {
  if (profileEdit) closeProfileEditor();
});

/**
 * Salva o perfil editado ou cria o novo (vazio, com opções padrão).
 */
$('profileEditSave').onclick = () => {
  const draft = profileEdit.draft,
    name = $('profileEditName').value.trim().slice(0, 24);
  if (!name) {
    toast('Digite o nome do usuário.');
    $('profileEditName').focus();
    return;
  }
  if (profileEdit.profile) Object.assign(profileEdit.profile, { name, icon: draft.icon, color: draft.color });
  else profiles.push({ id: 'u' + Date.now().toString(36), name, icon: draft.icon, color: draft.color });
  saveProfiles();
  renderProfileButton();
  toast(profileEdit.profile ? 'Usuário salvo.' : 'Usuário ' + name + ' criado.');
  closeProfileEditor();
};

renderProfileButton();
