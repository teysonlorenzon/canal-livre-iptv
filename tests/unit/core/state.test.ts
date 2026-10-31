import { preparePage, readStorage } from '../support/boot';
import { catalog, historyEntry, userData } from '../support/fixtures';

type StateModule = typeof import('../../../src/core/state');

/**
 * Carrega o módulo de estado numa página limpa.
 * @param storage Dados salvos.
 * @returns Módulo.
 */
async function loadState(storage: Record<string, unknown> = {}): Promise<StateModule> {
  preparePage({ storage });
  return import('../../../src/core/state');
}

describe('estado do app', () => {
  describe('primeira execução', () => {
    it('cadastra a lista padrão', async () => {
      const { state, DEFAULT_PLAYLIST } = await loadState();
      expect(state.playlists).toEqual([DEFAULT_PLAYLIST]);
      expect(readStorage('pls')).toEqual([DEFAULT_PLAYLIST]);
      expect(readStorage('active')).toBe(DEFAULT_PLAYLIST.id);
      expect(state.profiles).toEqual([{ id: 'main', name: 'Principal' }]);
      expect(state.activeProfileId).toBe('main');
      expect(state.options).toEqual({ fmt: 'm3u8', auto: '1', pin: '0000' });
    });
  });

  describe('dados salvos', () => {
    it('respeita as listas salvas, mesmo vazias', async () => {
      const { state } = await loadState({ pls: [] });
      expect(state.playlists).toEqual([]);
      expect(readStorage('active')).toBeNull();
    });

    it('usa o perfil salvo e as opções dele', async () => {
      const { state } = await loadState({
        users: [
          { id: 'main', name: 'Principal' },
          { id: 'u1', name: 'Outro' },
        ],
        user: 'u1',
        'opts@u1': { pin: '4321' },
      });
      expect(state.activeProfileId).toBe('u1');
      expect(state.options.pin).toBe('4321');
    });

    it('volta para o primeiro perfil se o salvo não existir', async () => {
      const { state } = await loadState({ users: [{ id: 'u2', name: 'Dois' }], user: 'u9' });
      expect(state.activeProfileId).toBe('u2');
    });

    it('recria o Principal se a lista de perfis estiver vazia', async () => {
      const { state, activeProfile } = await loadState({ users: [] });
      expect(state.activeProfileId).toBe('main');
      expect(activeProfile().name).toBe('Principal');
    });
  });

  describe('chaves por perfil', () => {
    it('o Principal usa a chave antiga e os outros levam o sufixo', async () => {
      const { profileKey, state } = await loadState();
      expect(profileKey('opts')).toBe('opts');
      expect(profileKey('opts', 'u1')).toBe('opts@u1');
      state.activeProfileId = 'u2';
      expect(profileKey('opts')).toBe('opts@u2');
    });

    it('activeProfile usa o Principal se o ativo sumir', async () => {
      const { activeProfile, state } = await loadState();
      state.activeProfileId = 'inexistente';
      expect(activeProfile().id).toBe('main');
    });
  });

  describe('salvamentos', () => {
    it('salva perfis e opções', async () => {
      const { saveOptions, saveProfiles, state } = await loadState();
      state.options.pin = '9999';
      state.profiles.push({ id: 'u1', name: 'Novo' });
      saveOptions();
      saveProfiles();
      expect(readStorage('opts')).toMatchObject({ pin: '9999' });
      expect(readStorage('users')).toHaveLength(2);
    });

    it('não salva preferências sem lista ativa', async () => {
      const { saveUserData } = await loadState();
      expect(saveUserData()).toBe(false);
    });

    it('carrega e salva as preferências da lista ativa', async () => {
      const { loadUserData, saveUserData, state } = await loadState({ ux_l1: userData({ locked: ['vod:1'] }) });
      state.activePlaylist = { id: 'l1', name: 'L', type: 'm3u' };
      loadUserData();
      expect(state.userData.locked).toEqual(['vod:1']);
      state.userData.hidden.push('live:1');
      saveUserData();
      expect(readStorage('ux_l1')).toMatchObject({ hidden: ['live:1'] });
    });

    it('carrega preferências vazias sem lista ativa', async () => {
      const { loadUserData, state } = await loadState();
      loadUserData();
      expect(state.userData.hist).toEqual([]);
    });
  });

  describe('catálogo ativo', () => {
    it('falha sem lista carregada', async () => {
      const { activeCatalog, state } = await loadState();
      expect(() => activeCatalog()).toThrow('Nenhuma lista carregada.');
      state.catalog = catalog();
      expect(activeCatalog()).toBe(state.catalog);
    });
  });

  describe('favoritos e histórico', () => {
    it('alterna favoritos', async () => {
      const { isFav, state, toggleFav } = await loadState();
      state.activePlaylist = { id: 'l1', name: 'L', type: 'm3u' };
      expect(toggleFav('live', 'c1')).toBe(true);
      expect(isFav('live', 'c1')).toBe(true);
      expect(toggleFav('live', 'c1')).toBe(false);
      expect(isFav('live', 'c1')).toBe(false);
    });

    it('remove do histórico mantendo o progresso oculto', async () => {
      const { removeHistoryEntry, state } = await loadState();
      state.activePlaylist = { id: 'l1', name: 'L', type: 'm3u' };
      state.userData.hist = [historyEntry({ ref: 'ep:1' }), historyEntry({ ref: 'ep:1', hidden: true }), historyEntry({ ref: 'vod:2' })];
      removeHistoryEntry('ep:1');
      expect(state.userData.hist.map(entry => [entry.ref, entry.hidden])).toEqual([
        ['ep:1', true],
        ['vod:2', undefined],
      ]);
    });

    it('remove canais recentes', async () => {
      const { removeRecentChannel, state } = await loadState();
      state.activePlaylist = { id: 'l1', name: 'L', type: 'm3u' };
      state.userData.recentLive = ['c1', 'c2'];
      removeRecentChannel('c1');
      expect(state.userData.recentLive).toEqual(['c2']);
    });
  });
});
