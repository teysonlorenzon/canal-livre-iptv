'use strict';
/**
 * Converte data XMLTV (`AAAAMMDDhhmmss +zzzz`) em timestamp.
 * @param {string} xmltvDate Data XMLTV.
 * @returns {number} Timestamp em ms (0 se inválida).
 */
function parseXmltvDate(xmltvDate){
  const dateMatch = xmltvDate.match(/(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)\s*([+-]\d{4})?/);
  if (!dateMatch) return 0;
  const timezone = dateMatch[7] ? dateMatch[7].slice(0,3)+':'+dateMatch[7].slice(3) : 'Z';
  return Date.parse(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T${dateMatch[4]}:${dateMatch[5]}:${dateMatch[6]}${timezone}`);
}
/**
 * Baixa e lê um guia XMLTV (aceita `.gz`), mantendo de 3 dias atrás a 2 dias à frente. Roda com a
 * tela de carregamento principal (pode ser cancelado, e o tempo limite é de 2 minutos).
 * @param {string} url URL do XMLTV.
 * @returns {Promise<Map<string, Programa[]>|null>} Programas por canal (id em minúsculas), ou `null` se falhar.
 */
async function loadXmltv(url){
  try {
    const response = await fetchWithTimeout(url, 120000);
    let xmlText;
    if (/\.gz(\?|$)/i.test(url) && 'DecompressionStream' in window) xmlText = await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).text();
    else xmlText = await response.text();
    const xmlDocument = new DOMParser().parseFromString(xmlText, 'text/xml');
    const programsByChannel = new Map(), now = Date.now(), oldestAllowed = now - 3*864e5, newestAllowed = now + 2*864e5;
    for (const programmeElement of xmlDocument.getElementsByTagName('programme')) {
      const start = parseXmltvDate(programmeElement.getAttribute('start')||''), end = parseXmltvDate(programmeElement.getAttribute('stop')||'');
      if (end < oldestAllowed || start > newestAllowed) continue;
      const channelId = (programmeElement.getAttribute('channel')||'').toLowerCase();
      if (!programsByChannel.has(channelId)) programsByChannel.set(channelId, []);
      programsByChannel.get(channelId).push({ s:start, e:end, title: programmeElement.querySelector('title')?.textContent || '', desc: programmeElement.querySelector('desc')?.textContent || '' });
    }
    for (const channelPrograms of programsByChannel.values()) channelPrograms.sort((first, second) => first.s - second.s);
    return programsByChannel;
  } catch { return null; }
}

/** @type {Map<string, {t: number, l: Programa[]}>} Guia da API Xtream por canal, com o momento em que foi baixado. */
const epgCache = new Map();
/**
 * Obtém o guia de programação de um canal (API Xtream com cache de 10 min, ou XMLTV).
 * @param {Item} item Canal.
 * @returns {Promise<Programa[]>} Programas ordenados por início.
 */
async function getEpg(item){
  if (!item) return [];
  if (activePlaylist.type === 'xtream') {
    const cachedEntry = epgCache.get(item.k); if (cachedEntry && Date.now() - cachedEntry.t < 6e5) return cachedEntry.l;
    try {
      const response = await xtreamApi(item.archive ? 'get_simple_data_table' : 'get_short_epg', `&stream_id=${item.k}${item.archive ? '' : '&limit=8'}`);
      const programs = (response.epg_listings || []).map(listing => ({
        s: (+listing.start_timestamp || Date.parse(listing.start.replace(' ','T'))) * (listing.start_timestamp ? 1000 : 1),
        e: (+listing.stop_timestamp || Date.parse((listing.end||listing.stop).replace(' ','T'))) * (listing.stop_timestamp ? 1000 : 1),
        title: decodeBase64(listing.title), desc: decodeBase64(listing.description), start: listing.start, archive: +listing.has_archive === 1
      })).sort((first, second) => first.s - second.s);
      epgCache.set(item.k, { t:Date.now(), l:programs });
      return programs;
    } catch { return []; }
  }
  if (!catalog.epg) return [];
  return catalog.epg.get(String(item.epg||'').toLowerCase()) || catalog.epg.get(item.name.toLowerCase()) || [];
}
/**
 * Encontra o programa atual e o próximo.
 * @param {Programa[]} programs Programas ordenados.
 * @returns {[Programa|null, Programa|null]} Programa atual e próximo.
 */
const nowNext = programs => { const now = Date.now(); const currentIndex = programs.findIndex(program => program.s <= now && program.e > now); return currentIndex < 0 ? [null, programs.find(program => program.s > now) || null] : [programs[currentIndex], programs[currentIndex+1] || null]; };
