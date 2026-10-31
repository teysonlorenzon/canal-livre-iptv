import { parseOptions, parsePlaylists, parseProfiles, parseUserData } from './saved-data';
import type { Catalog, Item, M3uPlaylist, PlayerOptions, Playlist, Profile, SectionName, UserData } from './types';
import { store } from './utils';

/** Lista padrão com canais brasileiros gratuitos, cadastrada na primeira execução. */
export const DEFAULT_PLAYLIST: M3uPlaylist = { id: 'br-gratis', name: 'Canais abertos BR', type: 'm3u' };

/** Id do perfil Principal, dono dos dados de antes de existirem perfis. */
export const MAIN_PROFILE_ID = 'main';

/** Perfil Principal de quem nunca criou um perfil. */
const MAIN_PROFILE: Profile = { id: MAIN_PROFILE_ID, name: 'Principal' };

/**
 * Chave de armazenamento de um dado do perfil. O Principal usa a chave antiga (sem sufixo),
 * para os dados de antes dos perfis continuarem com ele.
 * @param baseKey Chave base (ex.: `opts`, `ux_<lista>`).
 * @param profileId Perfil (padrão: o ativo).
 * @returns Chave do perfil.
 */
export function profileKey(baseKey: string, profileId: string = state.activeProfileId): string {
  return profileId === MAIN_PROFILE_ID ? baseKey : baseKey + '@' + profileId;
}

/**
 * Lê as opções de um perfil (formato ao vivo, próximo episódio automático, PIN).
 * @param profileId Perfil (padrão: o ativo).
 * @returns Opções.
 */
export function readOptions(profileId?: string): PlayerOptions {
  return parseOptions(store.get(profileKey('opts', profileId)));
}

/**
 * Listas cadastradas; na primeira execução, cadastra a lista padrão.
 * @returns Listas.
 */
function loadPlaylists(): Playlist[] {
  const savedPlaylists = store.get('pls');
  if (savedPlaylists !== null) return parsePlaylists(savedPlaylists);
  store.set('pls', [DEFAULT_PLAYLIST]);
  store.set('active', DEFAULT_PLAYLIST.id);
  return [DEFAULT_PLAYLIST];
}

/**
 * Preferências vazias, usadas enquanto nenhuma lista está aberta.
 * @returns Preferências e histórico vazios.
 */
const emptyUserData = (): UserData => parseUserData(null);

const savedProfiles = parseProfiles(store.get('users'));
const initialProfiles = savedProfiles.length ? savedProfiles : [MAIN_PROFILE];
const initialProfileId = store.getText('user');
const initialActiveProfileId =
  initialProfiles.find(profile => profile.id === initialProfileId)?.id ?? initialProfiles[0]?.id ?? MAIN_PROFILE_ID;

/** Estado do app compartilhado entre as funcionalidades. */
export interface AppState {
  /** Listas cadastradas. */
  playlists: Playlist[];
  /** Perfis cadastrados. */
  profiles: Profile[];
  /** Id do perfil ativo. */
  activeProfileId: string;
  /** Opções do perfil ativo. */
  options: PlayerOptions;
  /** Lista ativa. */
  activePlaylist: Playlist | null;
  /** Dados carregados da lista ativa. */
  catalog: Catalog | null;
  /** Preferências e histórico da lista ativa no perfil ativo. */
  userData: UserData;
  /** Seção aberta na tela de seção. */
  currentSection: SectionName;
  /** Categoria selecionada (`*` = todas). */
  currentCategory: string;
  /** Quantidade de itens exibidos na grade (cresce ao rolar). */
  visibleItemCount: number;
  /** Itens listados na tela de seção, na ordem exibida. */
  listedItems: Item[];
  /** Categorias desbloqueadas com o PIN nesta sessão. */
  unlockedCategories: Set<string>;
  /** Última mensagem de erro de carregamento. */
  lastError: string;
}

export const state: AppState = {
  playlists: loadPlaylists(),
  profiles: initialProfiles,
  activeProfileId: initialActiveProfileId,
  options: readOptions(initialActiveProfileId),
  activePlaylist: null,
  catalog: null,
  userData: emptyUserData(),
  currentSection: 'live',
  currentCategory: '*',
  visibleItemCount: 200,
  listedItems: [],
  unlockedCategories: new Set(),
  lastError: '',
};

/**
 * Dados da lista ativa, para funções que só rodam com uma lista carregada.
 * @returns Dados da lista.
 * @throws Se nenhuma lista estiver carregada.
 */
export function activeCatalog(): Catalog {
  if (!state.catalog) throw new Error('Nenhuma lista carregada.');
  return state.catalog;
}

/**
 * Perfil ativo.
 * @returns Perfil.
 */
export const activeProfile = (): Profile => state.profiles.find(profile => profile.id === state.activeProfileId) ?? MAIN_PROFILE;

/**
 * Salva a lista de perfis.
 * @returns `true` se salvou.
 */
export const saveProfiles = (): boolean => store.set('users', state.profiles);

/**
 * Salva as opções do perfil ativo.
 * @returns `true` se salvou.
 */
export const saveOptions = (): boolean => store.set(profileKey('opts'), state.options);

/**
 * Chave de armazenamento das preferências da lista ativa no perfil ativo.
 * @returns Chave no formato `ux_<id>` (Principal) ou `ux_<id>@<perfil>`, ou `null` sem lista ativa.
 */
const userDataKey = (): string | null => (state.activePlaylist ? profileKey('ux_' + state.activePlaylist.id) : null);

/**
 * Carrega as preferências e o histórico da lista ativa em `state.userData`.
 */
export function loadUserData(): void {
  const storageKey = userDataKey();
  state.userData = parseUserData(storageKey ? store.get(storageKey) : null);
}

/**
 * Salva `state.userData` no armazenamento local.
 * @returns `true` se salvou.
 */
export function saveUserData(): boolean {
  const storageKey = userDataKey();
  return storageKey ? store.set(storageKey, state.userData) : false;
}

/**
 * Indica se um item é favorito.
 * @param section Seção.
 * @param itemKey Chave do item.
 * @returns `true` se for favorito.
 */
export const isFav = (section: SectionName, itemKey: string): boolean => state.userData.fav[section].includes(String(itemKey));

/**
 * Alterna o favorito de um item e salva.
 * @param section Seção.
 * @param itemKey Chave do item.
 * @returns `true` se passou a ser favorito.
 */
export function toggleFav(section: SectionName, itemKey: string): boolean {
  const favoriteKey = String(itemKey);
  const favoriteKeys = state.userData.fav[section];
  const favoriteIndex = favoriteKeys.indexOf(favoriteKey);
  if (favoriteIndex < 0) favoriteKeys.unshift(favoriteKey);
  else favoriteKeys.splice(favoriteIndex, 1);
  saveUserData();
  return favoriteIndex < 0;
}

/**
 * Remove um filme ou episódio do "Continuar assistindo" e salva. O progresso de cada
 * episódio (registros ocultos) é mantido para as barras da lista de episódios.
 * @param historyRef Referência do registro no histórico.
 */
export function removeHistoryEntry(historyRef: string): void {
  state.userData.hist = state.userData.hist.filter(entry => entry.hidden || entry.ref !== historyRef);
  saveUserData();
}

/**
 * Remove um canal dos recentes e salva.
 * @param channelKey Chave do canal.
 */
export function removeRecentChannel(channelKey: string): void {
  const recentKey = String(channelKey);
  state.userData.recentLive = state.userData.recentLive.filter(otherKey => otherKey !== recentKey);
  saveUserData();
}
