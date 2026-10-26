'use strict';
/**
 * Seção de conteúdo da lista.
 * @typedef {'live'|'vod'|'series'} Secao
 */

/**
 * Lista IPTV cadastrada pelo usuário.
 * @typedef {Object} Playlist
 * @property {string} id Identificador único.
 * @property {string} name Nome exibido.
 * @property {'xtream'|'m3u'} type Tipo da lista.
 * @property {string} [server] Servidor Xtream (com protocolo e porta).
 * @property {string} [user] Usuário Xtream.
 * @property {string} [pass] Senha Xtream.
 * @property {string} [url] URL da lista M3U.
 * @property {string} [epg] URL do EPG XMLTV.
 */

/**
 * Categoria de uma seção.
 * @typedef {Object} Categoria
 * @property {string} id Identificador da categoria.
 * @property {string} name Nome da categoria.
 */

/**
 * Canal, filme ou série de uma seção.
 * @typedef {Object} Item
 * @property {string} k Chave única do item.
 * @property {string} name Nome exibido.
 * @property {string} [logo] URL do logo ou capa.
 * @property {string} cat Id da categoria.
 * @property {string} [url] URL direta do conteúdo (listas M3U).
 * @property {number} [num] Número do canal.
 * @property {string} [epg] Id do canal no EPG.
 * @property {number} [archive] Dias de catch-up disponíveis (0 = sem catch-up).
 * @property {string} [ext] Extensão do arquivo do filme.
 * @property {number} [rate] Avaliação.
 * @property {number} [added] Data de inclusão (timestamp).
 * @property {string} [plot] Sinopse.
 * @property {Episodio[]} [eps] Episódios (séries de listas M3U).
 */

/**
 * Episódio de uma série.
 * @typedef {Object} Episodio
 * @property {string} id Identificador do episódio.
 * @property {string} title Título.
 * @property {number} season Temporada.
 * @property {number} num Número do episódio.
 * @property {string} url URL do conteúdo.
 * @property {string} [img] Imagem do episódio.
 * @property {string} [dur] Duração formatada.
 */

/**
 * Itens e categorias de uma seção.
 * @typedef {Object} DadosSecao
 * @property {Categoria[]} cats Categorias.
 * @property {Item[]} items Itens.
 */

/**
 * Dados carregados da lista ativa.
 * @typedef {Object} DadosLista
 * @property {DadosSecao} live TV ao vivo.
 * @property {DadosSecao|null} vod Filmes (carregados sob demanda no Xtream).
 * @property {DadosSecao|null} series Séries (carregadas sob demanda no Xtream).
 * @property {Object} [info] Resposta de login do Xtream (dados da conta).
 * @property {string} [epgUrl] URL do EPG declarada no cabeçalho do M3U.
 * @property {Map<string, Programa[]>} [epg] Guia XMLTV indexado pelo id do canal.
 */

/**
 * Preferências e histórico do perfil para uma lista.
 * @typedef {Object} Ux
 * @property {{live: string[], vod: string[], series: string[]}} fav Chaves favoritas por seção.
 * @property {string[]} locked Categorias bloqueadas por PIN (`secao:id`).
 * @property {string[]} hidden Categorias ocultas (`secao:id`).
 * @property {Object[]} hist Histórico de reprodução.
 * @property {string[]} recentLive Chaves dos canais assistidos recentemente.
 */

/**
 * Perfil de usuário (sem login). Listas são compartilhadas; o resto é por perfil.
 * @typedef {Object} Perfil
 * @property {string} id Identificador (`main` = perfil Principal, que usa as chaves antigas).
 * @property {string} name Nome exibido.
 * @property {boolean} [askPin] Pedir o PIN do perfil para entrar nele.
 * @property {string} [icon] Ícone da foto de perfil (nome em `PROFILE_ICONS`; vazio = inicial).
 * @property {number} [color] Cor da foto de perfil (0 a 5).
 */

/**
 * Programa do guia de programação.
 * @typedef {Object} Programa
 * @property {number} s Início (timestamp em ms).
 * @property {number} e Fim (timestamp em ms).
 * @property {string} title Título.
 * @property {string} desc Descrição.
 * @property {string} [start] Início no formato do servidor Xtream.
 * @property {boolean} [archive] Se há gravação para catch-up.
 */

/**
 * Descrição de uma mídia sob demanda (filme ou episódio).
 * @typedef {Object} MidiaDesc
 * @property {'vod'|'series'} kind Tipo da mídia.
 * @property {string} ref Referência única no histórico.
 * @property {string} title Título exibido no player.
 * @property {string} [logo] Capa.
 * @property {string} url URL do conteúdo.
 * @property {string} [series] Referência da série (episódios).
 * @property {number} [season] Temporada (episódios).
 * @property {number} [num] Número do episódio.
 * @property {string} [epId] Id do episódio.
 */

/**
 * Contexto de reprodução de uma série, usado para navegar entre episódios.
 * @typedef {Object} CtxSerie
 * @property {Item} s Série.
 * @property {Object} info Informações da série (capa, sinopse…).
 * @property {Episodio[]} flat Todos os episódios em ordem.
 * @property {number} i Índice do episódio atual em `flat`.
 */

/**
 * Etapa de uma cadeia de tentativas de reprodução.
 * @typedef {Object} EtapaReproducao
 * @property {'hls'|'ts'|'native'} eng Motor de reprodução.
 * @property {string} url URL a tocar.
 */

/** @type {Playlist} Lista padrão com canais brasileiros gratuitos, cadastrada na primeira execução. */
const DEFAULT_PLAYLIST = { id:'br-gratis', name:'Canais abertos BR', type:'m3u' };
/** @type {Playlist[]} Listas cadastradas. */
let playlists = store.get('pls', null);
if (playlists === null) { playlists = [DEFAULT_PLAYLIST]; store.set('pls', playlists); store.set('active', DEFAULT_PLAYLIST.id); }
/** @type {string} Id do perfil Principal, dono dos dados de antes de existirem perfis. */
const MAIN_PROFILE_ID = 'main';
/** @type {Perfil[]} Perfis cadastrados. */
let profiles = store.get('users', null) || [{ id:MAIN_PROFILE_ID, name:'Principal' }];
/** @type {string} Id do perfil ativo. */
let activeProfileId = profiles.some(profile => profile.id === store.get('user', null)) ? store.get('user', null) : profiles[0].id;
/**
 * Chave de armazenamento de um dado do perfil. O Principal usa a chave antiga (sem sufixo),
 * para os dados de antes dos perfis continuarem com ele.
 * @param {string} baseKey Chave base (ex.: `opts`, `ux_<lista>`).
 * @param {string} [profileId] Perfil (padrão: o ativo).
 * @returns {string} Chave do perfil.
 */
const profileKey = (baseKey, profileId = activeProfileId) => profileId === MAIN_PROFILE_ID ? baseKey : baseKey + '@' + profileId;
/**
 * Perfil ativo.
 * @returns {Perfil} Perfil.
 */
const activeProfile = () => profiles.find(profile => profile.id === activeProfileId);
/**
 * Salva a lista de perfis.
 * @returns {boolean} `true` se salvou.
 */
const saveProfiles = () => store.set('users', profiles);
/**
 * Lê as opções de um perfil (formato ao vivo, próximo episódio automático, PIN).
 * @param {string} [profileId] Perfil (padrão: o ativo).
 * @returns {{fmt: string, auto: string, pin: string}} Opções.
 */
const readOptions = profileId => Object.assign({ fmt:'m3u8', auto:'1', pin:'0000' }, store.get(profileKey('opts', profileId), {}));
/** @type {{fmt: string, auto: string, pin: string}} Opções do perfil ativo. */
let options = readOptions();
/**
 * Salva as opções do perfil ativo.
 * @returns {boolean} `true` se salvou.
 */
const saveOptions = () => store.set(profileKey('opts'), options);
/** @type {Playlist|null} Lista ativa. */
let activePlaylist = null;
/** @type {DadosLista|null} Dados carregados da lista ativa. */
let catalog = null;
/** @type {Ux|null} Preferências e histórico da lista ativa no perfil ativo. */
let userData = null;
/** @type {Secao} Seção aberta na tela de seção. */
let currentSection = 'live';
/** @type {string} Categoria selecionada (`*` = todas). */
let currentCategory = '*';
/** @type {number} Quantidade de itens exibidos na grade (cresce ao rolar). */
let visibleItemCount = 200;
/** @type {Set<string>} Categorias desbloqueadas com o PIN nesta sessão. */
let unlockedCategories = new Set();
/** @type {string} Última mensagem de erro de carregamento. */
let lastError = '';

/**
 * Chave de armazenamento das preferências da lista ativa no perfil ativo.
 * @returns {string} Chave no formato `ux_<id>` (Principal) ou `ux_<id>@<perfil>`.
 */
const userDataKey = () => profileKey('ux_' + activePlaylist.id);
/**
 * Carrega as preferências e o histórico da lista ativa em `userData`.
 * @returns {void}
 */
function loadUserData(){ userData = Object.assign({ fav:{live:[],vod:[],series:[]}, locked:[], hidden:[], hist:[], recentLive:[] }, store.get(userDataKey(), {})); }
/**
 * Salva `userData` no armazenamento local.
 * @returns {boolean} `true` se salvou.
 */
const saveUserData = () => store.set(userDataKey(), userData);
/**
 * Indica se um item é favorito.
 * @param {Secao} section Seção.
 * @param {string|number} itemKey Chave do item.
 * @returns {boolean} `true` se for favorito.
 */
const isFav = (section, itemKey) => userData.fav[section].includes(String(itemKey));
/**
 * Alterna o favorito de um item e salva.
 * @param {Secao} section Seção.
 * @param {string|number} itemKey Chave do item.
 * @returns {boolean} `true` se passou a ser favorito.
 */
function toggleFav(section, itemKey){ const favoriteKey = String(itemKey); const favoriteKeys = userData.fav[section]; const favoriteIndex = favoriteKeys.indexOf(favoriteKey); favoriteIndex < 0 ? favoriteKeys.unshift(favoriteKey) : favoriteKeys.splice(favoriteIndex,1); saveUserData(); return favoriteIndex < 0; }
/**
 * Remove um filme ou episódio do "Continuar assistindo" e salva. O progresso de cada
 * episódio (registros ocultos) é mantido para as barras da lista de episódios.
 * @param {string} historyRef Referência do registro no histórico.
 * @returns {void}
 */
function removeHistoryEntry(historyRef){ userData.hist = userData.hist.filter(entry => entry.hidden || entry.ref !== historyRef); saveUserData(); }
/**
 * Remove um canal dos recentes e salva.
 * @param {string|number} channelKey Chave do canal.
 * @returns {void}
 */
function removeRecentChannel(channelKey){ const recentKey = String(channelKey); userData.recentLive = userData.recentLive.filter(otherKey => otherKey !== recentKey); saveUserData(); }
