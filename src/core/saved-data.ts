import { asArray, asRecords, isRecord, readText } from './guards';
import type { HistoryEntry, MediaDescriptor, PlayerOptions, Playlist, Profile, SectionName, UserData } from './types';

/**
 * Lista de textos salva; números viram texto.
 * @param value Valor salvo.
 * @returns Textos encontrados.
 */
const parseKeyList = (value: unknown): string[] =>
  asArray(value)
    .filter(entry => typeof entry === 'string' || typeof entry === 'number')
    .map(String);

/**
 * Número opcional salvo.
 * @param value Valor salvo.
 * @returns O número, ou `undefined` se não for número.
 */
const optionalNumber = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined);

/**
 * Texto opcional salvo.
 * @param value Valor salvo.
 * @returns O texto, ou `undefined` se não for texto.
 */
const optionalText = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

/**
 * Lê uma lista salva. Só descarta o que não dá para abrir (sem id ou nome).
 * @param saved Registro salvo.
 * @returns A lista, ou `null` se for inválida.
 */
function parsePlaylist(saved: Record<string, unknown>): Playlist | null {
  const id = readText(saved, 'id'),
    name = readText(saved, 'name');
  if (!id || !name) return null;
  if (saved.type === 'xtream')
    return { id, name, type: 'xtream', server: readText(saved, 'server'), user: readText(saved, 'user'), pass: readText(saved, 'pass') };
  return { id, name, type: 'm3u', url: optionalText(saved.url), epg: optionalText(saved.epg) };
}

/**
 * Lê as listas salvas.
 * @param saved Valor salvo em `cl_pls`.
 * @returns Listas válidas.
 */
export const parsePlaylists = (saved: unknown): Playlist[] =>
  asRecords(saved)
    .map(parsePlaylist)
    .filter(playlist => playlist !== null);

/**
 * Lê os perfis salvos.
 * @param saved Valor salvo em `cl_users`.
 * @returns Perfis válidos.
 */
export const parseProfiles = (saved: unknown): Profile[] =>
  asRecords(saved)
    .map(profile => ({
      id: readText(profile, 'id'),
      name: readText(profile, 'name'),
      askPin: profile.askPin === true ? true : undefined,
      icon: optionalText(profile.icon),
      color: optionalNumber(profile.color),
    }))
    .filter(profile => profile.id !== '');

/**
 * Lê as opções salvas de um perfil, completando o que faltar com os valores padrão.
 * @param saved Valor salvo em `cl_opts`.
 * @returns Opções.
 */
export function parseOptions(saved: unknown): PlayerOptions {
  const savedOptions = isRecord(saved) ? saved : {};
  return {
    fmt: savedOptions.fmt === 'ts' ? 'ts' : 'm3u8',
    auto: savedOptions.auto === '0' ? '0' : '1',
    pin: readText(savedOptions, 'pin') || '0000',
  };
}

/**
 * Lê a descrição salva de um filme ou episódio.
 * @param saved Valor salvo.
 * @returns A descrição, ou `null` se não der para tocar.
 */
function parseMediaDescriptor(saved: unknown): MediaDescriptor | null {
  if (!isRecord(saved)) return null;
  const ref = readText(saved, 'ref'),
    url = readText(saved, 'url');
  if (!ref || !url) return null;
  return {
    kind: saved.kind === 'series' ? 'series' : 'vod',
    ref,
    title: readText(saved, 'title'),
    logo: optionalText(saved.logo),
    url,
    series: optionalText(saved.series),
    season: optionalNumber(saved.season),
    num: optionalNumber(saved.num),
    epId: optionalText(saved.epId),
  };
}

/**
 * Lê um registro do histórico. O registro continua valendo para as barras de progresso mesmo
 * sem a descrição da mídia.
 * @param saved Registro salvo.
 * @returns O registro, ou `null` se não tiver referência.
 */
function parseHistoryEntry(saved: Record<string, unknown>): HistoryEntry | null {
  const ref = readText(saved, 'ref');
  if (!ref) return null;
  const desc = parseMediaDescriptor(saved.desc);
  return {
    title: optionalText(saved.title),
    logo: optionalText(saved.logo),
    series: optionalText(saved.series),
    season: optionalNumber(saved.season),
    num: optionalNumber(saved.num),
    epId: optionalText(saved.epId),
    ref,
    pos: Number(saved.pos) || 0,
    dur: Number(saved.dur) || 0,
    t: optionalNumber(saved.t),
    hidden: saved.hidden === true ? true : undefined,
    desc: desc ?? undefined,
  };
}

/**
 * Lê as preferências e o histórico salvos de uma lista, completando o que faltar.
 * @param saved Valor salvo em `cl_ux_<lista>`.
 * @returns Preferências e histórico.
 */
export function parseUserData(saved: unknown): UserData {
  const savedData = isRecord(saved) ? saved : {},
    savedFavorites = isRecord(savedData.fav) ? savedData.fav : {};
  const favorites: Record<SectionName, string[]> = {
    live: parseKeyList(savedFavorites.live),
    vod: parseKeyList(savedFavorites.vod),
    series: parseKeyList(savedFavorites.series),
  };
  return {
    fav: favorites,
    locked: parseKeyList(savedData.locked),
    hidden: parseKeyList(savedData.hidden),
    hist: asRecords(savedData.hist)
      .map(parseHistoryEntry)
      .filter(entry => entry !== null),
    recentLive: parseKeyList(savedData.recentLive),
  };
}
