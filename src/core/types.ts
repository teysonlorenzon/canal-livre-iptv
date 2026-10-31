/** Identificador de um `setTimeout` ou `setInterval`. */
export type TimerId = ReturnType<typeof setTimeout>;

/** Seção de conteúdo da lista. */
export type SectionName = 'live' | 'vod' | 'series';

/** Seção de títulos sob demanda (filmes ou séries). */
export type OnDemandSection = Exclude<SectionName, 'live'>;

/** Dados comuns de uma lista IPTV cadastrada pelo usuário. */
interface PlaylistBase {
  /** Identificador único. */
  id: string;
  /** Nome exibido. */
  name: string;
}

/** Lista com login Xtream Codes. */
export interface XtreamPlaylist extends PlaylistBase {
  type: 'xtream';
  /** Servidor (com protocolo e porta). */
  server: string;
  user: string;
  pass: string;
}

/** Lista M3U, por URL ou por conteúdo salvo no aparelho. */
export interface M3uPlaylist extends PlaylistBase {
  type: 'm3u';
  /** URL da lista (vazia em listas vindas de arquivo). */
  url?: string;
  /** URL do EPG XMLTV. */
  epg?: string;
}

/** Lista IPTV cadastrada pelo usuário. */
export type Playlist = XtreamPlaylist | M3uPlaylist;

/** Categoria de uma seção. */
export interface Category {
  id: string;
  name: string;
}

/** Episódio de uma série. */
export interface Episode {
  id: string;
  title: string;
  /** Temporada. */
  season: number;
  /** Número do episódio. */
  num: number;
  url: string;
  /** Imagem do episódio. */
  img?: string;
  /** Duração formatada. */
  dur?: string;
}

/** Canal, filme ou série de uma seção. */
export interface Item {
  /** Chave única do item. */
  k: string;
  name: string;
  /** URL do logo ou capa. */
  logo?: string;
  /** Id da categoria. */
  cat: string;
  /** URL direta do conteúdo (listas M3U). */
  url?: string;
  /** Número do canal. */
  num?: number;
  /** Id do canal no EPG. */
  epg?: string;
  /** Dias de catch-up disponíveis (0 = sem catch-up). */
  archive?: number;
  /** Extensão do arquivo do filme. */
  ext?: string;
  /** Avaliação. */
  rate?: number;
  /** Data de inclusão (timestamp em segundos). */
  added?: number;
  /** Sinopse. */
  plot?: string;
  /** Episódios (séries de listas M3U). */
  eps?: Episode[];
}

/** Itens e categorias de uma seção. */
export interface SectionData {
  cats: Category[];
  items: Item[];
}

/** Programa do guia de programação. */
export interface Programme {
  /** Início (timestamp em ms). */
  s: number;
  /** Fim (timestamp em ms). */
  e: number;
  title: string;
  desc: string;
  /** Início no formato do servidor Xtream. */
  start?: string;
  /** Se há gravação para catch-up. */
  archive?: boolean;
}

/** Dados da conta informados pelo servidor Xtream no login. */
export interface XtreamAccount {
  status: string;
  /** Vencimento (timestamp em segundos; 0 = ilimitado). */
  expiresAt: number;
  activeConnections: string;
  maxConnections: string;
  username: string;
}

/** Dados carregados da lista ativa. */
export interface Catalog {
  live: SectionData;
  /** Filmes (carregados sob demanda no Xtream). */
  vod: SectionData | null;
  /** Séries (carregadas sob demanda no Xtream). */
  series: SectionData | null;
  /** Dados da conta Xtream. */
  account?: XtreamAccount;
  /** URL do EPG declarada no cabeçalho do M3U. */
  epgUrl?: string;
  /** Guia XMLTV indexado pelo id do canal. */
  epg?: Map<string, Programme[]>;
}

/** Descrição de uma mídia sob demanda (filme ou episódio). */
export interface MediaDescriptor {
  kind: OnDemandSection;
  /** Referência única no histórico. */
  ref: string;
  /** Título exibido no player. */
  title: string;
  /** Capa. */
  logo?: string;
  url: string;
  /** Referência da série (episódios). */
  series?: string;
  /** Temporada (episódios). */
  season?: number;
  /** Número do episódio. */
  num?: number;
  /** Id do episódio. */
  epId?: string;
}

/** Registro do histórico de reprodução. */
export interface HistoryEntry extends Partial<MediaDescriptor> {
  ref: string;
  /** Posição assistida em segundos. */
  pos: number;
  /** Duração em segundos. */
  dur: number;
  /** Momento em que foi salvo (timestamp em ms). */
  t?: number;
  /** Registro só de progresso de um episódio, fora de "Continuar assistindo". */
  hidden?: boolean;
  /** Mídia, para retomar a reprodução. */
  desc?: MediaDescriptor;
}

/** Registro do histórico que pode ser retomado no player. */
export type ResumableEntry = HistoryEntry & { desc: MediaDescriptor };

/** Preferências e histórico do perfil para uma lista. */
export interface UserData {
  /** Chaves favoritas por seção. */
  fav: Record<SectionName, string[]>;
  /** Categorias bloqueadas por PIN (`secao:id`). */
  locked: string[];
  /** Categorias ocultas (`secao:id`). */
  hidden: string[];
  /** Histórico de reprodução. */
  hist: HistoryEntry[];
  /** Chaves dos canais assistidos recentemente. */
  recentLive: string[];
}

/** Perfil de usuário (sem login). Listas são compartilhadas; o resto é por perfil. */
export interface Profile {
  /** Identificador (`main` = perfil Principal, que usa as chaves antigas). */
  id: string;
  name: string;
  /** Pedir o PIN do perfil para entrar nele. */
  askPin?: boolean;
  /** Ícone da foto de perfil (vazio = inicial do nome). */
  icon?: string;
  /** Cor da foto de perfil (0 a 5). */
  color?: number;
}

/** Opções de reprodução e PIN de um perfil. */
export interface PlayerOptions {
  /** Formato da TV ao vivo no Xtream. */
  fmt: 'm3u8' | 'ts';
  /** Próximo episódio automático (`1` = ligado). */
  auto: '0' | '1';
  pin: string;
}

/** Informações de uma série mostradas nos detalhes. */
export interface SeriesInfo {
  plot?: string;
  cover?: string;
  genre?: string;
  year?: string;
  cast?: string;
}

/** Contexto de reprodução de uma série, usado para navegar entre episódios. */
export interface SeriesContext {
  /** Série. */
  s: Item;
  info: SeriesInfo;
  /** Todos os episódios em ordem. */
  flat: Episode[];
  /** Índice do episódio atual em `flat`. */
  i: number;
}

/** Motor de reprodução. */
export type EngineName = 'hls' | 'ts' | 'native';

/** Etapa de uma cadeia de tentativas de reprodução. */
export interface PlaybackStage {
  eng: EngineName;
  url: string;
}

/** Canal ao vivo em reprodução. */
export interface LiveMedia {
  kind: 'live';
  item: Item;
  url: string;
  desc?: undefined;
  ctx?: undefined;
  resume?: undefined;
}

/** Programa já exibido em reprodução (catch-up). */
export interface CatchupMedia {
  kind: 'catchup';
  item: Item;
  url: string;
  desc: { title: string };
  ctx?: undefined;
  resume?: undefined;
}

/** Filme ou episódio em reprodução. */
export interface OnDemandMedia {
  kind: OnDemandSection;
  item?: undefined;
  url: string;
  desc: MediaDescriptor;
  /** Contexto da série (episódios). */
  ctx: SeriesContext | null;
  /** Posição a retomar em segundos. */
  resume: number;
}

/** Mídia em reprodução. */
export type CurrentMedia = LiveMedia | CatchupMedia | OnDemandMedia;
