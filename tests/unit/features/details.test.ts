import { type AppModules, bootApp, element, flush, openCatalog } from '../support/boot';
import {
  catalog,
  historyEntry,
  mediaDescriptor,
  movie,
  sectionData,
  series,
  userData,
  XTREAM_STORAGE,
  xtreamHandler,
} from '../support/fixtures';

/**
 * Abre os detalhes num catálogo Xtream.
 * @param overrides Respostas da API a trocar.
 * @returns Módulos do app.
 */
const bootXtream = (overrides: Record<string, unknown> = {}): Promise<AppModules> =>
  bootApp({ storage: XTREAM_STORAGE, fetch: xtreamHandler(overrides) });

describe('detalhes', () => {
  describe('filme', () => {
    it('mostra os dados e toca do início', async () => {
      const app = await bootApp();
      const item = movie(1, { logo: 'http://img.test/f.png', rate: 7.5 });
      openCatalog(app, catalog(), userData());
      await app.details.openMovie(item);
      expect(element('#dDetail').hasAttribute('open')).toBe(true);
      expect(element('#detailBody').textContent).toContain('Filme 1');
      expect(element('#detailBody').textContent).toContain('★ 7.5');
      expect(element('#detailBody img').getAttribute('src')).toBe('http://img.test/f.png');
      expect(element('#mPlay').textContent).toBe('Assistir');
      element('#mPlay').click();
      expect(element('#dDetail').hasAttribute('open')).toBe(false);
      expect(element('#plTitle').textContent).toBe('Filme 1');
      expect(app.playback.playback.currentMedia?.resume).toBe(0);
    });

    it('filme sem capa nem nota', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData());
      await app.details.openMovie(movie(1, { rate: 0 }));
      expect(document.querySelector('#detailBody img')).toBeNull();
      expect(element('#detailBody').textContent).not.toContain('★');
    });

    it('oferece continuar de onde parou', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData({ hist: [historyEntry({ ref: 'vod:m1', pos: 300 })] }));
      await app.details.openMovie(movie(1));
      expect(element('#mResume').textContent).toBe('Continuar de 5:00');
      expect(element('#mPlay').textContent).toBe('Do início');
      element('#mResume').click();
      expect(app.playback.playback.currentMedia?.resume).toBe(300);
    });

    it('menos de 30 s assistidos não oferece continuar', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData({ hist: [historyEntry({ ref: 'vod:m1', pos: 10 })] }));
      await app.details.openMovie(movie(1));
      expect(document.getElementById('mResume')).toBeNull();
    });

    it('alterna o favorito e fecha', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData());
      await app.details.openMovie(movie(1));
      expect(element('#mFav').textContent).toBe('☆ Favoritar');
      element('#mFav').click();
      expect(element('#mFav').textContent).toBe('★ Favorito');
      element('#mFav').click();
      expect(element('#mFav').textContent).toBe('☆ Favoritar');
      element('#mClose').click();
      expect(element('#dDetail').hasAttribute('open')).toBe(false);
    });

    it('já favorito', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData({ fav: { live: [], vod: ['m1'], series: [] } }));
      await app.details.openMovie(movie(1));
      expect(element('#mFav').textContent).toBe('★ Favorito');
    });

    it('completa com os dados do Xtream', async () => {
      const app = await bootXtream({
        get_vod_info: {
          info: {
            name: 'Nome Xtream',
            plot: 'Sinopse',
            movie_image: 'http://img.test/c.png',
            releasedate: '2020-01-01',
            duration: '01:40:00',
            genre: 'Ação',
            cast: 'Fulano',
            youtube_trailer: 'abc',
          },
        },
      });
      await app.details.openMovie(movie(30, { k: '30', url: undefined, ext: 'mkv' }));
      const body = element('#detailBody').textContent;
      expect(body).toContain('Nome Xtream');
      expect(body).toContain('2020');
      expect(body).toContain('01:40:00');
      expect(body).toContain('Ação');
      expect(body).toContain('Sinopse');
      expect(body).toContain('Elenco: Fulano');
      expect(element('#detailBody a').getAttribute('href')).toBe('https://www.youtube.com/watch?v=abc');
      element('#mPlay').click();
      expect(app.playback.playback.currentMedia?.url).toBe('http://iptv.test:8080/movie/usu%C3%A1rio/se%20nha/30.mkv');
    });

    it('usa os campos alternativos do Xtream e a extensão padrão', async () => {
      const app = await bootXtream({ get_vod_info: { info: { description: 'Descrição', cover_big: 'http://img.test/b.png' } } });
      await app.details.openMovie(movie(31, { k: '31', url: undefined, name: 'Sem Nome', ext: undefined }));
      expect(element('#detailBody').textContent).toContain('Descrição');
      expect(element('#detailBody img').getAttribute('src')).toBe('http://img.test/b.png');
      element('#mPlay').click();
      expect(app.playback.playback.currentMedia?.url).toContain('/31.mp4');
    });

    it('resposta sem informações mantém o básico', async () => {
      const app = await bootXtream({ get_vod_info: null });
      await app.details.openMovie(movie(1));
      expect(element('#detailBody').textContent).toContain('Filme 1');
    });

    it('erro na API mantém o básico', async () => {
      const app = await bootXtream({ get_vod_info: new Response('', { status: 500 }) });
      await app.details.openMovie(movie(1));
      expect(element('#detailBody').textContent).toContain('Filme 1');
    });
  });

  describe('série', () => {
    it('mostra os dados, temporadas e episódios da lista M3U', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData());
      await app.details.openSeries(series(1));
      expect(element('#detailBody').textContent).toContain('2 temporadas');
      expect(element('#detailBody').textContent).toContain('Sinopse');
      expect(element('#detailBody img').getAttribute('src')).toBe('http://img.test/s.png');
      expect(document.querySelectorAll('.stabs button')).toHaveLength(2);
      expect(document.querySelectorAll('.eps li')).toHaveLength(2);
      expect(element('.eps').textContent).toContain('40 min');
      expect(element('.stabs button').classList.contains('on')).toBe(true);
    });

    it('uma temporada só, sem capa', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData());
      await app.details.openSeries(
        series(2, { logo: undefined, plot: undefined, eps: [{ id: 'e1', title: 'Único', season: 1, num: 1, url: 'http://x' }] }),
      );
      expect(element('#detailBody').textContent).toContain('1 temporada');
      expect(document.querySelector('#detailBody img')).toBeNull();
    });

    it('sem episódios avisa', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData());
      await app.details.openSeries(series(3, { eps: undefined }));
      expect(element('#detailBody').textContent).toContain('Nenhum episódio disponível.');
    });

    it('troca de temporada mantendo a rolagem das abas', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData());
      await app.details.openSeries(series(1));
      element('.stabs').scrollLeft = 30;
      element('[data-s="2"]').click();
      expect(document.querySelectorAll('.eps li')).toHaveLength(1);
      expect(element('.eps').textContent).toContain('Episódio 3');
      expect(element('.stabs').scrollLeft).toBe(30);
      expect(element('[data-s="2"]').classList.contains('on')).toBe(true);
    });

    it('aba sem número mostra lista vazia', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData());
      await app.details.openSeries(series(1));
      delete element('[data-s="2"]').dataset.s;
      element('.stabs button:last-child').click();
      expect(document.querySelectorAll('.eps li')).toHaveLength(0);
    });

    it('toca um episódio com o contexto da série', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData());
      await app.details.openSeries(series(1));
      element('[data-e="1"]').click();
      expect(element('#dDetail').hasAttribute('open')).toBe(false);
      const media = app.playback.playback.currentMedia;
      expect(media?.ctx?.i).toBe(1);
      expect(media?.desc?.title).toBe('Série 1 · T1E2');
    });

    it('ignora episódio inválido', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData());
      await app.details.openSeries(series(1));
      element('[data-e="1"]').dataset.e = '9';
      element('[data-e="9"]').click();
      expect(element('#player').hidden).toBe(true);
    });

    it('mostra o progresso e continua o último episódio', async () => {
      const app = await bootApp();
      const desc = mediaDescriptor({ kind: 'series' });
      openCatalog(
        app,
        catalog(),
        userData({
          hist: [
            historyEntry({ ref: 'ep:e3', series: 'series:s1', season: 2, num: 1, epId: 'e3', pos: 120, desc }),
            historyEntry({ ref: 'ep:e1', hidden: true, pos: 500, dur: 1000 }),
            historyEntry({ ref: 'ep:e2', hidden: true, pos: 0, dur: 0 }),
          ],
        }),
      );
      await app.details.openSeries(series(1));
      expect(element('[data-s="2"]').classList.contains('on')).toBe(true);
      expect(element('#sResume').textContent).toBe('Continuar T2E1');
      element('[data-s="1"]').click();
      expect(element('.eps .pg i').style.width).toBe('50%');
      element('#sResume').click();
      const media = app.playback.playback.currentMedia;
      expect(media?.ctx?.i).toBe(2);
      expect(media?.resume).toBe(120);
    });

    it('episódio do histórico que sumiu começa do primeiro', async () => {
      const app = await bootApp();
      openCatalog(
        app,
        catalog(),
        userData({ hist: [historyEntry({ ref: 'ep:x', series: 'series:s1', season: 1, num: 9, epId: 'sumiu' })] }),
      );
      await app.details.openSeries(series(1));
      element('#sResume').click();
      expect(app.playback.playback.currentMedia?.ctx?.i).toBe(0);
    });

    it('alterna o favorito e fecha', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData({ fav: { live: [], vod: [], series: ['s1'] } }));
      await app.details.openSeries(series(1));
      expect(element('#sFav').textContent).toBe('★ Favorito');
      element('#sFav').click();
      expect(element('#sFav').textContent).toBe('☆ Favoritar');
      element('#sClose').click();
      expect(element('#dDetail').hasAttribute('open')).toBe(false);
    });

    const seriesInfo = {
      info: { plot: 'Resumo', cover: 'http://img.test/x.png', genre: 'Drama', releaseDate: '2021-05-01', cast: 'Elenco' },
      episodes: {
        2: [
          {
            id: 21,
            title: 'E21',
            episode_num: 1,
            container_extension: 'mkv',
            info: { movie_image: 'http://img.test/e.png', duration: '45 min' },
          },
        ],
        1: [
          { id: 12, title: 'E12', episode_num: '2' },
          { id: 11, title: 'E11', episode_num: 1 },
        ],
      },
    };

    it('carrega do Xtream, em ordem', async () => {
      const app = await bootXtream({ get_series_info: seriesInfo });
      await app.details.openSeries(series(50, { k: '50', eps: undefined }));
      expect(element('#detailBody').textContent).toContain('2021');
      expect(element('#detailBody').textContent).toContain('Drama');
      expect(element('#detailBody img').getAttribute('src')).toBe('http://img.test/x.png');
      expect([...document.querySelectorAll('.eps li b')].map(title => title.textContent)).toEqual(['E11', 'E12']);
      element('[data-s="2"]').click();
      expect(element('.eps').textContent).toContain('45 min');
      element('[data-e="0"]').click();
      expect(app.playback.playback.currentMedia?.url).toBe('http://iptv.test:8080/series/usu%C3%A1rio/se%20nha/21.mkv');
    });

    it('usa os campos alternativos do Xtream', async () => {
      const app = await bootXtream({ get_series_info: { info: { release_date: '1999' } } });
      await app.details.openSeries(series(50, { k: '50', eps: undefined, logo: 'http://img.test/l.png' }));
      expect(element('#detailBody').textContent).toContain('1999');
      expect(element('#detailBody img').getAttribute('src')).toBe('http://img.test/l.png');
    });

    it('avisa se não conseguir carregar os episódios', async () => {
      const app = await bootXtream({ get_series_info: new Response('', { status: 500 }) });
      await app.details.openSeries(series(50, { eps: undefined }));
      expect(element('#toast').textContent).toBe('Não consegui carregar os episódios.');
      expect(element('#detailBody').textContent).toContain('Nenhum episódio disponível.');
    });
  });

  describe('retomar episódio pelo Continuar assistindo', () => {
    const desc = mediaDescriptor({ kind: 'series', ref: 'ep:e2', series: 'series:s1', epId: 'e2' });

    it('carrega a série inteira', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData());
      await app.details.resumeEpisode({ ...historyEntry({ ...desc, desc }), desc });
      const media = app.playback.playback.currentMedia;
      expect(media?.ctx?.i).toBe(1);
      expect(media?.resume).toBe(300);
      expect(element('#loading').hidden).toBe(true);
    });

    it('sem a série toca só o episódio salvo', async () => {
      const app = await bootApp();
      openCatalog(app, catalog({ series: sectionData([]) }), userData());
      await app.details.resumeEpisode({ ...historyEntry({ ...desc, desc }), desc });
      expect(app.playback.playback.currentMedia?.ctx).toBeNull();
      expect(app.playback.playback.currentMedia?.url).toBe(desc.url);
    });

    it('sem o episódio na série toca só o salvo', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData());
      await app.details.resumeEpisode({ ...historyEntry({ ...desc, epId: 'sumiu', desc }), desc });
      expect(app.playback.playback.currentMedia?.ctx).toBeNull();
    });

    it('registro sem referência da série toca só o salvo', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData());
      await app.details.resumeEpisode({ ...historyEntry({ desc }), series: undefined, desc });
      expect(app.playback.playback.currentMedia?.ctx).toBeNull();
    });

    it('seção de séries indisponível toca só o salvo', async () => {
      const app = await bootXtream({ get_series: new Response('', { status: 500 }) });
      await app.details.resumeEpisode({ ...historyEntry({ ...desc, desc }), desc });
      await flush();
      expect(app.playback.playback.currentMedia?.ctx).toBeNull();
    });
  });

  it('playEpisode ignora posição inválida', async () => {
    const app = await bootApp();
    openCatalog(app, catalog(), userData());
    app.details.playEpisode(series(1), {}, [], 3);
    expect(element('#player').hidden).toBe(true);
  });

  it('série sem capa nos detalhes usa o logo', async () => {
    const app = await bootApp();
    openCatalog(app, catalog(), userData());
    app.details.playEpisode(series(1), { cover: 'http://img.test/capa.png' }, series(1).eps ?? [], 0);
    expect(app.playback.playback.currentMedia?.desc).toMatchObject({ logo: 'http://img.test/capa.png' });
  });
});
