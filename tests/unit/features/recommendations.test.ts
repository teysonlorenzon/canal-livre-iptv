import { bootApp, openCatalog } from '../support/boot';
import { catalog, historyEntry, movie, sectionData, series, userData } from '../support/fixtures';

const DAY_SECONDS = 86400;

describe('recomendações', () => {
  it('sem histórico não recomenda nada', async () => {
    const app = await bootApp();
    openCatalog(app, catalog(), userData());
    expect(app.recommendations.recommendedItems('vod')).toEqual({ items: [], reason: '' });
  });

  it('sem a seção não recomenda nada', async () => {
    const app = await bootApp();
    openCatalog(app, catalog({ vod: null }), userData({ hist: [historyEntry()] }));
    expect(app.recommendations.recommendedItems('vod').items).toEqual([]);
    app.state.state.catalog = null;
    expect(app.recommendations.recommendedItems('vod').items).toEqual([]);
  });

  it('recomenda a mesma categoria, sem o que já foi visto nem outras versões dele', async () => {
    const app = await bootApp();
    const vod = sectionData([movie(1, { name: 'Batman' }), movie(2, { name: 'Batman [4K]' }), movie(3, { name: 'Superman' })], {
      acao: 'Ação',
    });
    openCatalog(app, catalog({ vod }), userData({ hist: [historyEntry({ ref: 'vod:m1', pos: 950 })] }));
    const { items, reason } = app.recommendations.recommendedItems('vod');
    expect(items.map(item => item.name)).toEqual(['Superman']);
    expect(reason).toBe('Porque você assistiu “Batman”');
  });

  it('o motivo cita "e outros" e o título mais visto', async () => {
    const app = await bootApp();
    const vod = sectionData([movie(1), movie(2), movie(3)], { acao: 'Ação' });
    openCatalog(
      app,
      catalog({ vod }),
      userData({ hist: [historyEntry({ ref: 'vod:m1', pos: 100 }), historyEntry({ ref: 'vod:m2', pos: 990 })] }),
    );
    expect(app.recommendations.recommendedItems('vod').reason).toBe('Porque você assistiu “Filme 2” e outros');
  });

  it('gêneros valem entre filmes e séries', async () => {
    const app = await bootApp();
    const vod = sectionData([movie(1, { cat: 'terror-vod' })], { 'terror-vod': 'Filmes | Terror 4K' });
    const seriesData = sectionData([series(1, { cat: 'terror-series', eps: [] }), series(2, { cat: 'drama' })], {
      'terror-series': 'Séries Terror',
      drama: 'Drama',
    });
    openCatalog(app, catalog({ vod, series: seriesData }), userData({ hist: [historyEntry({ ref: 'vod:m1', pos: 900 })] }));
    const { items, reason } = app.recommendations.recommendedItems('series');
    expect(items.map(item => item.k)).toEqual(['s1']);
    expect(reason).toBe('Com base no que você assistiu');
  });

  it('palavras do título ligam franquias de outras categorias', async () => {
    const app = await bootApp();
    const vod = sectionData(
      [
        movie(1, { name: 'Velozes e Furiosos', cat: 'a' }),
        movie(2, { name: 'Velozes e Furiosos 2', cat: 'b' }),
        movie(3, { name: 'Outro título', cat: 'b' }),
      ],
      { a: 'Ação', b: 'Filmes' },
    );
    openCatalog(app, catalog({ vod, series: sectionData([]) }), userData({ hist: [historyEntry({ ref: 'vod:m1', pos: 900 })] }));
    expect(app.recommendations.recommendedItems('vod').items.map(item => item.k)).toEqual(['m2']);
  });

  it('palavras comuns demais não ligam títulos', async () => {
    const app = await bootApp();
    const manyMovies = Array.from({ length: 30 }, (_, index) =>
      movie(index, { name: 'Palavra ' + 'abcdefghijklmnopqrstuvwxyzáéíó'.charAt(index), cat: 'b' }),
    );
    const vod = sectionData([movie(100, { name: 'Palavra Única', cat: 'a' }), ...manyMovies], { a: 'Lançamentos', b: 'Filmes' });
    openCatalog(app, catalog({ vod, series: sectionData([]) }), userData({ hist: [historyEntry({ ref: 'vod:m100', pos: 900 })] }));
    expect(app.recommendations.recommendedItems('vod').items).toEqual([]);
  });

  it('sem ligação nenhuma com o histórico não recomenda', async () => {
    const app = await bootApp();
    const vod = sectionData([movie(1, { name: '123', cat: 'a' }), movie(2, { name: 'Outro', cat: 'b' })], { a: 'Filmes', b: 'Séries' });
    openCatalog(
      app,
      catalog({ vod, series: sectionData([]) }),
      userData({
        hist: [historyEntry({ ref: 'vod:sumiu' }), historyEntry({ ref: 'outro:1' }), historyEntry({ ref: 'vod:m2', hidden: true })],
      }),
    );
    expect(app.recommendations.recommendedItems('vod').items).toEqual([]);
  });

  it('título visto sem categoria conhecida ainda recomenda', async () => {
    const app = await bootApp();
    const vod = sectionData([movie(1, { name: 'Trilogia', cat: 'sumiu' }), movie(2, { name: 'Trilogia Volta', cat: 'b' })], {
      b: 'Filmes',
    });
    openCatalog(app, catalog({ vod, series: null }), userData({ hist: [historyEntry({ ref: 'vod:m1', pos: 900, t: undefined })] }));
    expect(app.recommendations.recommendedItems('vod').items.map(item => item.k)).toEqual(['m2']);
  });

  it('série vista sem a seção de filmes baixada', async () => {
    const app = await bootApp();
    openCatalog(
      app,
      catalog({ vod: null }),
      userData({ hist: [historyEntry({ ref: 'ep:1', series: 'series:s1' }), historyEntry({ ref: 'ep:2', series: 'series:sumiu' })] }),
    );
    expect(app.recommendations.recommendedItems('series').items).toEqual([]);
  });

  it('progresso: histórico sem duração pesa o mínimo; assistidos há muito tempo pesam menos', async () => {
    const app = await bootApp();
    const vod = sectionData([movie(1, { cat: 'a' }), movie(2, { cat: 'b' }), movie(3, { cat: 'a' }), movie(4, { cat: 'b' })], {
      a: 'Ação',
      b: 'Drama',
    });
    const oldDate = Date.now() - 300 * DAY_SECONDS * 1000;
    openCatalog(
      app,
      catalog({ vod, series: sectionData([]) }),
      userData({ hist: [historyEntry({ ref: 'vod:m1', dur: 0, pos: 0, t: oldDate }), historyEntry({ ref: 'vod:m2', dur: 100, pos: 95 })] }),
    );
    expect(app.recommendations.recommendedItems('vod').items.map(item => item.k)).toEqual(['m4', 'm3']);
  });

  it('prefere novidades e títulos bem avaliados', async () => {
    const app = await bootApp();
    const now = Date.now() / 1000;
    const vod = sectionData(
      [
        movie(1, { name: 'Visto' }),
        movie(2, { name: 'Antigo', rate: 0, added: undefined }),
        movie(3, { name: 'Bem avaliado', rate: 9, added: now - 400 * DAY_SECONDS }),
        movie(4, { name: 'Novo', rate: undefined, added: now - DAY_SECONDS }),
        movie(5, { name: 'Do futuro', rate: 0, added: now + DAY_SECONDS }),
      ],
      { acao: 'Ação' },
    );
    openCatalog(app, catalog({ vod, series: sectionData([]) }), userData({ hist: [historyEntry({ ref: 'vod:m1', pos: 950 })] }));
    expect(app.recommendations.recommendedItems('vod').items.map(item => item.name)).toEqual([
      'Bem avaliado',
      'Novo',
      'Antigo',
      'Do futuro',
    ]);
  });

  it('deixa de fora categorias ocultas, bloqueadas e adultas', async () => {
    const app = await bootApp();
    const vod = sectionData(
      [
        movie(1, { cat: 'a' }),
        movie(2, { cat: 'a' }),
        movie(3, { cat: 'oculta' }),
        movie(4, { cat: 'bloqueada' }),
        movie(5, { cat: 'xxx' }),
      ],
      { a: 'Ação', oculta: 'Ação Oculta', bloqueada: 'Ação Bloqueada', xxx: 'Ação Adultos' },
    );
    openCatalog(
      app,
      catalog({ vod, series: sectionData([]) }),
      userData({ hist: [historyEntry({ ref: 'vod:m1', pos: 950 })], hidden: ['vod:oculta'], locked: ['vod:bloqueada'] }),
    );
    expect(app.recommendations.recommendedItems('vod').items.map(item => item.k)).toEqual(['m2']);
  });

  it('limita a 6 por categoria e 20 no total', async () => {
    const app = await bootApp();
    const titles = 'abcdefghijklmnopqrstuvwxyz'.split('');
    const moviesByCategory = ['a', 'b', 'c', 'd', 'e'].flatMap(category =>
      titles.slice(0, 8).map(letter => movie(0, { k: category + letter, name: `Título ${category}${letter}`, cat: category })),
    );
    const vod = sectionData([movie(1, { name: 'Visto', cat: 'a' }), ...moviesByCategory], {
      a: 'Ação',
      b: 'Ação 2',
      c: 'Ação 3',
      d: 'Ação 4',
      e: 'Ação 5',
    });
    openCatalog(app, catalog({ vod, series: sectionData([]) }), userData({ hist: [historyEntry({ ref: 'vod:m1', pos: 950 })] }));
    const { items } = app.recommendations.recommendedItems('vod');
    expect(items).toHaveLength(20);
    expect(items.filter(item => item.cat === 'a')).toHaveLength(6);
  });

  it('reaproveita o resultado até o histórico mudar', async () => {
    const app = await bootApp();
    const vod = sectionData([movie(1), movie(2)], { acao: 'Ação' });
    openCatalog(app, catalog({ vod, series: sectionData([]) }), userData({ hist: [historyEntry({ ref: 'vod:m1', pos: 950 })] }));
    const first = app.recommendations.recommendedItems('vod');
    expect(app.recommendations.recommendedItems('vod')).toBe(first);
    app.state.state.userData.hist.unshift(historyEntry({ ref: 'vod:m2', t: Date.now() + 1000 }));
    expect(app.recommendations.recommendedItems('vod')).not.toBe(first);
    const empty = sectionData([movie(1, { name: '123', cat: 'x' })], { x: 'Filmes' });
    openCatalog(app, catalog({ vod: empty, series: sectionData([]) }), userData({ hist: [historyEntry({ ref: 'vod:outro' })] }));
    expect(app.recommendations.recommendedItems('vod')).toEqual({ items: [], reason: '' });
    expect(app.recommendations.recommendedItems('vod')).toEqual({ items: [], reason: '' });
  });

  it('normaliza nomes de títulos', async () => {
    const { recommendations } = await bootApp();
    expect(recommendations.topNameKey('Filme (2020) [4K] Dublado')).toBe('filme');
  });

  it('categorias visíveis sem catálogo', async () => {
    const app = await bootApp();
    app.state.state.catalog = null;
    expect(app.recommendations.visibleCategoryIds('vod').size).toBe(0);
  });
});
