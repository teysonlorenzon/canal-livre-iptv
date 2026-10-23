'use strict';
/**
 * Abre o diálogo de detalhes de um filme (busca informações extras no Xtream).
 * @param {Item} it Filme.
 * @returns {Promise<void>}
 */
async function openMovie(it){
  const body = $('detailBody');
  /**
   * Desenha o conteúdo do diálogo do filme.
   * @param {Object} info Informações extras (nome, sinopse, capa, ano, duração, gênero, elenco, trailer).
   * @returns {void}
   */
  const draw = info => {
    const h = ux.hist.find(x => x.ref === 'vod:' + it.k);
    body.innerHTML = `<div class="detail"><div class="poster">${initials(it.name)}${(info.cover || it.logo) ? `<img src="${esc(info.cover || it.logo)}" alt="" onerror="this.remove()">` : ''}</div>
      <div style="display:flex;flex-direction:column;gap:10px;min-width:0"><h3>${esc(info.name || it.name)}</h3>
      <div class="meta">${info.year ? `<span>${esc(info.year)}</span>` : ''}${info.dur ? `<span>${esc(info.dur)}</span>` : ''}${it.rate ? `<span>★ ${(+it.rate).toFixed(1)}</span>` : ''}${info.genre ? `<span>${esc(info.genre)}</span>` : ''}</div>
      ${info.plot ? `<p class="plot">${esc(info.plot)}</p>` : ''}${info.cast ? `<p class="hint">Elenco: ${esc(info.cast)}</p>` : ''}
      <div class="row" style="justify-content:flex-start">
        ${h && h.pos > 30 ? `<button class="btn primary" id="mResume">Continuar de ${fmtT(h.pos)}</button><button class="btn" id="mPlay">Do início</button>` : `<button class="btn primary" id="mPlay">Assistir</button>`}
        <button class="btn" id="mFav">${isFav('vod', it.k) ? '★ Favorito' : '☆ Favoritar'}</button>
        ${info.trailer ? `<a class="btn" href="https://www.youtube.com/watch?v=${esc(info.trailer)}" target="_blank" rel="noopener">Trailer</a>` : ''}
        <button class="btn" id="mClose">Fechar</button>
      </div></div></div>`;
    const desc = { kind:'vod', ref:'vod:'+it.k, title:it.name, logo:info.cover || it.logo, url: it.url || xUrl('movie', it.k, it.ext) };
    $('mPlay').onclick = () => { $('dDetail').close(); playMedia(desc, 0); };
    if ($('mResume')) $('mResume').onclick = () => { $('dDetail').close(); playMedia(desc, h.pos); };
    $('mFav').onclick = e => { e.target.textContent = toggleFav('vod', it.k) ? '★ Favorito' : '☆ Favoritar'; };
    $('mClose').onclick = () => $('dDetail').close();
  };
  draw({}); $('dDetail').showModal();
  if (P.type === 'xtream') {
    try { const r = await xApi('get_vod_info', '&vod_id=' + it.k); const i = r.info || {};
      draw({ name:i.name, plot:i.plot || i.description, cover:i.movie_image || i.cover_big, year:(i.releasedate||'').slice(0,4), dur:i.duration, genre:i.genre, cast:i.cast, trailer:i.youtube_trailer });
    } catch {}
  }
}

/**
 * Abre o diálogo de detalhes de uma série com temporadas e episódios.
 * @param {Item} it Série.
 * @returns {Promise<void>}
 */
async function openSeries(it){
  const body = $('detailBody');
  body.innerHTML = '<div class="spinner"></div>'; $('dDetail').showModal();
  let info = { plot:it.plot, cover:it.logo }, eps = {};
  if (P.type === 'xtream') {
    try { const r = await xApi('get_series_info', '&series_id=' + it.k); const i = r.info || {};
      info = { plot:i.plot, cover:i.cover || it.logo, genre:i.genre, year:(i.releaseDate||i.release_date||'').slice(0,4), cast:i.cast };
      for (const [s, list] of Object.entries(r.episodes || {})) eps[s] = list.map(e => ({ id:String(e.id), title:e.title, num:+e.episode_num, season:+s, url:xUrl('series', e.id, e.container_extension || 'mp4'), img:e.info && e.info.movie_image, dur:e.info && e.info.duration }));
    } catch { toast('Não consegui carregar os episódios.'); }
  } else for (const e of it.eps) (eps[e.season] = eps[e.season] || []).push(e);
  const seasons = Object.keys(eps).sort((a,b) => a-b);
  seasons.forEach(s => eps[s].sort((a,b) => a.num - b.num));
  const flat = seasons.flatMap(s => eps[s]);
  const last = ux.hist.find(x => !x.hidden && x.series === 'series:' + it.k);
  let cur = last ? String(last.season) : seasons[0];
  /**
   * Desenha o conteúdo do diálogo da série para a temporada selecionada.
   * @returns {void}
   */
  const draw = () => {
    body.innerHTML = `<div class="detail"><div class="poster">${initials(it.name)}${info.cover ? `<img src="${esc(info.cover)}" alt="" onerror="this.remove()">` : ''}</div>
      <div style="display:flex;flex-direction:column;gap:10px;min-width:0"><h3>${esc(it.name)}</h3>
      <div class="meta">${info.year ? `<span>${esc(info.year)}</span>` : ''}<span>${seasons.length} temporada${seasons.length === 1 ? '' : 's'}</span>${info.genre ? `<span>${esc(info.genre)}</span>` : ''}</div>
      ${info.plot ? `<p class="plot">${esc(info.plot)}</p>` : ''}
      <div class="row" style="justify-content:flex-start">${last ? `<button class="btn primary" id="sResume">Continuar T${last.season}E${last.num}</button>` : ''}<button class="btn" id="sFav">${isFav('series', it.k) ? '★ Favorito' : '☆ Favoritar'}</button><button class="btn" id="sClose">Fechar</button></div>
      </div></div>
      ${seasons.length ? `<div class="stabs">${seasons.map(s => `<button data-s="${s}" class="${s == cur ? 'on' : ''}">Temporada ${s}</button>`).join('')}</div>
      <ul class="eps">${(eps[cur]||[]).map((e,i) => { const h = ux.hist.find(x => x.ref === 'ep:' + e.id); return `<li data-e="${i}"><span class="num">${e.num}</span><span class="nm"><b>${esc(e.title)}</b>${h && h.dur ? `<div class="pg"><i style="width:${Math.min(100, h.pos/h.dur*100)}%"></i></div>` : ''}</span><span class="hint">${esc(e.dur || '')}</span></li>`; }).join('')}</ul>` : '<p class="empty">Nenhum episódio disponível.</p>'}`;
    body.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { cur = b.dataset.s; draw(); });
    body.querySelectorAll('[data-e]').forEach(li => li.onclick = () => { const e = eps[cur][+li.dataset.e]; $('dDetail').close(); playEpisode(it, info, flat, flat.indexOf(e)); });
    if ($('sResume')) $('sResume').onclick = () => { const i = flat.findIndex(e => e.id === last.epId); $('dDetail').close(); playEpisode(it, info, flat, Math.max(0, i), last.pos); };
    $('sFav').onclick = e => { e.target.textContent = toggleFav('series', it.k) ? '★ Favorito' : '☆ Favoritar'; };
    $('sClose').onclick = () => $('dDetail').close();
  };
  draw();
}
/**
 * Toca um episódio de uma série.
 * @param {Item} s Série.
 * @param {Object} info Informações da série.
 * @param {Episodio[]} flat Todos os episódios em ordem.
 * @param {number} i Índice do episódio em `flat`.
 * @param {number} [pos=0] Posição inicial em segundos.
 * @returns {void}
 */
function playEpisode(s, info, flat, i, pos=0){
  const e = flat[i];
  playMedia({ kind:'series', ref:'ep:'+e.id, series:'series:'+s.k, season:e.season, num:e.num, epId:e.id, title:`${s.name} · T${e.season}E${e.num}`, logo:info.cover || s.logo, url:e.url }, pos, { s, info, flat, i });
}
