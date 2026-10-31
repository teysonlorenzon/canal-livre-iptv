import { clearFormError, showFormError } from '../../core/a11y';
import { $, closest, query } from '../../core/dom';
import { activeProfile, loadUserData, MAIN_PROFILE_ID, profileKey, readOptions, saveProfiles, state } from '../../core/state';
import type { Profile } from '../../core/types';
import { esc, onDialogClose, store, toast } from '../../core/utils';
import { icon, type IconName, isIconName, PROFILE_ICONS } from '../../ui/icons';
import { showSavedTheme } from '../../ui/theme-button';
import { show } from '../home/home';
import { applyVideoRatio, closePlayer } from '../player/player';
import { requestPin } from '../section/section';
import { openSettings } from '../settings/settings';

/**
 * Se a escolha de perfil está travada: na abertura do app, quando o último perfil usado pede
 * PIN, o seletor não pode ser fechado sem escolher um perfil (ou digitar o PIN dele).
 *
 */
let profileGateActive: boolean = false;

/** Quantidade de cores de foto de perfil (`--av0` a `--av5`). */
const PROFILE_COLOR_COUNT = 6;

/** Nome falado de cada cor de foto de perfil, na ordem de `--av0` a `--av5`. */
const PROFILE_COLOR_NAMES = ['Amarelo', 'Coral', 'Verde', 'Azul', 'Roxo', 'Rosa'];

/** Nome falado de cada ícone de foto de perfil. */
const PROFILE_ICON_NAMES: Partial<Record<IconName, string>> = {
  avSmile: 'Rosto sorridente',
  avCat: 'Gato',
  avDog: 'Cachorro',
  avPaw: 'Patinha',
  star: 'Estrela',
  avHeart: 'Coração',
  avBolt: 'Raio',
  avRocket: 'Foguete',
  avMusic: 'Música',
  avBall: 'Bola',
  avCrown: 'Coroa',
  avGame: 'Videogame',
  avFilm: 'Cinema',
  themeDark: 'Lua',
  themeLight: 'Sol',
};

/**
 * Cor da foto de um perfil: a escolhida ou, sem escolha, a da posição dele na lista.
 * @param profile Perfil (ou rascunho do editor).
 * @returns Índice da cor.
 */
function profileColor(profile: { color?: number }): number {
  if (profile.color !== undefined && profile.color >= 0) return profile.color % PROFILE_COLOR_COUNT;
  return (
    Math.max(
      0,
      state.profiles.findIndex(candidate => candidate === profile),
    ) % PROFILE_COLOR_COUNT
  );
}

/**
 * HTML da foto de perfil: círculo colorido com o ícone escolhido ou a inicial do nome.
 * @param profile Perfil (ou rascunho do editor).
 * @returns HTML.
 */
function avatarHtml(profile: { name: string; icon?: string; color?: number }): string {
  const colorIndex = profileColor(profile);
  const content = isIconName(profile.icon) ? icon(profile.icon) : esc((profile.name.trim().charAt(0) || '?').toUpperCase());
  return `<span class="avatar avatar-c${colorIndex}" aria-hidden="true">${content}</span>`;
}

/**
 * Atualiza o botão de perfil do topo e os textos das configurações que dependem do perfil.
 */
function renderProfileButton(): void {
  const profile = activeProfile(),
    hasManyProfiles = state.profiles.length > 1;
  $('profileBtn').innerHTML = avatarHtml(profile);
  $('profileBtn').title = 'Usuário: ' + profile.name;
  $('profileBtn').setAttribute('aria-label', $('profileBtn').title);
  $('parentalTitle').textContent = hasManyProfiles ? 'Controle parental — ' + profile.name : 'Controle parental';
  $('clearHist').textContent = hasManyProfiles ? 'Limpar histórico de ' + profile.name : 'Limpar histórico';
}

/**
 * Abre a tela "Quem está assistindo?" com o foco no perfil ativo.
 * @param lockUntilChosen Não deixar fechar sem escolher (abertura do app com perfil protegido).
 */
export function openProfilePicker(lockUntilChosen?: boolean): void {
  if (lockUntilChosen) profileGateActive = true;
  $('profileCards').innerHTML =
    state.profiles
      .map(
        profile =>
          `<button class="profile-card${profile.id === state.activeProfileId ? ' on' : ''}" type="button" data-profile="${esc(profile.id)}"${profile.id === state.activeProfileId ? ' aria-current="true"' : ''}>${avatarHtml(profile)}<b>${esc(profile.name)}</b>${profile.askPin ? '<small>com PIN</small>' : ''}</button>`,
      )
      .join('') +
    `<button class="profile-card add" type="button" data-add-profile="1"><span class="avatar">${icon('avPlus')}</span><b>Adicionar</b></button>`;
  $('profilesClose').hidden = profileGateActive;
  if (!$('dProfiles').open) $('dProfiles').showModal();
  const activeCard = query($('profileCards'), '.on');
  if (activeCard) activeCard.focus();
}

/**
 * Troca para um perfil, pedindo o PIN dele quando o perfil estiver protegido.
 * @param profileId Perfil escolhido.
 */
function switchProfile(profileId: string): void {
  const profile = state.profiles.find(candidate => candidate.id === profileId);
  if (!profile) return;
  const isSameProfile = profile.id === state.activeProfileId;
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
 * @param profile Perfil.
 */
function activateProfile(profile: Profile): void {
  profileGateActive = false;
  if ($('dProfiles').open) $('dProfiles').close();
  const isSameProfile = profile.id === state.activeProfileId;
  state.activeProfileId = profile.id;
  store.set('user', profile.id);
  if (isSameProfile) return;
  state.options = readOptions();
  state.unlockedCategories.clear();
  if (state.activePlaylist) loadUserData();
  showSavedTheme();
  applyVideoRatio();
  if (!$('player').hidden) closePlayer();
  renderProfileButton();
  show('home');
  toast('Olá, ' + profile.name + '!');
}
/**
 * Executa uma ação só depois do PIN do Principal. Usado para criar usuários: um perfil novo
 * começa sem bloqueios, então só quem tem o PIN do Principal pode criá-lo.
 * @param action Ação a executar após acertar o PIN.
 * @param onCancel Chamada se o pedido for cancelado.
 */
function withMainProfilePin(action: () => void, onCancel?: () => void): void {
  const mainProfile = state.profiles.find(profile => profile.id === MAIN_PROFILE_ID);
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
 * Abre as configurações já na parte de usuários.
 */
function openManageProfiles(): void {
  openSettings();
  $('profileList').scrollIntoView({ block: 'center' });
}

/**
 * Desenha a lista de perfis nas configurações (foto, nome, "Pedir PIN", Editar e Remover).
 * O Principal e o perfil ativo não podem ser removidos.
 */
export function renderProfileRows(): void {
  $('profileList').innerHTML = state.profiles
    .map(
      profile =>
        `<div class="plrow">${avatarHtml(profile)}<div><b>${esc(profile.name)}</b><small>${profile.id === state.activeProfileId ? 'Usuário atual' : profile.id === MAIN_PROFILE_ID ? 'Usuário principal' : ''}</small></div><label class="profile-pin"><input type="checkbox" data-askpin="${esc(profile.id)}" aria-label="Pedir PIN para ${esc(profile.name)}" ${profile.askPin ? 'checked' : ''}>Pedir PIN</label><button class="btn sm" type="button" data-edit-profile="${esc(profile.id)}" aria-label="Editar ${esc(profile.name)}">Editar</button>${profile.id === MAIN_PROFILE_ID || profile.id === state.activeProfileId ? '' : `<button class="btn sm danger" type="button" data-del-profile="${esc(profile.id)}" aria-label="Remover ${esc(profile.name)}">Remover</button>`}</div>`,
    )
    .join('');
}

/**
 * Executa uma ação sobre outro perfil protegido só depois do PIN dele; as configurações
 * fecham durante o pedido e reabrem depois (a não ser que a própria ação cuide disso).
 * @param profile Perfil afetado.
 * @param action Ação a executar.
 * @param actionReopensSettings A ação reabre as configurações sozinha.
 */
function withProfilePin(profile: Profile, action: () => void, actionReopensSettings?: boolean): void {
  if (!profile.askPin || profile.id === state.activeProfileId) return action();
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

/** Rascunho do perfil no editor. */
interface ProfileDraft {
  name: string;
  icon: string;
  color: number;
}

/** Edição de perfil em andamento. */
interface ProfileEdit {
  /** Perfil editado, ou `null` ao criar um novo. */
  profile: Profile | null;
  draft: ProfileDraft;
  /** Chamada ao salvar ou cancelar. */
  onDone: () => void;
}

/** Edição em andamento. */
let profileEdit: ProfileEdit | null = null;

/**
 * Abre o editor de perfil (nome, ícone e cor).
 * @param profile Perfil a editar, ou `null` para criar um novo.
 * @param onDone Chamada ao salvar ou cancelar (ex.: reabrir a tela de origem).
 */
function openProfileEditor(profile: Profile | null, onDone: () => void): void {
  const draft: ProfileDraft = profile
    ? { name: profile.name, icon: profile.icon || '', color: profileColor(profile) }
    : {
        name: '',
        icon: PROFILE_ICONS[1 + (state.profiles.length % (PROFILE_ICONS.length - 1))] ?? '',
        color: state.profiles.length % PROFILE_COLOR_COUNT,
      };
  profileEdit = { profile, draft, onDone };
  $('profileEditTitle').textContent = profile ? 'Editar usuário' : 'Novo usuário';
  $('profileEditName').value = draft.name;
  clearFormError($('profileEditError'), [$('profileEditName')]);
  renderProfileEditor();
  $('dProfileEdit').showModal();
  $('profileEditName').focus();
}

/**
 * Redesenha a prévia, os ícones e as cores do editor com a escolha atual.
 */
function renderProfileEditor(): void {
  if (!profileEdit) return;
  const draft = profileEdit.draft,
    previewDraft = { ...draft, name: draft.name || '?' };
  $('profileEditPreview').innerHTML = avatarHtml(previewDraft);
  $('profileIcons').innerHTML = PROFILE_ICONS.map(
    iconName =>
      `<button class="icon-choice${iconName === draft.icon ? ' on' : ''}" type="button" data-icon="${iconName}" aria-pressed="${iconName === draft.icon}" aria-label="${isIconName(iconName) ? (PROFILE_ICON_NAMES[iconName] ?? 'Ícone') : 'Inicial do nome'}">${avatarHtml({ ...previewDraft, icon: iconName })}</button>`,
  ).join('');
  $('profileColors').innerHTML = Array.from(
    { length: PROFILE_COLOR_COUNT },
    (_, colorIndex) =>
      `<button class="color-choice${colorIndex === draft.color ? ' on' : ''}" type="button" data-color="${colorIndex}" aria-pressed="${colorIndex === draft.color}" aria-label="${PROFILE_COLOR_NAMES[colorIndex] ?? 'Cor ' + (colorIndex + 1)}"><span class="avatar-c${colorIndex}"></span></button>`,
  ).join('');
}

/**
 * Fecha o editor e volta para a tela de origem.
 */
function closeProfileEditor(): void {
  const onDone = profileEdit && profileEdit.onDone;
  profileEdit = null;
  if ($('dProfileEdit').open) $('dProfileEdit').close();
  if (onDone) onDone();
}

/**
 * Liga os eventos desta parte do app. Chamada uma vez, na ordem de `main.ts`.
 */
export function initProfiles(): void {
  $('profileBtn').onclick = () => openProfilePicker();

  /**
   * Escolhe o perfil do cartão clicado, ou cria um novo (com o PIN do Principal).
   * @param clickEvent Evento de clique.
   */
  $('profileCards').onclick = clickEvent => {
    if (closest(clickEvent.target, '[data-add-profile]')) {
      withMainProfilePin(() => {
        const wasGateActive = profileGateActive;
        profileGateActive = false;
        $('dProfiles').close();
        openProfileEditor(null, () => openProfilePicker(wasGateActive));
      });
      return;
    }
    const profileCard = closest(clickEvent.target, '[data-profile]');
    if (profileCard) switchProfile(profileCard.dataset.profile ?? '');
  };

  /** Fecha o seletor de perfis. */
  $('profilesClose').onclick = () => $('dProfiles').close();

  /** Abre as configurações na parte de usuários. */
  $('profilesManage').onclick = () => {
    if (profileGateActive)
      return requestPin(
        state.options.pin || '0000',
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
   * Liga/desliga o "Pedir PIN" de um perfil (em outro perfil protegido, exige o PIN dele).
   * @param changeEvent Evento de mudança.
   */
  $('profileList').onchange = changeEvent => {
    const field = changeEvent.target;
    if (field instanceof HTMLInputElement && field.dataset.askpin) {
      const profile = state.profiles.find(candidate => candidate.id === field.dataset.askpin);
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
   * @param clickEvent Evento de clique.
   */
  $('profileList').onclick = clickEvent => {
    const editButton = closest(clickEvent.target, '[data-edit-profile]');
    if (editButton) {
      const profileToEdit = state.profiles.find(candidate => candidate.id === editButton.dataset.editProfile);
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
    const removeButton = closest(clickEvent.target, '[data-del-profile]');
    if (!removeButton) return;
    const profile = state.profiles.find(candidate => candidate.id === removeButton.dataset.delProfile);
    if (!profile) return;
    if (removeButton.dataset.confirm !== '1') {
      removeButton.dataset.confirm = '1';
      removeButton.textContent = 'Confirmar';
      removeButton.setAttribute(
        'aria-label',
        'Confirmar a remoção de ' + (removeButton.closest('.plrow')?.querySelector('b')?.textContent ?? 'o usuário'),
      );
      return;
    }
    withProfilePin(profile, () => {
      ['opts', 'theme', 'ratio']
        .concat(state.playlists.map(playlist => 'ux_' + playlist.id))
        .forEach(baseKey => store.del(profileKey(baseKey, profile.id)));
      state.profiles = state.profiles.filter(candidate => candidate.id !== profile.id);
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

  /**
   * Escolhe um ícone e mantém o foco nele depois de redesenhar.
   * @param clickEvent Evento de clique.
   */
  $('profileIcons').onclick = clickEvent => {
    const choice = closest(clickEvent.target, '[data-icon]');
    if (!choice || !profileEdit) return;
    profileEdit.draft.icon = choice.dataset.icon ?? '';
    renderProfileEditor();
    query($('profileIcons'), '[data-icon="' + choice.dataset.icon + '"]')?.focus();
  };

  /**
   * Escolhe uma cor e mantém o foco nela depois de redesenhar.
   * @param clickEvent Evento de clique.
   */
  $('profileColors').onclick = clickEvent => {
    const choice = closest(clickEvent.target, '[data-color]');
    if (!choice || !profileEdit) return;
    profileEdit.draft.color = Number(choice.dataset.color);
    renderProfileEditor();
    query($('profileColors'), '[data-color="' + choice.dataset.color + '"]')?.focus();
  };

  /**
   * Atualiza a prévia (inicial) enquanto o nome é digitado.
   */
  $('profileEditName').oninput = () => {
    if (!profileEdit) return;
    profileEdit.draft.name = $('profileEditName').value;
    clearFormError($('profileEditError'), [$('profileEditName')]);
    $('profileEditPreview').innerHTML = avatarHtml({ ...profileEdit.draft, name: profileEdit.draft.name || '?' });
  };

  /**
   * Enter no nome salva.
   * @param keyEvent Evento de tecla.
   */
  $('profileEditName').onkeydown = keyEvent => {
    if (keyEvent.key === 'Enter') {
      keyEvent.preventDefault();
      $('profileEditSave').click();
    }
  };

  $('profileEditForm').onsubmit = submitEvent => submitEvent.preventDefault();

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
    if (!profileEdit) return;
    const draft = profileEdit.draft,
      name = $('profileEditName').value.trim().slice(0, 24);
    if (!name) {
      showFormError($('profileEditError'), 'Digite o nome do usuário.', [$('profileEditName')]);
      return;
    }
    if (profileEdit.profile) Object.assign(profileEdit.profile, { name, icon: draft.icon, color: draft.color });
    else state.profiles.push({ id: 'u' + Date.now().toString(36), name, icon: draft.icon, color: draft.color });
    saveProfiles();
    renderProfileButton();
    toast(profileEdit.profile ? 'Usuário salvo.' : 'Usuário ' + name + ' criado.');
    closeProfileEditor();
  };

  renderProfileButton();
}
