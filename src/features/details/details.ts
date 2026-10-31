import { $, $optional, query, queryAll } from '../../core/dom';
import { asRecords, isRecord, readNumber, readText } from '../../core/guards';
import { activeCatalog, isFav, state, toggleFav } from '../../core/state';
import type { Episode, Item, MediaDescriptor, ResumableEntry, SeriesInfo } from '../../core/types';
import { esc, formatTime, initials, loading, toast } from '../../core/utils';
import { ensureSection, xtreamApi, xtreamStreamUrl } from '../../data/xtream';
import { bindScrollArrows, scrollArrowsHtml } from '../../ui/scroll-arrows';
import { playMedia } from '../player/player';

/** Informações extras de um filme. */
interface MovieInfo {
  name?: string;
  plot?: string;
  cover?: string;
  year?: string;
  dur?: string;
  genre?: string;
  cast?: string;
  trailer?: string;
}

/** Informações e episódios de uma série, com temporadas e episódios em ordem. */
interface SeriesEpisodes {
  info: SeriesInfo;
  episodesBySeason: Record<string, Episode[]>;
  seasons: string[];
  episodeList: Episode[];
}

/**
 * Campo `info` de uma resposta da API Xtream.
 * @param response Resposta da API.
 * @returns Informações, ou um objeto vazio se não vierem.
 */
const readInfo = (response: unknown): Record<string, unknown> => (isRecord(response) && isRecord(response.info) ? response.info : {});

/**
 * Abre o diálogo de detalhes de um filme (busca informações extras no Xtream).
 * @param movie Filme.
 */
export async function openMovie(movie: Item): Promise<void> {
  const detailBody = $('detailBody');
  /**
   * Desenha o conteúdo do diálogo do filme.
   * @param info Informações extras (nome, sinopse, capa, ano, duração, gênero, elenco, trailer).
   */
  const drawMovie = (info: MovieInfo): void => {
    const historyEntry = state.userData.hist.find(entry => entry.ref === 'vod:' + movie.k);
    detailBody.innerHTML = `<div class="detail"><div class="poster">${initials(movie.name)}${info.cover || movie.logo ? `<img src="${esc(info.cover || movie.logo)}" alt="" onerror="this.remove()">` : ''}</div>
      <div style="display:flex;flex-direction:column;gap:10px;min-width:0"><h3>${esc(info.name || movie.name)}</h3>
      <div class="meta">${info.year ? `<span>${esc(info.year)}</span>` : ''}${info.dur ? `<span>${esc(info.dur)}</span>` : ''}${movie.rate ? `<span>★ ${(+movie.rate).toFixed(1)}</span>` : ''}${info.genre ? `<span>${esc(info.genre)}</span>` : ''}</div>
      ${info.plot ? `<p class="plot">${esc(info.plot)}</p>` : ''}${info.cast ? `<p class="hint">Elenco: ${esc(info.cast)}</p>` : ''}
      <div class="row" style="justify-content:flex-start">
        ${historyEntry && historyEntry.pos > 30 ? `<button class="btn primary" id="mResume">Continuar de ${formatTime(historyEntry.pos)}</button><button class="btn" id="mPlay">Do início</button>` : `<button class="btn primary" id="mPlay">Assistir</button>`}
        <button class="btn" id="mFav">${isFav('vod', movie.k) ? '★ Favorito' : '☆ Favoritar'}</button>
        ${info.trailer ? `<a class="btn" href="https://www.youtube.com/watch?v=${esc(info.trailer)}" target="_blank" rel="noopener">Trailer</a>` : ''}
        <button class="btn" id="mClose">Fechar</button>
      </div></div></div>`;
    const mediaDescriptor: MediaDescriptor = {
      kind: 'vod',
      ref: 'vod:' + movie.k,
      title: movie.name,
      logo: info.cover || movie.logo,
      url: movie.url || xtreamStreamUrl('movie', movie.k, movie.ext ?? 'mp4'),
    };
    $('mPlay').onclick = () => {
      $('dDetail').close();
      playMedia(mediaDescriptor, 0);
    };
    const resumeButton = $optional('mResume');
    if (resumeButton)
      resumeButton.onclick = () => {
        $('dDetail').close();
        playMedia(mediaDescriptor, historyEntry?.pos);
      };
    const favoriteButton = $('mFav');
    favoriteButton.onclick = () => {
      favoriteButton.textContent = toggleFav('vod', movie.k) ? '★ Favorito' : '☆ Favoritar';
    };
    $('mClose').onclick = () => $('dDetail').close();
  };
  drawMovie({});
  $('dDetail').showModal();
  if (state.activePlaylist?.type === 'xtream') {
    try {
      const response = await xtreamApi('get_vod_info', '&vod_id=' + movie.k);
      const vodInfo = readInfo(response);
      drawMovie({
        name: readText(vodInfo, 'name'),
        plot: readText(vodInfo, 'plot') || readText(vodInfo, 'description'),
        cover: readText(vodInfo, 'movie_image') || readText(vodInfo, 'cover_big'),
        year: readText(vodInfo, 'releasedate').slice(0, 4),
        dur: readText(vodInfo, 'duration'),
        genre: readText(vodInfo, 'genre'),
        cast: readText(vodInfo, 'cast'),
        trailer: readText(vodInfo, 'youtube_trailer'),
      });
    } catch {}
  }
}

/**
 * Carrega as informações e os episódios de uma série (da API Xtream ou da lista M3U),
 * com temporadas e episódios em ordem.
 * @param series Série.
 * @returns Dados da série.
 */
async function loadSeriesEpisodes(series: Item): Promise<SeriesEpisodes> {
  let info: SeriesInfo = { plot: series.plot, cover: series.logo };
  const episodesBySeason: Record<string, Episode[]> = {};
  if (state.activePlaylist?.type === 'xtream') {
    try {
      const response = await xtreamApi('get_series_info', '&series_id=' + series.k);
      const seriesInfo = readInfo(response);
      info = {
        plot: readText(seriesInfo, 'plot'),
        cover: readText(seriesInfo, 'cover') || series.logo,
        genre: readText(seriesInfo, 'genre'),
        year: (readText(seriesInfo, 'releaseDate') || readText(seriesInfo, 'release_date')).slice(0, 4),
        cast: readText(seriesInfo, 'cast'),
      };
      const apiSeasons = isRecord(response) && isRecord(response.episodes) ? response.episodes : {};
      for (const [seasonNumber, apiEpisodes] of Object.entries(apiSeasons))
        episodesBySeason[seasonNumber] = asRecords(apiEpisodes).map(apiEpisode => {
          const episodeInfo = isRecord(apiEpisode.info) ? apiEpisode.info : {};
          return {
            id: readText(apiEpisode, 'id'),
            title: readText(apiEpisode, 'title'),
            num: readNumber(apiEpisode, 'episode_num'),
            season: Number(seasonNumber),
            url: xtreamStreamUrl('series', readText(apiEpisode, 'id'), readText(apiEpisode, 'container_extension') || 'mp4'),
            img: readText(episodeInfo, 'movie_image'),
            dur: readText(episodeInfo, 'duration'),
          };
        });
    } catch {
      toast('Não consegui carregar os episódios.');
    }
  } else for (const episode of series.eps ?? []) (episodesBySeason[episode.season] = episodesBySeason[episode.season] ?? []).push(episode);
  const seasons = Object.keys(episodesBySeason).sort((firstSeason, secondSeason) => Number(firstSeason) - Number(secondSeason));
  seasons.forEach(seasonNumber =>
    episodesBySeason[seasonNumber]?.sort((firstEpisode, secondEpisode) => firstEpisode.num - secondEpisode.num),
  );
  const episodeList = seasons.reduce<Episode[]>(
    (allEpisodes, seasonNumber) => allEpisodes.concat(episodesBySeason[seasonNumber] ?? []),
    [],
  );
  return { info, episodesBySeason, seasons, episodeList };
}

/**
 * Abre o diálogo de detalhes de uma série com temporadas e episódios.
 * @param series Série.
 */
export async function openSeries(series: Item): Promise<void> {
  const detailBody = $('detailBody');
  detailBody.innerHTML = '<div class="spinner"></div>';
  $('dDetail').showModal();
  const { info, episodesBySeason, seasons, episodeList } = await loadSeriesEpisodes(series);
  const lastWatched = state.userData.hist.find(entry => !entry.hidden && entry.series === 'series:' + series.k);
  let selectedSeason = lastWatched ? String(lastWatched.season) : (seasons[0] ?? '');
  /**
   * Desenha o conteúdo do diálogo da série para a temporada selecionada.
   */
  const drawSeries = (): void => {
    const previousSeasonTabs = query(detailBody, '.stabs'),
      seasonTabsScroll = previousSeasonTabs ? previousSeasonTabs.scrollLeft : 0;
    detailBody.innerHTML = `<div class="detail"><div class="poster">${initials(series.name)}${info.cover ? `<img src="${esc(info.cover)}" alt="" onerror="this.remove()">` : ''}</div>
      <div style="display:flex;flex-direction:column;gap:10px;min-width:0"><h3>${esc(series.name)}</h3>
      <div class="meta">${info.year ? `<span>${esc(info.year)}</span>` : ''}<span>${seasons.length} temporada${seasons.length === 1 ? '' : 's'}</span>${info.genre ? `<span>${esc(info.genre)}</span>` : ''}</div>
      ${info.plot ? `<p class="plot">${esc(info.plot)}</p>` : ''}
      <div class="row" style="justify-content:flex-start">${lastWatched ? `<button class="btn primary" id="sResume">Continuar T${lastWatched.season}E${lastWatched.num}</button>` : ''}<button class="btn" id="sFav">${isFav('series', series.k) ? '★ Favorito' : '☆ Favoritar'}</button><button class="btn" id="sClose">Fechar</button></div>
      </div></div>
      ${
        seasons.length
          ? `<div class="stabs-row"><div class="stabs">${seasons.map(seasonNumber => `<button data-s="${seasonNumber}" class="${seasonNumber === selectedSeason ? 'on' : ''}">Temporada ${seasonNumber}</button>`).join('')}</div>${scrollArrowsHtml()}</div>
      <ul class="eps">${(episodesBySeason[selectedSeason] || [])
        .map((episode, index) => {
          const historyEntry = state.userData.hist.find(entry => entry.ref === 'ep:' + episode.id);
          return `<li data-e="${index}"><span class="num">${episode.num}</span><span class="nm"><b>${esc(episode.title)}</b>${historyEntry && historyEntry.dur ? `<div class="pg"><i style="width:${Math.min(100, (historyEntry.pos / historyEntry.dur) * 100)}%"></i></div>` : ''}</span><span class="hint">${esc(episode.dur || '')}</span></li>`;
        })
        .join('')}</ul>`
          : '<p class="empty">Nenhum episódio disponível.</p>'
      }`;
    const seasonTabs = query(detailBody, '.stabs'),
      seasonArrows = query(detailBody, '.stabs-row .scroll-arrows');
    if (seasonTabs && seasonArrows) {
      seasonTabs.scrollLeft = seasonTabsScroll;
      bindScrollArrows(seasonTabs, seasonArrows);
    }
    queryAll(detailBody, '[data-s]').forEach(seasonButton => {
      seasonButton.onclick = () => {
        selectedSeason = seasonButton.dataset.s ?? '';
        drawSeries();
      };
    });
    queryAll(detailBody, '[data-e]').forEach(episodeItem => {
      episodeItem.onclick = () => {
        const episode = episodesBySeason[selectedSeason]?.[Number(episodeItem.dataset.e)];
        if (!episode) return;
        $('dDetail').close();
        playEpisode(series, info, episodeList, episodeList.indexOf(episode));
      };
    });
    const resumeButton = $optional('sResume');
    if (resumeButton && lastWatched)
      resumeButton.onclick = () => {
        const resumeIndex = episodeList.findIndex(episode => episode.id === lastWatched.epId);
        $('dDetail').close();
        playEpisode(series, info, episodeList, Math.max(0, resumeIndex), lastWatched.pos);
      };
    const favoriteButton = $('sFav');
    favoriteButton.onclick = () => {
      favoriteButton.textContent = toggleFav('series', series.k) ? '★ Favorito' : '☆ Favoritar';
    };
    $('sClose').onclick = () => $('dDetail').close();
  };
  drawSeries();
}
/**
 * Toca um episódio de uma série. O contexto passado ao player mantém as propriedades
 * `s`, `info`, `flat` e `i`, lidas pelo player para avançar episódios.
 * @param series Série.
 * @param info Informações da série.
 * @param episodeList Todos os episódios em ordem.
 * @param episodeIndex Índice do episódio em `episodeList`.
 * @param startPosition Posição inicial em segundos.
 */
export function playEpisode(series: Item, info: SeriesInfo, episodeList: Episode[], episodeIndex: number, startPosition = 0): void {
  const episode = episodeList[episodeIndex];
  if (!episode) return;
  playMedia(
    {
      kind: 'series',
      ref: 'ep:' + episode.id,
      series: 'series:' + series.k,
      season: episode.season,
      num: episode.num,
      epId: episode.id,
      title: `${series.name} · T${episode.season}E${episode.num}`,
      logo: info.cover || series.logo,
      url: episode.url,
    },
    startPosition,
    { s: series, info, flat: episodeList, i: episodeIndex },
  );
}

/**
 * Retoma um episódio pelo "Continuar assistindo": carrega a série inteira para o player
 * poder avançar e voltar episódios e mostrar a lista lateral. Se a série não for
 * encontrada, toca só o episódio salvo.
 * @param historyEntry Registro do histórico do episódio.
 */
export async function resumeEpisode(historyEntry: ResumableEntry): Promise<void> {
  const seriesKey = (historyEntry.series ?? '').slice('series:'.length);
  const seriesAvailable = await ensureSection('series');
  const series = seriesAvailable ? activeCatalog().series?.items.find(item => String(item.k) === seriesKey) : undefined;
  if (!series) {
    playMedia(historyEntry.desc, historyEntry.pos);
    return;
  }
  loading('Carregando episódios…');
  const { info, episodeList } = await loadSeriesEpisodes(series);
  loading(null);
  const episodeIndex = episodeList.findIndex(episode => episode.id === historyEntry.epId);
  if (episodeIndex < 0) {
    playMedia(historyEntry.desc, historyEntry.pos);
    return;
  }
  playEpisode(series, info, episodeList, episodeIndex, historyEntry.pos);
}
