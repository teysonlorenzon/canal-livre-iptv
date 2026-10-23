'use strict';
/**
 * Lê o conteúdo de uma lista M3U.
 * @param {string} text Conteúdo da lista.
 * @returns {{entries: Object[], epgUrl: string}} Entradas encontradas e URL do EPG do cabeçalho.
 */
function parseM3U(text){
  const out = []; let meta = null, epgUrl = '';
  const lines = text.split(/\r?\n/);
  const h = lines[0] || '';
  const m = h.match(/(?:x-tvg-url|url-tvg)="([^"]+)"/i); if (m) epgUrl = m[1].split(',')[0];
  for (let line of lines) {
    line = line.trim(); if (!line) continue;
    if (line.startsWith('#EXTINF')) {
      const a = {}; line.replace(/([\w-]+)="([^"]*)"/g, (_, k, v) => { a[k.toLowerCase()] = v; });
      const q = line.lastIndexOf('",'); const ci = q >= 0 ? q + 2 : line.indexOf(',') + 1;
      meta = { name: line.slice(ci).trim() || a['tvg-name'] || 'Sem nome', logo:a['tvg-logo']||'', group:a['group-title']||'Sem grupo', epg:a['tvg-id']||'', tvgName:a['tvg-name']||'', archive:+(a['catchup-days']||a['tvg-rec']||0) };
    } else if (line.startsWith('#EXTGRP:')) { if (meta) meta.group = line.slice(8).trim(); }
    else if (!line.startsWith('#')) { out.push({ ...(meta || { name:line.split('/').pop(), logo:'', group:'Sem grupo', epg:'' }), url:line }); meta = null; }
  }
  return { entries: out, epgUrl };
}
/**
 * Hash djb2 de uma string, em base 36.
 * @param {string} s Texto.
 * @returns {string} Hash.
 */
const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = (h*33 ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };

/**
 * Organiza uma lista M3U em TV ao vivo, filmes e séries.
 * @param {string} text Conteúdo da lista.
 * @returns {DadosLista} Dados da lista.
 * @throws {Error} Se nenhum canal for encontrado.
 */
function buildFromM3U(text){
  const { entries, epgUrl } = parseM3U(text);
  if (!entries.length) throw new Error('Nenhum canal encontrado no conteúdo');
  const d = { live:{cats:[],items:[]}, vod:{cats:[],items:[]}, series:{cats:[],items:[]}, epgUrl };
  const cmap = { live:new Map(), vod:new Map(), series:new Map() };
  const seriesMap = new Map();
  /**
   * Registra a categoria na seção se ainda não existir.
   * @param {Secao} s Seção.
   * @param {string} g Nome do grupo.
   * @returns {void}
   */
  const addCat = (s, g) => { if (!cmap[s].has(g)) { cmap[s].set(g, 1); d[s].cats.push({ id:g, name:g }); } };
  let n = 0;
  for (const e of entries) {
    const u = e.url.toLowerCase(), g = e.group;
    let kind = 'live';
    if (/\/series\//.test(u) || /s[eé]rie/i.test(g)) kind = 'series';
    else if (/\/movie\//.test(u) || /\b(filme|movie|vod|cinema)/i.test(g) || /\.(mp4|mkv|avi)(\?|$)/.test(u)) kind = 'vod';
    const ep = e.name.match(/^(.*?)[\s._-]*S(\d{1,2})\s*E(\d{1,3})/i);
    if (kind === 'series' || (kind === 'vod' && ep)) {
      kind = 'series';
      const sname = ep ? ep[1].trim() : e.name, key = hash(g + '|' + sname);
      addCat('series', g);
      let s = seriesMap.get(key);
      if (!s) { s = { k:key, name:sname, logo:e.logo, cat:g, rate:0, added:0, eps:[] }; seriesMap.set(key, s); d.series.items.push(s); }
      s.eps.push({ id:hash(e.url), title:e.name, season: ep ? +ep[2] : 1, num: ep ? +ep[3] : s.eps.length+1, url:e.url, img:e.logo });
    } else if (kind === 'vod') {
      addCat('vod', g);
      d.vod.items.push({ k:hash(e.url), name:e.name, logo:e.logo, cat:g, url:e.url, rate:0, added:0 });
    } else {
      addCat('live', g);
      d.live.items.push({ k:hash(e.url), name:e.name, logo:e.logo, cat:g, url:e.url, num:++n, epg:e.epg || e.tvgName, archive:e.archive });
    }
  }
  return d;
}
