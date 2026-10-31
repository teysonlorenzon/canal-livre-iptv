import { asRecords, isRecord, readText } from '../core/guards';
import { state } from '../core/state';
import type { Item, Programme } from '../core/types';
import { decodeBase64 } from '../core/utils';
import { fetchWithTimeout, xtreamApi } from './xtream';

/**
 * Converte data XMLTV (`AAAAMMDDhhmmss +zzzz`) em timestamp.
 * @param xmltvDate Data XMLTV.
 * @returns Timestamp em ms (0 se inválida).
 */
function parseXmltvDate(xmltvDate: string): number {
  const dateMatch = xmltvDate.match(/(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)\s*([+-]\d{4})?/);
  if (!dateMatch) return 0;
  const timezone = dateMatch[7] ? dateMatch[7].slice(0, 3) + ':' + dateMatch[7].slice(3) : 'Z';
  return Date.parse(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T${dateMatch[4]}:${dateMatch[5]}:${dateMatch[6]}${timezone}`);
}
/**
 * Baixa e lê um guia XMLTV (aceita `.gz`), mantendo de 3 dias atrás a 2 dias à frente. Roda com a
 * tela de carregamento principal (pode ser cancelado, e o tempo limite é de 2 minutos).
 * @param url URL do XMLTV.
 * @returns Programas por canal (id em minúsculas), ou `null` se falhar.
 */
export async function loadXmltv(url: string): Promise<Map<string, Programme[]> | null> {
  try {
    const response = await fetchWithTimeout(url, 120000);
    let xmlText;
    if (/\.gz(\?|$)/i.test(url) && 'DecompressionStream' in window && response.body)
      xmlText = await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).text();
    else xmlText = await response.text();
    const xmlDocument = new DOMParser().parseFromString(xmlText, 'text/xml');
    const programsByChannel = new Map<string, Programme[]>(),
      now = Date.now(),
      oldestAllowed = now - 3 * 864e5,
      newestAllowed = now + 2 * 864e5;
    for (const programmeElement of xmlDocument.getElementsByTagName('programme')) {
      const start = parseXmltvDate(programmeElement.getAttribute('start') || ''),
        end = parseXmltvDate(programmeElement.getAttribute('stop') || '');
      if (end < oldestAllowed || start > newestAllowed) continue;
      const channelId = (programmeElement.getAttribute('channel') || '').toLowerCase();
      const programme: Programme = {
        s: start,
        e: end,
        title: programmeElement.querySelector('title')?.textContent || '',
        desc: programmeElement.querySelector('desc')?.textContent || '',
      };
      const channelPrograms = programsByChannel.get(channelId);
      if (channelPrograms) channelPrograms.push(programme);
      else programsByChannel.set(channelId, [programme]);
    }
    for (const channelPrograms of programsByChannel.values()) channelPrograms.sort((first, second) => first.s - second.s);
    return programsByChannel;
  } catch {
    return null;
  }
}

/** Guia da API Xtream por canal, com o momento em que foi baixado. */
export const epgCache: Map<string, { t: number; l: Programme[] }> = new Map();
/**
 * Converte o horário de um programa da API Xtream em timestamp.
 * @param timestamp Horário em segundos, se o servidor mandou.
 * @param dateText Horário em texto (`AAAA-MM-DD hh:mm:ss`), usado na falta do anterior.
 * @returns Timestamp em ms.
 */
const listingTime = (timestamp: unknown, dateText: string): number =>
  (Number(timestamp) || Date.parse(dateText.replace(' ', 'T'))) * (timestamp ? 1000 : 1);

/**
 * Obtém o guia de programação de um canal (API Xtream com cache de 10 min, ou XMLTV).
 * @param item Canal.
 * @returns Programas ordenados por início.
 */
export async function getEpg(item: Item | undefined): Promise<Programme[]> {
  if (!item) return [];
  if (state.activePlaylist?.type === 'xtream') {
    const cachedEntry = epgCache.get(item.k);
    if (cachedEntry && Date.now() - cachedEntry.t < 6e5) return cachedEntry.l;
    try {
      const response = await xtreamApi(
        item.archive ? 'get_simple_data_table' : 'get_short_epg',
        `&stream_id=${item.k}${item.archive ? '' : '&limit=8'}`,
      );
      const programs = asRecords(isRecord(response) ? response.epg_listings : [])
        .map(listing => ({
          s: listingTime(listing.start_timestamp, readText(listing, 'start')),
          e: listingTime(listing.stop_timestamp, readText(listing, 'end') || readText(listing, 'stop')),
          title: decodeBase64(readText(listing, 'title')),
          desc: decodeBase64(readText(listing, 'description')),
          start: readText(listing, 'start'),
          archive: Number(listing.has_archive) === 1,
        }))
        .sort((first, second) => first.s - second.s);
      epgCache.set(item.k, { t: Date.now(), l: programs });
      return programs;
    } catch {
      return [];
    }
  }
  const programmesByChannel = state.catalog?.epg;
  if (!programmesByChannel) return [];
  return programmesByChannel.get(String(item.epg || '').toLowerCase()) || programmesByChannel.get(item.name.toLowerCase()) || [];
}
/**
 * Encontra o programa atual e o próximo.
 * @param programs Programas ordenados.
 * @returns Programa atual e próximo.
 */
export const nowNext = (programs: Programme[]): [Programme | null, Programme | null] => {
  const now = Date.now();
  const currentIndex = programs.findIndex(program => program.s <= now && program.e > now);
  return currentIndex < 0
    ? [null, programs.find(program => program.s > now) || null]
    : [programs[currentIndex] ?? null, programs[currentIndex + 1] ?? null];
};
