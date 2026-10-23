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
 * Preferências e histórico do usuário para uma lista.
 * @typedef {Object} Ux
 * @property {{live: string[], vod: string[], series: string[]}} fav Chaves favoritas por seção.
 * @property {string[]} locked Categorias bloqueadas por PIN (`secao:id`).
 * @property {string[]} hidden Categorias ocultas (`secao:id`).
 * @property {Object[]} hist Histórico de reprodução.
 * @property {string[]} recentLive Chaves dos canais assistidos recentemente.
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

/** @type {Playlist[]} Listas cadastradas. */
let pls = store.get('pls', []);
/** @type {{fmt: string, auto: string, pin: string}} Opções gerais (formato ao vivo, próximo episódio automático, PIN). */
let opts = store.get('opts', { fmt:'m3u8', auto:'1', pin:'0000' });
/** @type {Playlist|null} Lista ativa. */
let P = null;
/** @type {DadosLista|null} Dados carregados da lista ativa. */
let D = null;
/** @type {Ux|null} Preferências e histórico da lista ativa. */
let ux = null;
let sec = 'live', cat = '*', shown = 200, unlocked = new Set(), lastError = '';

/**
 * Chave de armazenamento das preferências da lista ativa.
 * @returns {string} Chave no formato `ux_<id>`.
 */
const uxKey = () => 'ux_' + P.id;
/**
 * Carrega as preferências e o histórico da lista ativa em `ux`.
 * @returns {void}
 */
function loadUx(){ ux = Object.assign({ fav:{live:[],vod:[],series:[]}, locked:[], hidden:[], hist:[], recentLive:[] }, store.get(uxKey(), {})); }
/**
 * Salva `ux` no armazenamento local.
 * @returns {boolean} `true` se salvou.
 */
const saveUx = () => store.set(uxKey(), ux);
/**
 * Indica se um item é favorito.
 * @param {Secao} s Seção.
 * @param {string|number} k Chave do item.
 * @returns {boolean} `true` se for favorito.
 */
const isFav = (s, k) => ux.fav[s].includes(String(k));
/**
 * Alterna o favorito de um item e salva.
 * @param {Secao} s Seção.
 * @param {string|number} k Chave do item.
 * @returns {boolean} `true` se passou a ser favorito.
 */
function toggleFav(s, k){ k = String(k); const a = ux.fav[s]; const i = a.indexOf(k); i < 0 ? a.unshift(k) : a.splice(i,1); saveUx(); return i < 0; }
