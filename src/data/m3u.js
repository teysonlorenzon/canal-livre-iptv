'use strict';
/**
 * Lê o conteúdo de uma lista M3U.
 * @param {string} text Conteúdo da lista.
 * @returns {{entries: Object[], epgUrl: string}} Entradas encontradas e URL do EPG do cabeçalho.
 */
function parseM3u(text){
  const entries = []; let pendingMeta = null, epgUrl = '';
  const lines = text.split(/\r?\n/);
  const headerLine = lines[0] || '';
  const epgUrlMatch = headerLine.match(/(?:x-tvg-url|url-tvg)="([^"]+)"/i); if (epgUrlMatch) epgUrl = epgUrlMatch[1].split(',')[0];
  for (let line of lines) {
    line = line.trim(); if (!line) continue;
    if (line.startsWith('#EXTINF')) {
      const attributes = {}; line.replace(/([\w-]+)="([^"]*)"/g, (_, attributeName, attributeValue) => { attributes[attributeName.toLowerCase()] = attributeValue; });
      const lastQuoteComma = line.lastIndexOf('",'); const nameStart = lastQuoteComma >= 0 ? lastQuoteComma + 2 : line.indexOf(',') + 1;
      pendingMeta = { name: line.slice(nameStart).trim() || attributes['tvg-name'] || 'Sem nome', logo:attributes['tvg-logo']||'', group:attributes['group-title']||'Sem grupo', epg:attributes['tvg-id']||'', tvgName:attributes['tvg-name']||'', archive:+(attributes['catchup-days']||attributes['tvg-rec']||0) };
    } else if (line.startsWith('#EXTGRP:')) { if (pendingMeta) pendingMeta.group = line.slice(8).trim(); }
    else if (!line.startsWith('#')) { entries.push({ ...(pendingMeta || { name:line.split('/').pop(), logo:'', group:'Sem grupo', epg:'' }), url:line }); pendingMeta = null; }
  }
  return { entries, epgUrl };
}
/**
 * Hash djb2 de uma string, em base 36.
 * @param {string} text Texto.
 * @returns {string} Hash.
 */
const hashString = text => { let hashValue = 5381; for (let index = 0; index < text.length; index++) hashValue = (hashValue*33 ^ text.charCodeAt(index)) >>> 0; return hashValue.toString(36); };

/**
 * Organiza uma lista M3U em TV ao vivo, filmes e séries.
 * @param {string} text Conteúdo da lista.
 * @returns {DadosLista} Dados da lista.
 * @throws {Error} Se nenhum canal for encontrado.
 */
function buildFromM3U(text){
  const { entries, epgUrl } = parseM3u(text);
  if (!entries.length) throw new Error('Nenhum canal encontrado no conteúdo');
  const playlistData = { live:{cats:[],items:[]}, vod:{cats:[],items:[]}, series:{cats:[],items:[]}, epgUrl };
  const categoriesBySection = { live:new Map(), vod:new Map(), series:new Map() };
  const seriesByKey = new Map();
  /**
   * Registra a categoria na seção se ainda não existir.
   * @param {Secao} section Seção.
   * @param {string} groupName Nome do grupo.
   * @returns {void}
   */
  const addCat = (section, groupName) => { if (!categoriesBySection[section].has(groupName)) { categoriesBySection[section].set(groupName, 1); playlistData[section].cats.push({ id:groupName, name:groupName }); } };
  let channelNumber = 0;
  for (const entry of entries) {
    const lowerUrl = entry.url.toLowerCase(), groupName = entry.group;
    let kind = 'live';
    if (/\/series\//.test(lowerUrl) || /s[eé]rie/i.test(groupName)) kind = 'series';
    else if (/\/movie\//.test(lowerUrl) || /\b(filme|movie|vod|cinema)/i.test(groupName) || /\.(mp4|mkv|avi)(\?|$)/.test(lowerUrl)) kind = 'vod';
    const episodeMatch = entry.name.match(/^(.*?)[\s._-]*S(\d{1,2})\s*E(\d{1,3})/i);
    if (kind === 'series' || (kind === 'vod' && episodeMatch)) {
      kind = 'series';
      const seriesName = episodeMatch ? episodeMatch[1].trim() : entry.name, seriesKey = hashString(groupName + '|' + seriesName);
      addCat('series', groupName);
      let series = seriesByKey.get(seriesKey);
      if (!series) { series = { k:seriesKey, name:seriesName, logo:entry.logo, cat:groupName, rate:0, added:0, eps:[] }; seriesByKey.set(seriesKey, series); playlistData.series.items.push(series); }
      series.eps.push({ id:hashString(entry.url), title:entry.name, season: episodeMatch ? +episodeMatch[2] : 1, num: episodeMatch ? +episodeMatch[3] : series.eps.length+1, url:entry.url, img:entry.logo });
    } else if (kind === 'vod') {
      addCat('vod', groupName);
      playlistData.vod.items.push({ k:hashString(entry.url), name:entry.name, logo:entry.logo, cat:groupName, url:entry.url, rate:0, added:0 });
    } else {
      addCat('live', groupName);
      playlistData.live.items.push({ k:hashString(entry.url), name:entry.name, logo:entry.logo, cat:groupName, url:entry.url, num:++channelNumber, epg:entry.epg || entry.tvgName, archive:entry.archive });
    }
  }
  return playlistData;
}
