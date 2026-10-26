'use strict';
/**
 * Abre o diálogo de detalhes de um filme (busca informações extras no Xtream).
 * @param {Item} movie Filme.
 * @returns {Promise<void>}
 */
async function openMovie(movie){
  const detailBody = $('detailBody');
  /**
   * Desenha o conteúdo do diálogo do filme.
   * @param {Object} info Informações extras (nome, sinopse, capa, ano, duração, gênero, elenco, trailer).
   * @returns {void}
   */
  const drawMovie = info => {
    const historyEntry = userData.hist.find(entry => entry.ref === 'vod:' + movie.k);
    detailBody.innerHTML = `<div class="detail"><div class="poster">${initials(movie.name)}${(info.cover || movie.logo) ? `<img src="${esc(info.cover || movie.logo)}" alt="" onerror="this.remove()">` : ''}</div>
      <div style="display:flex;flex-direction:column;gap:10px;min-width:0"><h3>${esc(info.name || movie.name)}</h3>
      <div class="meta">${info.year ? `<span>${esc(info.year)}</span>` : ''}${info.dur ? `<span>${esc(info.dur)}</span>` : ''}${movie.rate ? `<span>★ ${(+movie.rate).toFixed(1)}</span>` : ''}${info.genre ? `<span>${esc(info.genre)}</span>` : ''}</div>
      ${info.plot ? `<p class="plot">${esc(info.plot)}</p>` : ''}${info.cast ? `<p class="hint">Elenco: ${esc(info.cast)}</p>` : ''}
      <div class="row" style="justify-content:flex-start">
        ${historyEntry && historyEntry.pos > 30 ? `<button class="btn primary" id="mResume">Continuar de ${formatTime(historyEntry.pos)}</button><button class="btn" id="mPlay">Do início</button>` : `<button class="btn primary" id="mPlay">Assistir</button>`}
        <button class="btn" id="mFav">${isFav('vod', movie.k) ? '★ Favorito' : '☆ Favoritar'}</button>
        ${info.trailer ? `<a class="btn" href="https://www.youtube.com/watch?v=${esc(info.trailer)}" target="_blank" rel="noopener">Trailer</a>` : ''}
        <button class="btn" id="mClose">Fechar</button>
      </div></div></div>`;
    const mediaDescriptor = { kind:'vod', ref:'vod:'+movie.k, title:movie.name, logo:info.cover || movie.logo, url: movie.url || xtreamStreamUrl('movie', movie.k, movie.ext) };
    $('mPlay').onclick = () => { $('dDetail').close(); playMedia(mediaDescriptor, 0); };
    if ($('mResume')) $('mResume').onclick = () => { $('dDetail').close(); playMedia(mediaDescriptor, historyEntry.pos); };
    $('mFav').onclick = clickEvent => { clickEvent.target.textContent = toggleFav('vod', movie.k) ? '★ Favorito' : '☆ Favoritar'; };
    $('mClose').onclick = () => $('dDetail').close();
  };
  drawMovie({}); $('dDetail').showModal();
  if (activePlaylist.type === 'xtream') {
    try { const response = await xtreamApi('get_vod_info', '&vod_id=' + movie.k); const vodInfo = response.info || {};
      drawMovie({ name:vodInfo.name, plot:vodInfo.plot || vodInfo.description, cover:vodInfo.movie_image || vodInfo.cover_big, year:(vodInfo.releasedate||'').slice(0,4), dur:vodInfo.duration, genre:vodInfo.genre, cast:vodInfo.cast, trailer:vodInfo.youtube_trailer });
    } catch {}
  }
}

/**
 * Carrega as informações e os episódios de uma série (da API Xtream ou da lista M3U),
 * com temporadas e episódios em ordem.
 * @param {Item} series Série.
 * @returns {Promise<{info: Object, episodesBySeason: Object<string, Episodio[]>, seasons: string[], episodeList: Episodio[]}>} Dados da série.
 */
async function loadSeriesEpisodes(series){
  let info = { plot:series.plot, cover:series.logo }; const episodesBySeason = {};
  if (activePlaylist.type === 'xtream') {
    try { const response = await xtreamApi('get_series_info', '&series_id=' + series.k); const seriesInfo = response.info || {};
      info = { plot:seriesInfo.plot, cover:seriesInfo.cover || series.logo, genre:seriesInfo.genre, year:(seriesInfo.releaseDate||seriesInfo.release_date||'').slice(0,4), cast:seriesInfo.cast };
      for (const [seasonNumber, apiEpisodes] of Object.entries(response.episodes || {})) episodesBySeason[seasonNumber] = apiEpisodes.map(apiEpisode => ({ id:String(apiEpisode.id), title:apiEpisode.title, num:+apiEpisode.episode_num, season:+seasonNumber, url:xtreamStreamUrl('series', apiEpisode.id, apiEpisode.container_extension || 'mp4'), img:apiEpisode.info && apiEpisode.info.movie_image, dur:apiEpisode.info && apiEpisode.info.duration }));
    } catch { toast('Não consegui carregar os episódios.'); }
  } else for (const episode of series.eps) (episodesBySeason[episode.season] = episodesBySeason[episode.season] || []).push(episode);
  const seasons = Object.keys(episodesBySeason).sort((firstSeason, secondSeason) => firstSeason-secondSeason);
  seasons.forEach(seasonNumber => episodesBySeason[seasonNumber].sort((firstEpisode, secondEpisode) => firstEpisode.num - secondEpisode.num));
  const episodeList = seasons.flatMap(seasonNumber => episodesBySeason[seasonNumber]);
  return { info, episodesBySeason, seasons, episodeList };
}

/**
 * Abre o diálogo de detalhes de uma série com temporadas e episódios.
 * @param {Item} series Série.
 * @returns {Promise<void>}
 */
async function openSeries(series){
  const detailBody = $('detailBody');
  detailBody.innerHTML = '<div class="spinner"></div>'; $('dDetail').showModal();
  const { info, episodesBySeason, seasons, episodeList } = await loadSeriesEpisodes(series);
  const lastWatched = userData.hist.find(entry => !entry.hidden && entry.series === 'series:' + series.k);
  let selectedSeason = lastWatched ? String(lastWatched.season) : seasons[0];
  /**
   * Desenha o conteúdo do diálogo da série para a temporada selecionada.
   * @returns {void}
   */
  const drawSeries = () => {
    detailBody.innerHTML = `<div class="detail"><div class="poster">${initials(series.name)}${info.cover ? `<img src="${esc(info.cover)}" alt="" onerror="this.remove()">` : ''}</div>
      <div style="display:flex;flex-direction:column;gap:10px;min-width:0"><h3>${esc(series.name)}</h3>
      <div class="meta">${info.year ? `<span>${esc(info.year)}</span>` : ''}<span>${seasons.length} temporada${seasons.length === 1 ? '' : 's'}</span>${info.genre ? `<span>${esc(info.genre)}</span>` : ''}</div>
      ${info.plot ? `<p class="plot">${esc(info.plot)}</p>` : ''}
      <div class="row" style="justify-content:flex-start">${lastWatched ? `<button class="btn primary" id="sResume">Continuar T${lastWatched.season}E${lastWatched.num}</button>` : ''}<button class="btn" id="sFav">${isFav('series', series.k) ? '★ Favorito' : '☆ Favoritar'}</button><button class="btn" id="sClose">Fechar</button></div>
      </div></div>
      ${seasons.length ? `<div class="stabs">${seasons.map(seasonNumber => `<button data-s="${seasonNumber}" class="${seasonNumber == selectedSeason ? 'on' : ''}">Temporada ${seasonNumber}</button>`).join('')}</div>
      <ul class="eps">${(episodesBySeason[selectedSeason]||[]).map((episode, index) => { const historyEntry = userData.hist.find(entry => entry.ref === 'ep:' + episode.id); return `<li data-e="${index}"><span class="num">${episode.num}</span><span class="nm"><b>${esc(episode.title)}</b>${historyEntry && historyEntry.dur ? `<div class="pg"><i style="width:${Math.min(100, historyEntry.pos/historyEntry.dur*100)}%"></i></div>` : ''}</span><span class="hint">${esc(episode.dur || '')}</span></li>`; }).join('')}</ul>` : '<p class="empty">Nenhum episódio disponível.</p>'}`;
    detailBody.querySelectorAll('[data-s]').forEach(seasonButton => seasonButton.onclick = () => { selectedSeason = seasonButton.dataset.s; drawSeries(); });
    detailBody.querySelectorAll('[data-e]').forEach(episodeItem => episodeItem.onclick = () => { const episode = episodesBySeason[selectedSeason][+episodeItem.dataset.e]; $('dDetail').close(); playEpisode(series, info, episodeList, episodeList.indexOf(episode)); });
    if ($('sResume')) $('sResume').onclick = () => { const resumeIndex = episodeList.findIndex(episode => episode.id === lastWatched.epId); $('dDetail').close(); playEpisode(series, info, episodeList, Math.max(0, resumeIndex), lastWatched.pos); };
    $('sFav').onclick = clickEvent => { clickEvent.target.textContent = toggleFav('series', series.k) ? '★ Favorito' : '☆ Favoritar'; };
    $('sClose').onclick = () => $('dDetail').close();
  };
  drawSeries();
}
/**
 * Toca um episódio de uma série. O contexto passado ao player mantém as propriedades
 * `s`, `info`, `flat` e `i`, lidas pelo player para avançar episódios.
 * @param {Item} series Série.
 * @param {Object} info Informações da série.
 * @param {Episodio[]} episodeList Todos os episódios em ordem.
 * @param {number} episodeIndex Índice do episódio em `episodeList`.
 * @param {number} [startPosition=0] Posição inicial em segundos.
 * @returns {void}
 */
function playEpisode(series, info, episodeList, episodeIndex, startPosition=0){
  const episode = episodeList[episodeIndex];
  playMedia({ kind:'series', ref:'ep:'+episode.id, series:'series:'+series.k, season:episode.season, num:episode.num, epId:episode.id, title:`${series.name} · T${episode.season}E${episode.num}`, logo:info.cover || series.logo, url:episode.url }, startPosition, { s: series, info, flat: episodeList, i: episodeIndex });
}

/**
 * Retoma um episódio pelo "Continuar assistindo": carrega a série inteira para o player
 * poder avançar e voltar episódios e mostrar a lista lateral. Se a série não for
 * encontrada, toca só o episódio salvo.
 * @param {Object} historyEntry Registro do histórico do episódio.
 * @returns {Promise<void>}
 */
async function resumeEpisode(historyEntry){
  const seriesKey = historyEntry.series.slice('series:'.length);
  const seriesAvailable = await ensureSection('series');
  const series = seriesAvailable && catalog.series.items.find(item => String(item.k) === seriesKey);
  if (!series) { playMedia(historyEntry.desc, historyEntry.pos); return; }
  loading('Carregando episódios…');
  const { info, episodeList } = await loadSeriesEpisodes(series);
  loading(null);
  const episodeIndex = episodeList.findIndex(episode => episode.id === historyEntry.epId);
  if (episodeIndex < 0) { playMedia(historyEntry.desc, historyEntry.pos); return; }
  playEpisode(series, info, episodeList, episodeIndex, historyEntry.pos);
}
