import {
  advance,
  bootApp,
  element,
  fire,
  flush,
  inputField,
  openCatalog,
  pressKey,
  readStorage,
  seedStorage,
  selectField,
} from '../support/boot';
import { catalog, userData } from '../support/fixtures';

const TWO_PROFILES = [
  { id: 'main', name: 'Principal' },
  { id: 'u1', name: 'Ana', icon: 'star', color: 2 },
];
const WITH_PIN = [
  { id: 'main', name: 'Principal' },
  { id: 'u1', name: 'Ana', askPin: true },
];

/**
 * Digita no diálogo de PIN e confirma.
 * @param pin PIN.
 */
function typePin(pin: string): void {
  inputField('#pinIn').value = pin;
  element('#pinOk').click();
}

/**
 * Abre o seletor de perfis pelo botão do topo.
 */
const openPicker = (): void => element('#profileBtn').click();

/**
 * Escolhe um perfil na tela "Quem está assistindo?".
 * @param id Id do perfil.
 */
const pickProfile = (id: string): void => element(`[data-profile="${id}"]`).click();

/**
 * Abre o editor de um perfil novo, pelas configurações.
 * @returns Promessa concluída com o editor aberto.
 */
async function openNewProfileEditor(): Promise<void> {
  element('#openSettings').click();
  element('#profileAdd').click();
  await flush();
  typePin('0000');
  await flush();
}

describe('perfis', () => {
  describe('botão do topo', () => {
    it('mostra o perfil ativo', async () => {
      await bootApp({ storage: { users: TWO_PROFILES, user: 'u1' } });
      expect(element('#profileBtn').title).toBe('Usuário: Ana');
      expect(element('#profileBtn').getAttribute('aria-label')).toBe('Usuário: Ana');
      expect(element('#profileBtn .avatar').classList.contains('avatar-c2')).toBe(true);
      expect(document.querySelector('#profileBtn svg')).not.toBeNull();
      expect(element('#parentalTitle').textContent).toBe('Controle parental — Ana');
      expect(element('#clearHist').textContent).toBe('Limpar histórico de Ana');
    });

    it('com um perfil só usa os textos simples e a inicial', async () => {
      await bootApp();
      expect(element('#parentalTitle').textContent).toBe('Controle parental');
      expect(element('#clearHist').textContent).toBe('Limpar histórico');
      expect(element('#profileBtn .avatar').textContent).toBe('P');
      expect(element('#profileBtn .avatar').classList.contains('avatar-c0')).toBe(true);
    });
  });

  describe('seletor', () => {
    it('com vários perfis abre sozinho na abertura', async () => {
      await bootApp({ storage: { users: TWO_PROFILES } });
      expect(element('#dProfiles').hasAttribute('open')).toBe(true);
      expect(element('#profileCards').textContent).toContain('Ana');
      expect(document.activeElement).toBe(element('[data-profile="main"]'));
      expect(element('#profilesClose').hidden).toBe(false);
    });

    it('mostra quem pede PIN', async () => {
      await bootApp({ storage: { users: WITH_PIN } });
      expect(element('[data-profile="u1"]').textContent).toContain('com PIN');
    });

    it('não reabre um seletor já aberto', async () => {
      await bootApp({ storage: { users: TWO_PROFILES } });
      const showModal = jest.spyOn(HTMLDialogElement.prototype, 'showModal');
      openPicker();
      expect(showModal).not.toHaveBeenCalled();
      showModal.mockRestore();
    });

    it('sem perfil ativo na lista não foca nada', async () => {
      const app = await bootApp({ storage: { users: TWO_PROFILES } });
      element('#profilesClose').click();
      app.state.state.activeProfileId = 'outro';
      expect(() => openPicker()).not.toThrow();
    });

    it('escolher o mesmo perfil só fecha', async () => {
      await bootApp({ storage: { users: TWO_PROFILES } });
      pickProfile('main');
      expect(element('#dProfiles').hasAttribute('open')).toBe(false);
      expect(element('#toast').textContent).toBe('');
    });

    it('ignora perfil inexistente e cliques fora dos cartões', async () => {
      await bootApp({ storage: { users: TWO_PROFILES } });
      element('#profileCards').click();
      element('[data-profile="u1"]').dataset.profile = 'sumiu';
      pickProfile('sumiu');
      expect(element('#dProfiles').hasAttribute('open')).toBe(true);
      delete element('[data-profile="sumiu"]').dataset.profile;
    });

    it('fecha pelo botão', async () => {
      await bootApp({ storage: { users: TWO_PROFILES } });
      element('#profilesClose').click();
      expect(element('#dProfiles').hasAttribute('open')).toBe(false);
    });
  });

  describe('troca de perfil', () => {
    it('carrega as preferências, o tema e a proporção do perfil', async () => {
      const app = await bootApp({ storage: { users: TWO_PROFILES, 'theme@u1': 'dark', 'ratio@u1': 'cover', 'opts@u1': { pin: '7777' } } });
      openCatalog(app, catalog(), userData());
      seedStorage({ 'ux_l1@u1': { recentLive: ['c2'] } });
      pickProfile('u1');
      expect(app.state.state.activeProfileId).toBe('u1');
      expect(readStorage('user')).toBe('u1');
      expect(app.state.state.options.pin).toBe('7777');
      expect(app.state.state.userData.recentLive).toEqual(['c2']);
      expect(document.documentElement.dataset.theme).toBe('dark');
      expect(selectField('#cRatio').value).toBe('cover');
      expect(element('#toast').textContent).toBe('Olá, Ana!');
      expect(element('#profileBtn').title).toBe('Usuário: Ana');
    });

    it('fecha o player ao trocar', async () => {
      const app = await bootApp({ storage: { users: TWO_PROFILES } });
      openCatalog(app, catalog(), userData());
      app.player.playLive(app.state.state.catalog?.live.items[0]);
      pickProfile('u1');
      expect(element('#player').hidden).toBe(true);
    });

    it('sem lista aberta também troca', async () => {
      const app = await bootApp({ storage: { users: TWO_PROFILES, pls: [] } });
      pickProfile('u1');
      expect(app.state.state.activeProfileId).toBe('u1');
    });

    it('perfil protegido pede o PIN dele', async () => {
      const app = await bootApp({ storage: { users: WITH_PIN, 'opts@u1': { pin: '4321' } } });
      pickProfile('u1');
      expect(element('#pinHint').textContent).toBe('Digite o PIN de Ana.');
      typePin('0000');
      expect(app.state.state.activeProfileId).toBe('main');
      typePin('4321');
      expect(app.state.state.activeProfileId).toBe('u1');
    });
  });

  describe('trava na abertura', () => {
    const STORAGE = {
      users: [
        { id: 'main', name: 'Principal', askPin: true },
        { id: 'u1', name: 'Ana' },
      ],
    };

    it('o perfil protegido trava o seletor', async () => {
      await bootApp({ storage: STORAGE });
      expect(element('#profilesClose').hidden).toBe(true);
      element('#dProfiles').removeAttribute('open');
      await flush();
      expect(element('#dProfiles').hasAttribute('open')).toBe(true);
    });

    it('escolher o mesmo perfil pede o PIN', async () => {
      const app = await bootApp({ storage: STORAGE });
      pickProfile('main');
      typePin('0000');
      expect(element('#dProfiles').hasAttribute('open')).toBe(false);
      expect(app.state.state.activeProfileId).toBe('main');
      expect(element('#toast').textContent).toBe('');
    });

    it('Gerenciar usuários pede o PIN do perfil', async () => {
      await bootApp({ storage: STORAGE });
      element('#profilesManage').click();
      expect(element('#pinHint').textContent).toBe('Digite o PIN de Principal.');
      typePin('0000');
      expect(element('#dSettings').hasAttribute('open')).toBe(true);
    });

    it('Adicionar destrava e, ao cancelar, volta a travar', async () => {
      await bootApp({ storage: STORAGE });
      element('[data-add-profile]').click();
      typePin('0000');
      await flush();
      expect(element('#dProfileEdit').hasAttribute('open')).toBe(true);
      element('#profileEditCancel').click();
      await flush();
      expect(element('#dProfiles').hasAttribute('open')).toBe(true);
      expect(element('#profilesClose').hidden).toBe(true);
    });
  });

  describe('gerenciamento', () => {
    it('Gerenciar usuários leva às configurações', async () => {
      await bootApp({ storage: { users: TWO_PROFILES } });
      element('#profilesManage').click();
      expect(element('#dProfiles').hasAttribute('open')).toBe(false);
      expect(element('#dSettings').hasAttribute('open')).toBe(true);
      expect(element('#profileList').scrollIntoView).toHaveBeenCalled();
    });

    it('lista os perfis com as ações certas', async () => {
      await bootApp({
        storage: {
          users: [
            { id: 'main', name: 'Principal' },
            { id: 'u1', name: 'Ana', askPin: true },
            { id: 'u2', name: 'Bia' },
          ],
          user: 'u2',
        },
      });
      element('#profilesClose').click();
      element('#openSettings').click();
      const rows = document.querySelectorAll('#profileList .plrow');
      expect(rows[0]?.textContent).toContain('Usuário principal');
      expect(rows[2]?.textContent).toContain('Usuário atual');
      expect(rows[0]?.querySelector('[data-del-profile]')).toBeNull();
      expect(rows[1]?.querySelector('[data-del-profile]')).not.toBeNull();
      expect(rows[2]?.querySelector('[data-del-profile]')).toBeNull();
      expect(inputField('#profileList .plrow:nth-child(2) [data-askpin]').checked).toBe(true);
    });

    it('liga o Pedir PIN e avisa do PIN padrão', async () => {
      const app = await bootApp();
      element('#openSettings').click();
      const askPin = inputField('[data-askpin="main"]');
      askPin.checked = true;
      fire(askPin, 'change');
      expect(app.state.state.profiles[0]?.askPin).toBe(true);
      expect(element('#toast').textContent).toBe('Atenção: o PIN de Principal ainda é o padrão 0000.');
    });

    it('sem PIN padrão não avisa, e desligar também salva', async () => {
      const app = await bootApp({ storage: { opts: { pin: '1234' } } });
      element('#openSettings').click();
      const askPin = inputField('[data-askpin="main"]');
      askPin.checked = true;
      fire(askPin, 'change');
      expect(element('#toast').textContent).toBe('');
      const refreshedAskPin = inputField('[data-askpin="main"]');
      refreshedAskPin.checked = false;
      fire(refreshedAskPin, 'change');
      expect(app.state.state.profiles[0]?.askPin).toBe(false);
    });

    it('mudar outro perfil protegido exige o PIN dele e reabre as configurações', async () => {
      const app = await bootApp({ storage: { users: WITH_PIN, 'opts@u1': { pin: '4321' } } });
      element('#profilesClose').click();
      element('#openSettings').click();
      const askPin = inputField('[data-askpin="u1"]');
      askPin.checked = false;
      fire(askPin, 'change');
      expect(element('#dSettings').hasAttribute('open')).toBe(false);
      typePin('4321');
      expect(app.state.state.profiles[1]?.askPin).toBe(false);
      expect(element('#dSettings').hasAttribute('open')).toBe(true);
    });

    it('cancelar o PIN reabre as configurações sem mudar nada', async () => {
      const app = await bootApp({ storage: { users: WITH_PIN } });
      element('#profilesClose').click();
      element('#openSettings').click();
      const askPin = inputField('[data-askpin="u1"]');
      askPin.checked = false;
      fire(askPin, 'change');
      element('#pinCancel').click();
      await flush();
      expect(app.state.state.profiles[1]?.askPin).toBe(true);
      expect(element('#dSettings').hasAttribute('open')).toBe(true);
    });

    it('ignora outras mudanças e perfil inexistente', async () => {
      await bootApp();
      element('#openSettings').click();
      fire(element('#profileList'), 'change');
      const askPin = element('[data-askpin="main"]');
      askPin.dataset.askpin = 'sumiu';
      fire(askPin, 'change');
      delete askPin.dataset.askpin;
      fire(askPin, 'change');
      expect(element('#toast').textContent).toBe('');
    });

    it('remover pede confirmação e apaga os dados do perfil', async () => {
      const app = await bootApp({
        storage: {
          users: TWO_PROFILES,
          pls: [{ id: 'l1', name: 'L', type: 'm3u' }],
          'opts@u1': {},
          'theme@u1': 'dark',
          'ratio@u1': 'fill',
          'ux_l1@u1': {},
        },
      });
      element('#profilesClose').click();
      element('#openSettings').click();
      const removeButton = element('[data-del-profile="u1"]');
      removeButton.click();
      expect(removeButton.textContent).toBe('Confirmar');
      expect(app.state.state.profiles).toHaveLength(2);
      removeButton.click();
      expect(app.state.state.profiles).toHaveLength(1);
      expect(readStorage('opts@u1')).toBeNull();
      expect(readStorage('theme@u1')).toBeNull();
      expect(readStorage('ratio@u1')).toBeNull();
      expect(readStorage('ux_l1@u1')).toBeNull();
      expect(element('#toast').textContent).toBe('Usuário Ana removido.');
    });

    it('ignora cliques sem ação e perfis inexistentes', async () => {
      const app = await bootApp({ storage: { users: TWO_PROFILES } });
      element('#profilesClose').click();
      element('#openSettings').click();
      element('#profileList').click();
      const removeButton = element('[data-del-profile="u1"]');
      removeButton.dataset.delProfile = 'sumiu';
      removeButton.click();
      const editButton = element('[data-edit-profile="u1"]');
      editButton.dataset.editProfile = 'sumiu';
      editButton.click();
      expect(app.state.state.profiles).toHaveLength(2);
      expect(element('#dProfileEdit').hasAttribute('open')).toBe(false);
    });
  });

  describe('editor', () => {
    it('cria um perfil novo depois do PIN do Principal', async () => {
      const app = await bootApp();
      element('#openSettings').click();
      element('#profileAdd').click();
      expect(element('#pinTitle').textContent).toBe('Criar usuário');
      expect(element('#pinHint').textContent).toContain('digite o PIN de Principal.');
      typePin('0000');
      await flush();
      expect(element('#profileEditTitle').textContent).toBe('Novo usuário');
      expect(document.activeElement).toBe(element('#profileEditName'));
      inputField('#profileEditName').value = '  Bia  ';
      element('#profileEditSave').click();
      await flush();
      expect(app.state.state.profiles).toHaveLength(2);
      expect(readStorage('users')).toHaveLength(2);
      expect(element('#toast').textContent).toBe('Usuário Bia criado.');
      expect(element('#dSettings').hasAttribute('open')).toBe(true);
    });

    it('cancelar o PIN volta às configurações', async () => {
      await bootApp();
      element('#openSettings').click();
      element('#profileAdd').click();
      element('#pinCancel').click();
      await flush();
      expect(element('#dSettings').hasAttribute('open')).toBe(true);
      expect(element('#dProfileEdit').hasAttribute('open')).toBe(false);
    });

    it('sem o Principal na lista usa o nome padrão no pedido de PIN', async () => {
      await bootApp({ storage: { users: [{ id: 'u1', name: 'Ana' }] } });
      element('#openSettings').click();
      element('#profileAdd').click();
      expect(element('#pinHint').textContent).toContain('digite o PIN de Principal.');
    });

    it('edita um perfil, com prévia, ícone e cor', async () => {
      const app = await bootApp({ storage: { users: TWO_PROFILES } });
      element('#profilesClose').click();
      element('#openSettings').click();
      element('[data-edit-profile="u1"]').click();
      await flush();
      expect(element('#profileEditTitle').textContent).toBe('Editar usuário');
      expect(inputField('#profileEditName').value).toBe('Ana');
      expect(element('.icon-choice[data-icon="star"]').classList.contains('on')).toBe(true);
      expect(element('[data-color="2"]').classList.contains('on')).toBe(true);
      element('[data-icon="avCat"]').click();
      expect(element('[data-icon="avCat"]').classList.contains('on')).toBe(true);
      expect(document.activeElement).toBe(element('[data-icon="avCat"]'));
      element('[data-color="4"]').click();
      expect(document.activeElement).toBe(element('[data-color="4"]'));
      element('#profileIcons').click();
      element('#profileColors').click();
      const nameField = inputField('#profileEditName');
      nameField.value = 'Nova';
      fire(nameField, 'input');
      nameField.oninput?.(new InputEvent('input'));
      element('#profileEditSave').click();
      await flush();
      expect(app.state.state.profiles[1]).toMatchObject({ name: 'Nova', icon: 'avCat', color: 4 });
      expect(element('#toast').textContent).toBe('Usuário salvo.');
    });

    it('perfil sem cor usa a da posição', async () => {
      const app = await bootApp({
        storage: {
          users: [
            { id: 'main', name: 'Principal' },
            { id: 'u1', name: 'Ana' },
          ],
        },
      });
      element('#profilesClose').click();
      element('#openSettings').click();
      element('[data-edit-profile="u1"]').click();
      expect(element('[data-color="1"]').classList.contains('on')).toBe(true);
      expect(app.state.state.profiles[1]?.color).toBeUndefined();
    });

    it('o ícone sem escolha usa a inicial', async () => {
      await bootApp();
      await openNewProfileEditor();
      element('[data-icon=""]').click();
      expect(element('#profileEditPreview .avatar').textContent).toBe('?');
    });

    it('exige o nome', async () => {
      await bootApp();
      await openNewProfileEditor();
      element('#profileEditSave').click();
      expect(element('#toast').textContent).toBe('Digite o nome do usuário.');
      expect(element('#dProfileEdit').hasAttribute('open')).toBe(true);
    });

    it('Enter no nome salva e outras teclas não', async () => {
      const app = await bootApp();
      await openNewProfileEditor();
      const nameField = inputField('#profileEditName');
      nameField.value = 'Bia';
      pressKey(nameField, 'a');
      expect(app.state.state.profiles).toHaveLength(1);
      expect(pressKey(nameField, 'Enter').defaultPrevented).toBe(true);
      expect(app.state.state.profiles).toHaveLength(2);
    });

    it('o formulário não recarrega a página', async () => {
      await bootApp();
      await openNewProfileEditor();
      const submitEvent = new Event('submit', { cancelable: true });
      element('#profileEditForm').dispatchEvent(submitEvent);
      expect(submitEvent.defaultPrevented).toBe(true);
    });

    it('fechar com Esc equivale a cancelar', async () => {
      const app = await bootApp();
      await openNewProfileEditor();
      const dialog = element('#dProfileEdit');
      dialog.removeAttribute('open');
      await flush();
      expect(element('#dSettings').hasAttribute('open')).toBe(true);
      expect(app.state.state.profiles).toHaveLength(1);
    });

    it('editar outro perfil protegido exige o PIN dele', async () => {
      await bootApp({ storage: { users: WITH_PIN } });
      element('#profilesClose').click();
      element('#openSettings').click();
      element('[data-edit-profile="u1"]').click();
      expect(element('#dPin').hasAttribute('open')).toBe(true);
      typePin('0000');
      await flush();
      expect(element('#dProfileEdit').hasAttribute('open')).toBe(true);
      element('#profileEditCancel').click();
      await flush();
      expect(element('#dSettings').hasAttribute('open')).toBe(true);
    });

    it('fechar o editor sem edição em andamento é seguro', async () => {
      await bootApp();
      await openNewProfileEditor();
      element('#profileEditCancel').click();
      await flush();
      element('#dProfileEdit').setAttribute('open', '');
      element('#dProfileEdit').removeAttribute('open');
      await advance(10);
      expect(element('#dProfileEdit').hasAttribute('open')).toBe(false);
    });

    it('eventos do editor sem edição em andamento são ignorados', async () => {
      await bootApp();
      const editorRoot = element('#dProfileEdit');
      editorRoot.setAttribute('open', '');
      element('#profileIcons').innerHTML = '<button data-icon="star"></button>';
      element('#profileColors').innerHTML = '<button data-color="1"></button>';
      element('#profileIcons button').click();
      element('#profileColors button').click();
      element('#profileEditSave').click();
      fire(element('#profileEditName'), 'input');
      expect(element('#profileEditPreview').innerHTML).toBe('');
    });
  });
});
