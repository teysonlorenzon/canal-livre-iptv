'use strict';
/**
 * Baixa e lê um guia XMLTV (aceita `.gz`), mantendo de 3 dias atrás a 2 dias à frente.
 * @param {string} url URL do XMLTV.
 * @returns {Promise<Map<string, Programa[]>|null>} Programas por canal (id em minúsculas), ou `null` se falhar.
 */
async function loadXmltv(url){
  try {
    const r = await fetch(url); if (!r.ok) throw 0;
    let txt;
    if (/\.gz(\?|$)/i.test(url) && 'DecompressionStream' in window) txt = await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).text();
    else txt = await r.text();
    const doc = new DOMParser().parseFromString(txt, 'text/xml');
    const map = new Map(), now = Date.now(), lo = now - 3*864e5, hi = now + 2*864e5;
    /**
     * Converte data XMLTV (`AAAAMMDDhhmmss +zzzz`) em timestamp.
     * @param {string} s Data XMLTV.
     * @returns {number} Timestamp em ms (0 se inválida).
     */
    const pd = s => { const m = s.match(/(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)\s*([+-]\d{4})?/); if (!m) return 0; const tz = m[7] ? m[7].slice(0,3)+':'+m[7].slice(3) : 'Z'; return Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${tz}`); };
    for (const p of doc.getElementsByTagName('programme')) {
      const s = pd(p.getAttribute('start')||''), e = pd(p.getAttribute('stop')||'');
      if (e < lo || s > hi) continue;
      const ch = (p.getAttribute('channel')||'').toLowerCase();
      if (!map.has(ch)) map.set(ch, []);
      map.get(ch).push({ s, e, title: p.querySelector('title')?.textContent || '', desc: p.querySelector('desc')?.textContent || '' });
    }
    for (const a of map.values()) a.sort((x,y) => x.s - y.s);
    return map;
  } catch { return null; }
}

const epgCache = new Map();
/**
 * Obtém o guia de programação de um canal (API Xtream com cache de 10 min, ou XMLTV).
 * @param {Item} item Canal.
 * @returns {Promise<Programa[]>} Programas ordenados por início.
 */
async function getEpg(item){
  if (!item) return [];
  if (P.type === 'xtream') {
    const c = epgCache.get(item.k); if (c && Date.now() - c.t < 6e5) return c.l;
    try {
      const r = await xApi(item.archive ? 'get_simple_data_table' : 'get_short_epg', `&stream_id=${item.k}${item.archive ? '' : '&limit=8'}`);
      const l = (r.epg_listings || []).map(x => ({
        s: (+x.start_timestamp || Date.parse(x.start.replace(' ','T'))) * (x.start_timestamp ? 1000 : 1),
        e: (+x.stop_timestamp || Date.parse((x.end||x.stop).replace(' ','T'))) * (x.stop_timestamp ? 1000 : 1),
        title: b64(x.title), desc: b64(x.description), start: x.start, archive: +x.has_archive === 1
      })).sort((a,b) => a.s - b.s);
      epgCache.set(item.k, { t:Date.now(), l });
      return l;
    } catch { return []; }
  }
  if (!D.epg) return [];
  return D.epg.get(String(item.epg||'').toLowerCase()) || D.epg.get(item.name.toLowerCase()) || [];
}
/**
 * Encontra o programa atual e o próximo.
 * @param {Programa[]} l Programas ordenados.
 * @returns {[Programa|null, Programa|null]} Programa atual e próximo.
 */
const nowNext = l => { const t = Date.now(); const i = l.findIndex(p => p.s <= t && p.e > t); return i < 0 ? [null, l.find(p => p.s > t) || null] : [l[i], l[i+1] || null]; };
