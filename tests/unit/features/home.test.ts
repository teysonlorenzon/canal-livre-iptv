import { advance, bootApp, element, flush, openCatalog, setPageUrl } from '../support/boot';
import {
  catalog,
  channel,
  historyEntry,
  mediaDescriptor,
  movie,
  sectionData,
  series,
  userData,
  XTREAM_STORAGE,
  xtreamHandler,
} from '../support/fixtures';

const PAGE_URL = 'http://127.0.0.1:8765/';
const SECONDS_IN_DAY = 86400;

describe('tela inicial', () => {
  afterEach(() => setPageUrl(PAGE_URL));

  describe('sem lista aberta', () => {
    it('convida a adicionar uma lista', async () => {
      await bootApp({ storage: { pls: [] } });
      expect(element('#home').textContent).toContain('Adicione sua lista IPTV');
      element('#wAdd').click();
      expect(element('#dSettings').hasAttribute('open')).toBe(true);
    });

    it('avisa sobre https', async () => {
      setPageUrl('https://zapp.test/');
      await bootApp({ storage: { pls: [] } });
      expect(element('#home').textContent).toContain('Atenção: esta página está aberta em https');
    });

    it('fica vazia enquanto a lista carrega', async () => {
      await bootApp({
        storage: { pls: [{ id: 'l', name: 'L', type: 'm3u', url: 'http://l.test' }] },
        fetch: () => new Promise<Response>(() => undefined),
      });
      expect(element('#home').textContent).toBe('');
    });
  });

  describe('relógio, tema e início', () => {
    it('atualiza os relógios', async () => {
      await bootApp();
      await advance(1000);
      expect(element('#clock').textContent).toMatch(/^12:00$/);
      expect(element('#plClock').textContent).toBe(element('#clock').textContent);
    });

    it('o botão de tema alterna, avisa e atualiza o ícone', async () => {
      await bootApp();
      expect(element('#themeBtn').title).toBe('Tema: Automático (sistema)');
      element('#themeBtn').click();
      expect(document.documentElement.dataset.theme).toBe('light');
      expect(element('#themeBtn').title).toBe('Tema: Claro');
      expect(element('#themeBtn').getAttribute('aria-label')).toBe('Tema: Claro');
      expect(element('#toast').textContent).toBe('Tema: Claro');
    });

    it('o logo volta para o início', async () => {
      await bootApp();
      element('[data-sec="live"]').click();
      await flush();
      expect(element('#home').hidden).toBe(true);
      element('#goHome').click();
      expect(element('#home').hidden).toBe(false);
      expect(element('#section').hidden).toBe(true);
    });
  });

  describe('blocos das seções', () => {
    it('conta os itens visíveis', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData({ hidden: ['vod:acao'] }));
      expect(element('[data-sec="live"]').textContent).toContain('3 canais');
      expect(element('[data-sec="vod"]').textContent).toContain('0 títulos');
      expect(element('[data-sec="series"]').textContent).toContain('1 séries');
    });

    it('seção ainda não baixada pede para tocar', async () => {
      const app = await bootApp();
      openCatalog(app, catalog({ vod: null }));
      expect(element('[data-sec="vod"]').textContent).toContain('Toque para carregar');
    });

    it('abre a seção', async () => {
      await bootApp();
      element('[data-sec="live"]').click();
      await flush();
      expect(element('#section').hidden).toBe(false);
      expect(element('#secTitle').textContent).toBe('TV ao vivo');
    });

    it('ignora blocos com seção desconhecida', async () => {
      await bootApp();
      element('[data-sec="live"]').dataset.sec = 'outra';
      element('[data-sec="outra"]').click();
      await flush();
      expect(element('#section').hidden).toBe(true);
    });
  });

  describe('dados da conta', () => {
    it('mostra os dados da conta Xtream', async () => {
      await bootApp({ storage: XTREAM_STORAGE, fetch: xtreamHandler() });
      const account = element('.acct').textContent;
      expect(account).toContain('Status Active');
      expect(account).toContain('Vence 01/01/2030');
      expect(account).toContain('Conexões 1/2');
      expect(account).toContain('Usuário teste');
    });

    it('conta sem vencimento é ilimitada', async () => {
      const app = await bootApp();
      openCatalog(
        app,
        catalog({ account: { status: 'Active', expiresAt: 0, activeConnections: '0', maxConnections: '1', username: 'x' } }),
      );
      expect(element('.acct').textContent).toContain('Vence Ilimitado');
    });
  });

  describe('prateleiras de canais', () => {
    it('mostra favoritos e recentes e ignora os que saíram da lista', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData({ fav: { live: ['c2', 'sumiu'], vod: [], series: [] }, recentLive: ['c1', 'sumiu'] }));
      expect(element('.shelf-recent .strip').textContent).toContain('Canal 1');
      expect(element('.shelf-recent .shelf-n').textContent).toBe('1');
      expect(element('.shelf-fav .strip').textContent).toContain('Canal 2');
    });

    it('mostra o estado vazio', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData());
      expect(element('.shelf-recent').textContent).toContain('Os canais que você assistir aparecem aqui.');
      expect(element('.shelf-fav').textContent).toContain('Toque na estrela');
    });

    it('mostra o logo do canal', async () => {
      const app = await bootApp();
      openCatalog(app, catalog({ live: sectionData([channel(1, { logo: 'http://img.test/1.png' })]) }), userData({ recentLive: ['c1'] }));
      expect(element('.shelf-recent img').getAttribute('src')).toBe('http://img.test/1.png');
    });

    it('tocar num canal abre o player', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData({ recentLive: ['c1'] }));
      element('.shelf-recent .card').click();
      expect(element('#player').hidden).toBe(false);
      expect(element('#plTitle').textContent).toContain('Canal 1');
    });

    it('remover um canal recente', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData({ recentLive: ['c1'] }));
      element('.shelf-recent .card-del').click();
      expect(app.state.state.userData.recentLive).toEqual([]);
      expect(element('#toast').textContent).toBe('Removido do histórico.');
      expect(element('#player').hidden).toBe(true);
    });

    it('ignora o botão de remover fora de um cartão', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData({ recentLive: ['c1'] }));
      const removeButton = element('.shelf-recent .card-del');
      element('.shelf-recent').appendChild(removeButton);
      removeButton.click();
      expect(app.state.state.userData.recentLive).toEqual(['c1']);
    });
  });

  describe('continuar assistindo', () => {
    const episodeDesc = mediaDescriptor({
      kind: 'series',
      ref: 'ep:e2',
      series: 'series:s1',
      season: 1,
      num: 2,
      epId: 'e2',
      title: 'Série 1 · T1E2',
    });

    it('lista só o que dá para retomar e falta terminar', async () => {
      const app = await bootApp();
      openCatalog(
        app,
        catalog(),
        userData({
          hist: [
            historyEntry({ title: 'Em andamento', logo: 'http://img.test/a.png' }),
            historyEntry({ ref: 'vod:fim', title: 'Terminado', pos: 990 }),
            historyEntry({ ref: 'ep:x', title: 'Oculto', hidden: true }),
            historyEntry({ ref: 'vod:y', title: 'Sem mídia', desc: undefined }),
            historyEntry({ ref: 'vod:z', title: 'Sem duração', dur: 0 }),
            { ref: 'vod:w', pos: 1, dur: 10, desc: mediaDescriptor() },
          ],
        }),
      );
      const shelf = element('.shelf-cont');
      expect(shelf.querySelectorAll('.card')).toHaveLength(2);
      expect(shelf.textContent).toContain('Em andamento');
      expect(element('.shelf-cont .pg').style.width).toBe('30%');
    });

    it('retoma um filme de onde parou', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData({ hist: [historyEntry()] }));
      element('.shelf-cont .card').click();
      expect(element('#player').hidden).toBe(false);
      expect(element('#plTitle').textContent).toBe('Filme 1');
      expect(app.playback.playback.currentMedia?.resume).toBe(300);
    });

    it('retoma um episódio carregando a série', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData({ hist: [historyEntry({ ...episodeDesc, desc: episodeDesc })] }));
      element('.shelf-cont .card').click();
      await flush();
      await flush();
      expect(app.playback.playback.currentMedia?.ctx?.flat).toHaveLength(3);
    });

    it('ignora cartão com posição inválida', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData({ hist: [historyEntry()] }));
      element('.shelf-cont .card').dataset.cont = '9';
      element('.shelf-cont .card').click();
      expect(element('#player').hidden).toBe(true);
    });

    it('remove do histórico', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData({ hist: [historyEntry()] }));
      element('.shelf-cont .card-del').click();
      expect(app.state.state.userData.hist).toEqual([]);
    });
  });

  describe('Top 10 da semana', () => {
    const week = (daysAgo: number): number => Date.now() / 1000 - daysAgo * SECONDS_IN_DAY;

    it('usa a categoria de destaque da lista, priorizando "da semana"', async () => {
      const app = await bootApp();
      openCatalog(
        app,
        catalog({
          vod: sectionData(
            [
              movie(1, { cat: 'top' }),
              movie(2, { cat: 'semana' }),
              movie(3, { cat: 'semana', name: 'Filme 2 [4K]' }),
              movie(4, { cat: 'alta' }),
            ],
            { alta: 'Em alta', top: 'Top 10', semana: 'Mais vistos da semana', acao: 'Ação' },
          ),
        }),
      );
      const shelf = element('.shelf-topvod');
      expect(shelf.textContent).toContain('Top 10 filmes da semana');
      expect(shelf.textContent).toContain('Da categoria “Mais vistos da semana” da sua lista');
      expect(shelf.querySelectorAll('.card')).toHaveLength(1);
      expect(shelf.querySelector('.top-rank')?.textContent).toBe('1');
    });

    it('sem categoria de destaque usa os adicionados na semana, sem categorias ocultas, bloqueadas ou adultas', async () => {
      const app = await bootApp();
      openCatalog(
        app,
        catalog({
          series: sectionData(
            [
              series(1, { added: week(1), rate: 5 }),
              series(2, { added: week(1), rate: 9 }),
              series(3, { added: week(3), name: 'Antiga' }),
              series(4, { added: week(30) }),
              series(5, { added: week(1), cat: 'oculta' }),
              series(6, { added: week(1), cat: 'bloqueada' }),
              series(7, { added: week(1), cat: 'adulto' }),
            ],
            { drama: 'Drama', oculta: 'Oculta', bloqueada: 'Bloqueada', adulto: 'Adultos XXX' },
          ),
        }),
        userData({ hidden: ['series:oculta'], locked: ['series:bloqueada'] }),
      );
      const shelf = element('.shelf-topseries');
      expect(shelf.textContent).toContain('Top 10 séries da semana');
      expect(shelf.textContent).toContain('Adicionados à sua lista nos últimos 7 dias');
      expect([...shelf.querySelectorAll('.card b')].map(title => title.textContent)).toEqual(['Série 2', 'Série 1', 'Antiga']);
    });

    it('para em 10 títulos', async () => {
      const app = await bootApp();
      const movies = Array.from({ length: 12 }, (_, index) =>
        movie(index, { added: week(1), name: 'Título ' + 'abcdefghijklmnop'.charAt(index) }),
      );
      openCatalog(app, catalog({ vod: sectionData(movies, { acao: 'Ação' }) }));
      expect(element('.shelf-topvod').querySelectorAll('.card')).toHaveLength(10);
    });

    it('ignora categoria de destaque vazia e some sem novidades', async () => {
      const app = await bootApp();
      openCatalog(app, catalog({ vod: sectionData([movie(1, { added: undefined })], { top: 'Top 10', acao: 'Ação' }) }));
      expect(document.querySelector('.shelf-topvod')).toBeNull();
    });

    it('reaproveita o cálculo até os bloqueios mudarem', async () => {
      const app = await bootApp();
      const vod = sectionData([movie(1, { added: week(1) })], { acao: 'Ação' });
      openCatalog(app, catalog({ vod }), userData());
      const cats = jest.spyOn(vod.cats, 'filter');
      app.home.renderHome();
      expect(cats).not.toHaveBeenCalled();
      app.state.state.userData.hidden.push('vod:acao');
      app.home.renderHome();
      expect(document.querySelector('.shelf-topvod')).toBeNull();
    });

    it('abre o título, pedindo o PIN se preciso', async () => {
      const app = await bootApp();
      openCatalog(
        app,
        catalog({
          vod: sectionData([movie(1, { added: week(1) })], { acao: 'Ação' }),
          series: sectionData([series(1, { added: week(1) })], { drama: 'Drama' }),
        }),
      );
      element('[data-top="vod"]').click();
      expect(element('#dDetail').hasAttribute('open')).toBe(true);
      expect(element('#detailBody').textContent).toContain('Filme 1');
      element('#mClose').click();
      element('[data-top="series"]').click();
      await flush();
      expect(element('#detailBody').textContent).toContain('Série 1');
    });

    it('ignora cartão inválido', async () => {
      const app = await bootApp();
      openCatalog(app, catalog({ vod: sectionData([movie(1, { added: week(1) })], { acao: 'Ação' }) }));
      const card = element('[data-top="vod"]');
      card.dataset.rank = '9';
      card.click();
      expect(element('#dDetail').hasAttribute('open')).toBe(false);
      card.dataset.top = 'outra';
      card.click();
      expect(element('#dDetail').hasAttribute('open')).toBe(false);
    });
  });

  describe('recomendações e assistidos', () => {
    const watchedHistory = [
      historyEntry({ ref: 'vod:m1', pos: 950 }),
      historyEntry({ ref: 'ep:e1', series: 'series:s1', pos: 500, desc: undefined }),
    ];
    const movies = sectionData([movie(1), movie(2), movie(3, { name: 'Outro' })], { acao: 'Ação' });
    const seriesData = sectionData([series(1), series(2, { name: 'Outra' })], { drama: 'Drama' });

    it('mostra recomendações e títulos assistidos', async () => {
      const app = await bootApp();
      openCatalog(app, catalog({ vod: movies, series: seriesData }), userData({ hist: watchedHistory }));
      expect(element('.shelf-recvod').textContent).toContain('Filmes recomendados');
      expect(element('.shelf-recvod').textContent).toContain('Porque você assistiu “Filme 1”');
      expect(element('.shelf-recseries').textContent).toContain('Séries recomendadas');
      expect(element('.shelf-watchedvod').textContent).toContain('Filmes assistidos');
      expect(element('.shelf-watchedvod').textContent).toContain('Filme 1');
      expect(element('.shelf-watchedseries').textContent).toContain('Séries assistidas');
      expect(element('.shelf-watchedseries').textContent).toContain('Série 1');
    });

    it('filme pela metade não conta como assistido', async () => {
      const app = await bootApp();
      openCatalog(
        app,
        catalog({ vod: movies, series: seriesData }),
        userData({
          hist: [
            historyEntry({ ref: 'vod:m1', pos: 100 }),
            historyEntry({ ref: 'vod:semduracao', dur: 0 }),
            historyEntry({ ref: 'outra:1' }),
            historyEntry({ ref: 'vod:sumiu', pos: 990 }),
            historyEntry({ ref: 'vod:m2', hidden: true, pos: 990 }),
          ],
        }),
      );
      expect(document.querySelector('.shelf-watchedvod')).toBeNull();
    });

    it('sem a seção baixada não há blocos', async () => {
      const app = await bootApp();
      openCatalog(app, catalog({ vod: null, series: null }), userData({ hist: watchedHistory }));
      expect(document.querySelector('.shelf-watchedvod')).toBeNull();
      expect(document.querySelector('.shelf-recvod')).toBeNull();
    });

    it('limita os assistidos a 20', async () => {
      const app = await bootApp();
      const manyMovies = Array.from({ length: 25 }, (_, index) => movie(index));
      openCatalog(
        app,
        catalog({ vod: sectionData(manyMovies, { acao: 'Ação' }) }),
        userData({ hist: manyMovies.map(item => historyEntry({ ref: 'vod:' + item.k, pos: 990 })) }),
      );
      expect(element('.shelf-watchedvod').querySelectorAll('.card')).toHaveLength(20);
    });

    it('abre a recomendação e o título assistido', async () => {
      const app = await bootApp();
      openCatalog(app, catalog({ vod: movies, series: seriesData }), userData({ hist: watchedHistory }));
      element('[data-rec="vod"]').click();
      expect(element('#detailBody').textContent).toContain('Filme 2');
      element('#mClose').click();
      element('[data-rec="series"]').click();
      await flush();
      expect(element('#detailBody').textContent).toContain('Outra');
      element('#sClose').click();
      element('[data-watched="vod"]').click();
      expect(element('#detailBody').textContent).toContain('Filme 1');
      element('#mClose').click();
      element('[data-watched="series"]').click();
      await flush();
      expect(element('#detailBody').textContent).toContain('Série 1');
    });

    it('ignora cartões inválidos', async () => {
      const app = await bootApp();
      openCatalog(app, catalog({ vod: movies, series: seriesData }), userData({ hist: watchedHistory }));
      const recommendation = element('[data-rec="vod"]'),
        watched = element('[data-watched="vod"]');
      recommendation.dataset.i = '9';
      recommendation.click();
      watched.dataset.i = '9';
      watched.click();
      recommendation.dataset.rec = 'outra';
      recommendation.click();
      watched.dataset.watched = 'outra';
      watched.click();
      expect(element('#dDetail').hasAttribute('open')).toBe(false);
    });

    it('remove o título assistido do histórico', async () => {
      const app = await bootApp();
      openCatalog(app, catalog({ vod: movies, series: seriesData }), userData({ hist: watchedHistory }));
      element('.shelf-watchedseries .card-del').click();
      expect(app.state.state.userData.hist.map(entry => entry.ref)).toEqual(['vod:m1']);
      element('.shelf-watchedvod .card-del').click();
      expect(app.state.state.userData.hist).toEqual([]);
    });

    it('ignora o botão de remover com posição inválida', async () => {
      const app = await bootApp();
      openCatalog(app, catalog({ vod: movies, series: seriesData }), userData({ hist: watchedHistory }));
      const card = element('.shelf-watchedvod .card');
      card.dataset.i = '9';
      element('.shelf-watchedvod .card-del').click();
      expect(app.state.state.userData.hist).toHaveLength(2);
    });
  });

  it('mostra nota, capa e iniciais nos cartões', async () => {
    const app = await bootApp();
    const vod = sectionData([movie(1, { logo: 'http://img.test/f.png', rate: 7.25 })], { acao: 'Ação' });
    openCatalog(app, catalog({ vod }), userData({ hist: [historyEntry({ ref: 'vod:outro', pos: 990 })] }));
    expect(app.home.cardHtml({ name: 'Filme', logo: 'x', rate: 7.25 }, 'data-x="1"')).toContain('★ 7.3');
  });
});
