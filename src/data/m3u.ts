import type { Catalog, Episode, Item, SectionData, SectionName } from '../core/types';

/** Canal, filme ou episódio encontrado numa lista M3U. */
interface M3uEntry {
  name: string;
  logo: string;
  group: string;
  epg: string;
  tvgName?: string;
  archive?: number;
  url: string;
}

/** Série de uma lista M3U, com seus episódios. */
type M3uSeries = Item & { eps: Episode[] };

/**
 * Lê os atributos `nome="valor"` de uma linha `#EXTINF`.
 * @param line Linha.
 * @returns Atributos, com os nomes em minúsculas.
 */
function readLineAttributes(line: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const attributeMatch of line.match(/[\w-]+="[^"]*"/g) ?? []) {
    const separatorIndex = attributeMatch.indexOf('=');
    attributes[attributeMatch.slice(0, separatorIndex).toLowerCase()] = attributeMatch.slice(separatorIndex + 2, -1);
  }
  return attributes;
}

/**
 * Lê o conteúdo de uma lista M3U.
 * @param text Conteúdo da lista.
 * @returns Entradas encontradas e URL do EPG do cabeçalho.
 */
function parseM3u(text: string): { entries: M3uEntry[]; epgUrl: string } {
  const entries: M3uEntry[] = [];
  let pendingMeta: Omit<M3uEntry, 'url'> | null = null,
    epgUrl = '';
  const lines = text.split(/\r?\n/);
  const headerLine = lines[0] ?? '';
  const epgUrlMatch = headerLine.match(/(?:x-tvg-url|url-tvg)="([^"]+)"/i);
  if (epgUrlMatch) epgUrl = (epgUrlMatch[1] ?? '').split(',')[0] ?? '';
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF')) {
      const attributes = readLineAttributes(line);
      const lastQuoteComma = line.lastIndexOf('",');
      const nameStart = lastQuoteComma >= 0 ? lastQuoteComma + 2 : line.indexOf(',') + 1;
      pendingMeta = {
        name: line.slice(nameStart).trim() || attributes['tvg-name'] || 'Sem nome',
        logo: attributes['tvg-logo'] || '',
        group: attributes['group-title'] || 'Sem grupo',
        epg: attributes['tvg-id'] || '',
        tvgName: attributes['tvg-name'] || '',
        archive: Number(attributes['catchup-days'] || attributes['tvg-rec'] || 0),
      };
    } else if (line.startsWith('#EXTGRP:')) {
      if (pendingMeta) pendingMeta.group = line.slice(8).trim();
    } else if (!line.startsWith('#')) {
      entries.push({ ...(pendingMeta ?? { name: line.split('/').pop() ?? line, logo: '', group: 'Sem grupo', epg: '' }), url: line });
      pendingMeta = null;
    }
  }
  return { entries, epgUrl };
}
/**
 * Hash djb2 de uma string, em base 36.
 * @param text Texto.
 * @returns Hash.
 */
export const hashString = (text: string): string => {
  let hashValue = 5381;
  for (let index = 0; index < text.length; index++) hashValue = ((hashValue * 33) ^ text.charCodeAt(index)) >>> 0;
  return hashValue.toString(36);
};

/**
 * Organiza uma lista M3U em TV ao vivo, filmes e séries.
 * @param text Conteúdo da lista.
 * @returns Dados da lista.
 * @throws Se nenhum canal for encontrado.
 */
export function buildFromM3U(text: string): Catalog {
  const { entries, epgUrl } = parseM3u(text);
  if (!entries.length) throw new Error('Nenhum canal encontrado no conteúdo');
  const playlistData: Record<SectionName, SectionData> & { epgUrl: string } = {
    live: { cats: [], items: [] },
    vod: { cats: [], items: [] },
    series: { cats: [], items: [] },
    epgUrl,
  };
  const categoriesBySection: Record<SectionName, Set<string>> = { live: new Set(), vod: new Set(), series: new Set() };
  const seriesByKey = new Map<string, M3uSeries>();
  /**
   * Registra a categoria na seção se ainda não existir.
   * @param section Seção.
   * @param groupName Nome do grupo.
   */
  const addCat = (section: SectionName, groupName: string): void => {
    if (!categoriesBySection[section].has(groupName)) {
      categoriesBySection[section].add(groupName);
      playlistData[section].cats.push({ id: groupName, name: groupName });
    }
  };
  let channelNumber = 0;
  for (const entry of entries) {
    const lowerUrl = entry.url.toLowerCase(),
      groupName = entry.group;
    let kind: SectionName = 'live';
    if (/\/series\//.test(lowerUrl) || /s[eé]rie/i.test(groupName)) kind = 'series';
    else if (/\/movie\//.test(lowerUrl) || /\b(filme|movie|vod|cinema)/i.test(groupName) || /\.(mp4|mkv|avi)(\?|$)/.test(lowerUrl))
      kind = 'vod';
    const episodeMatch = entry.name.match(/^(.*?)[\s._-]*S(\d{1,2})\s*E(\d{1,3})/i);
    if (kind === 'series' || (kind === 'vod' && episodeMatch)) {
      const seriesName = episodeMatch ? (episodeMatch[1] ?? '').trim() : entry.name,
        seriesKey = hashString(groupName + '|' + seriesName);
      addCat('series', groupName);
      let series = seriesByKey.get(seriesKey);
      if (!series) {
        series = { k: seriesKey, name: seriesName, logo: entry.logo, cat: groupName, rate: 0, added: 0, eps: [] };
        seriesByKey.set(seriesKey, series);
        playlistData.series.items.push(series);
      }
      series.eps.push({
        id: hashString(entry.url),
        title: entry.name,
        season: episodeMatch ? Number(episodeMatch[2]) : 1,
        num: episodeMatch ? Number(episodeMatch[3]) : series.eps.length + 1,
        url: entry.url,
        img: entry.logo,
      });
    } else if (kind === 'vod') {
      addCat('vod', groupName);
      playlistData.vod.items.push({
        k: hashString(entry.url),
        name: entry.name,
        logo: entry.logo,
        cat: groupName,
        url: entry.url,
        rate: 0,
        added: 0,
      });
    } else {
      addCat('live', groupName);
      playlistData.live.items.push({
        k: hashString(entry.url),
        name: entry.name,
        logo: entry.logo,
        cat: groupName,
        url: entry.url,
        num: ++channelNumber,
        epg: entry.epg || entry.tvgName,
        archive: entry.archive,
      });
    }
  }
  return playlistData;
}
