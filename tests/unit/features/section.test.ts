import { advance, type AppModules, bootApp, element, fire, flush, openCatalog, pressKey } from '../support/boot';
import { catalog, channel, historyEntry, movie, programme, sectionData, series, userData } from '../support/fixtures';

/**
 * Abre uma seção de um catálogo de teste.
 * @param app Módulos do app.
 * @param sectionName Seção.
 */
async function openTestSection(app: AppModules, sectionName: 'live' | 'vod' | 'series'): Promise<void> {
  await app.section.openSection(sectionName);
}

/**
 * Nomes dos itens listados.
 * @returns Nomes.
 */
const listedNames = (): (string | null)[] => [...document.querySelectorAll('#items b')].map(name => name.textContent);

/**
 * Digita no diálogo de PIN e confirma.
 * @param pin PIN.
 */
function typePin(pin: string): void {
  const field = element('#pinIn');
  if (!(field instanceof HTMLInputElement)) throw new Error('sem campo');
  field.value = pin;
  element('#pinOk').click();
}

describe('seções', () => {
  describe('abertura', () => {
    it('reinicia busca, categoria e ordenação', async () => {
      const app = await bootApp();
      openCatalog(app, catalog());
      app.state.state.currentCategory = 'abertos';
      element('#q').setAttribute('value', 'x');
      await openTestSection(app, 'vod');
      expect(app.state.state.currentCategory).toBe('*');
      expect(element('#secTitle').textContent).toBe('Filmes');
      expect(element('#section').hidden).toBe(false);
      expect(element('#home').hidden).toBe(true);
    });

    it('não abre se a seção não carregar', async () => {
      const app = await bootApp();
      openCatalog(app, catalog({ vod: null }));
      app.state.state.activePlaylist = { id: 'x', name: 'X', type: 'xtream', server: 'http://x.test', user: 'u', pass: 'p' };
      jest.mocked(window.fetch).mockImplementation(() => Promise.resolve(new Response('', { status: 500 })));
      await openTestSection(app, 'vod');
      expect(element('#section').hidden).toBe(true);
    });
  });

  describe('categorias', () => {
    it('lista Todos, Favoritos, Recentes e as categorias com contagens', async () => {
      const app = await bootApp();
      const live = sectionData([channel(1), channel(2), channel(3, { cat: 'oculta' }), channel(4, { cat: 'semnome' })], {
        abertos: 'Abertos',
        oculta: 'Oculta',
        vazia: 'Vazia',
      });
      openCatalog(
        app,
        catalog({ live }),
        userData({
          hidden: ['live:oculta'],
          locked: ['live:abertos'],
          recentLive: ['c1'],
          fav: { live: ['c1', 'c2'], vod: [], series: [] },
        }),
      );
      await openTestSection(app, 'live');
      const rows = [...document.querySelectorAll('#cats li')].map(row => row.textContent);
      expect(rows).toEqual(['Todos3', '★ Favoritos2', 'Recentes1', 'Abertos🔒(bloqueada)2', 'Vazia0']);
      expect(element('#cats li').classList.contains('on')).toBe(true);
    });

    it('filmes e séries não têm Recentes e têm ordenação por nota', async () => {
      const app = await bootApp();
      openCatalog(app, catalog());
      await openTestSection(app, 'vod');
      expect(element('#cats').textContent).not.toContain('Recentes');
      expect(element('#sortDd [data-value=new]').hidden).toBe(false);
      await openTestSection(app, 'live');
      expect(element('#sortDd [data-value=rate]').hidden).toBe(true);
    });

    it('sem dados da seção não desenha nada', async () => {
      const app = await bootApp();
      openCatalog(app, catalog({ vod: null }));
      app.state.state.currentSection = 'vod';
      element('#cats').innerHTML = 'antes';
      app.section.renderCats();
      expect(element('#cats').textContent).toBe('antes');
      app.section.renderItems();
      expect(element('#items').textContent).toBe('Nada encontrado.');
    });

    it('selecionar uma categoria filtra os itens', async () => {
      const app = await bootApp();
      openCatalog(app, catalog({ live: sectionData([channel(1), channel(2, { cat: 'outra' })], { abertos: 'Abertos', outra: 'Outra' }) }));
      await openTestSection(app, 'live');
      element('[data-c="outra"]').click();
      expect(listedNames()).toEqual(['Canal 2']);
      expect(element('[data-c="outra"]').classList.contains('on')).toBe(true);
    });

    it('item sem id de categoria volta para Todos', async () => {
      const app = await bootApp();
      openCatalog(app, catalog());
      await openTestSection(app, 'live');
      delete element('[data-c="abertos"]').dataset.c;
      element('#cats li:last-child').click();
      expect(app.state.state.currentCategory).toBe('*');
    });

    it('ignora cliques fora dos itens', async () => {
      const app = await bootApp();
      openCatalog(app, catalog());
      await openTestSection(app, 'live');
      element('#cats').click();
      expect(app.state.state.currentCategory).toBe('*');
    });

    it('favoritos e recentes seguem a ordem salva e ignoram os que saíram', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData({ fav: { live: ['c3', 'c1', 'sumiu'], vod: [], series: [] }, recentLive: ['c2', 'sumiu'] }));
      await openTestSection(app, 'live');
      element('[data-c="fav"]').click();
      expect(listedNames()).toEqual(['Canal 3', 'Canal 1']);
      element('[data-c="recent"]').click();
      expect(listedNames()).toEqual(['Canal 2']);
      expect(document.querySelector('#items .del')).not.toBeNull();
    });

    it('avisa quando não há favoritos', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData());
      await openTestSection(app, 'live');
      element('[data-c="fav"]').click();
      expect(element('#items').textContent).toBe('Nenhum favorito nesta seção.');
    });
  });

  describe('itens', () => {
    it('lista os canais com logo, catch-up e canal em reprodução', async () => {
      const app = await bootApp();
      const live = sectionData([channel(1, { logo: 'http://img.test/1.png', archive: 3 }), channel(2)], { abertos: 'Abertos' });
      openCatalog(app, catalog({ live }), userData({ fav: { live: ['c2'], vod: [], series: [] } }));
      app.player.playLive(live.items[0]);
      await openTestSection(app, 'live');
      const rows = document.querySelectorAll('#items li');
      expect(rows[0]?.classList.contains('on')).toBe(true);
      expect(rows[0]?.textContent).toContain('CATCH-UP');
      expect(rows[0]?.querySelector('img')?.getAttribute('src')).toBe('http://img.test/1.png');
      expect(rows[1]?.querySelector('.logo')?.textContent).toBe('C2');
      expect(rows[1]?.querySelector('.star')?.classList.contains('on')).toBe(true);
      expect(rows[1]?.textContent).toContain('Abertos');
    });

    it('mostra o programa atual quando há guia', async () => {
      const app = await bootApp();
      const now = Date.now();
      openCatalog(
        app,
        catalog({
          epg: new Map([['epg1', [programme(now - 1000, now + 1000, { title: 'Jornal' })]]]),
          live: sectionData([channel(1), channel(2, { epg: '' })], { abertos: 'Abertos' }),
        }),
      );
      await openTestSection(app, 'live');
      expect(element('#items li').textContent).toContain('Jornal');
      expect(element('#items li:nth-child(2)').textContent).toContain('Abertos');
    });

    it('mostra a grade de pôsteres com o progresso', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData({ hist: [historyEntry({ ref: 'vod:m1' }), historyEntry({ ref: 'vod:m2', dur: 0 })] }));
      await openTestSection(app, 'vod');
      expect(element('#items .grid').querySelectorAll('.card')).toHaveLength(2);
      expect(element('#items .pg').style.width).toBe('30%');
    });

    it('oculta categorias ocultas e bloqueadas, salvo se liberadas', async () => {
      const app = await bootApp();
      const live = sectionData([channel(1), channel(2, { cat: 'bloqueada' }), channel(3, { cat: 'oculta' })], {
        abertos: 'Abertos',
        bloqueada: 'Bloqueada',
        oculta: 'Oculta',
      });
      openCatalog(app, catalog({ live }), userData({ hidden: ['live:oculta'], locked: ['live:bloqueada'] }));
      await openTestSection(app, 'live');
      expect(listedNames()).toEqual(['Canal 1']);
      app.state.state.unlockedCategories.add('live:bloqueada');
      app.section.renderItems();
      expect(listedNames()).toEqual(['Canal 1', 'Canal 2']);
    });

    it('paginação: mostra 200 e carrega mais', async () => {
      const app = await bootApp();
      const live = sectionData(
        Array.from({ length: 450 }, (_, index) => channel(index)),
        { abertos: 'Abertos' },
      );
      openCatalog(app, catalog({ live }));
      await openTestSection(app, 'live');
      expect(document.querySelectorAll('#items li')).toHaveLength(200);
      expect(element('#moreBtn').textContent).toBe('Mostrar mais (250 restantes)');
      element('#moreBtn').click();
      expect(document.querySelectorAll('#items li')).toHaveLength(450);
      expect(document.getElementById('moreBtn')).toBeNull();
    });

    it('sem resultados avisa', async () => {
      const app = await bootApp();
      openCatalog(app, catalog());
      await openTestSection(app, 'live');
      const search = element('#q');
      if (!(search instanceof HTMLInputElement)) throw new Error('sem busca');
      search.value = 'zzz';
      fire(search, 'input');
      await advance(150);
      expect(element('#items').textContent).toBe('Nada encontrado.');
    });

    it('a busca espera a digitação parar', async () => {
      const app = await bootApp();
      openCatalog(app, catalog());
      await openTestSection(app, 'live');
      const search = element('#q');
      if (!(search instanceof HTMLInputElement)) throw new Error('sem busca');
      search.value = 'canal 2';
      search.oninput?.(new InputEvent('input'));
      await advance(100);
      expect(listedNames()).toHaveLength(3);
      search.oninput?.(new InputEvent('input'));
      await advance(150);
      expect(listedNames()).toEqual(['Canal 2']);
    });

    it('a tecla / foca a busca na tela de seção', async () => {
      const app = await bootApp();
      openCatalog(app, catalog());
      pressKey(document.body, '/');
      expect(document.activeElement).not.toBe(element('#q'));
      await openTestSection(app, 'live');
      pressKey(document.body, '/');
      expect(document.activeElement).not.toBe(element('#q'));
      element('#cats .cat-btn').focus();
      pressKey(document.body, '/');
      expect(document.activeElement).toBe(element('#q'));
    });

    it.each([
      ['az', ['Alfa', 'Beta', 'Gama']],
      ['za', ['Gama', 'Beta', 'Alfa']],
      ['new', ['Beta', 'Alfa', 'Gama']],
      ['rate', ['Gama', 'Alfa', 'Beta']],
    ])('ordena por %s', async (order, expected) => {
      const app = await bootApp();
      const vod = sectionData(
        [
          movie(1, { name: 'Beta', added: 3, rate: undefined }),
          movie(2, { name: 'Gama', added: undefined, rate: 9 }),
          movie(3, { name: 'Alfa', added: 1, rate: 5 }),
        ],
        { acao: 'Ação' },
      );
      openCatalog(app, catalog({ vod }));
      await openTestSection(app, 'vod');
      element('#sortDd .dd-btn').click();
      element(`#sortDd li[data-value="${order}"]`).click();
      expect(listedNames()).toEqual(expected);
      expect(vod.items[0]?.name).toBe('Beta');
    });
  });

  describe('ações nos itens', () => {
    it('toca o canal e guarda a lista para trocar de canal', async () => {
      const app = await bootApp();
      openCatalog(app, catalog());
      await openTestSection(app, 'live');
      element('#items li').click();
      expect(element('#player').hidden).toBe(false);
      expect(app.playback.playback.liveChannelList).toHaveLength(3);
    });

    it('abre filme e série', async () => {
      const app = await bootApp();
      openCatalog(app, catalog());
      await openTestSection(app, 'vod');
      element('[data-i="0"]').click();
      expect(element('#detailBody').textContent).toContain('Filme 1');
      element('#mClose').click();
      await openTestSection(app, 'series');
      element('[data-i="0"]').click();
      await flush();
      expect(element('#detailBody').textContent).toContain('Série 1');
    });

    it('ignora cliques fora dos itens e item inválido', async () => {
      const app = await bootApp();
      openCatalog(app, catalog());
      await openTestSection(app, 'live');
      element('#items').click();
      element('#items li').dataset.i = '99';
      element('#items li').click();
      expect(element('#player').hidden).toBe(true);
    });

    it('a estrela alterna o favorito sem abrir o canal', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData());
      await openTestSection(app, 'live');
      element('#items .star').click();
      expect(app.state.state.userData.fav.live).toEqual(['c1']);
      expect(element('#items .star').classList.contains('on')).toBe(true);
      expect(element('#player').hidden).toBe(true);
      expect(element('[data-c="fav"]').textContent).toContain('1');
    });

    it('na categoria Favoritos, tirar a estrela remove o item da lista', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData({ fav: { live: ['c1'], vod: [], series: [] } }));
      await openTestSection(app, 'live');
      element('[data-c="fav"]').click();
      element('#items .star').click();
      expect(element('#items').textContent).toBe('Nenhum favorito nesta seção.');
    });

    it('remove dos recentes', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData({ recentLive: ['c1', 'c2'] }));
      await openTestSection(app, 'live');
      element('[data-c="recent"]').click();
      element('#items .del').click();
      expect(app.state.state.userData.recentLive).toEqual(['c2']);
      expect(element('#toast').textContent).toBe('Removido dos recentes.');
      expect(listedNames()).toEqual(['Canal 2']);
    });

    it('item de categoria bloqueada pede o PIN', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData({ locked: ['live:abertos'] }));
      await openTestSection(app, 'live');
      element('[data-c="abertos"]').click();
      typePin('0000');
      expect(listedNames()).toHaveLength(3);
      element('#items li').click();
      expect(element('#player').hidden).toBe(false);
    });
  });

  describe('PIN', () => {
    it('mostra o aviso, marca o erro e libera ao acertar', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData({ locked: ['live:abertos'] }));
      await openTestSection(app, 'live');
      element('[data-c="abertos"]').click();
      expect(element('#dPin').hasAttribute('open')).toBe(true);
      expect(element('#pinTitle').textContent).toBe('Conteúdo bloqueado');
      expect(element('#pinOk').textContent).toBe('Desbloquear');
      typePin('1111');
      expect(element('#pinError').hidden).toBe(false);
      expect(element('#pinIn').classList.contains('wrong')).toBe(true);
      fire(element('#pinIn'), 'input');
      expect(element('#pinError').hidden).toBe(true);
      expect(element('#pinIn').classList.contains('wrong')).toBe(false);
      typePin('0000');
      expect(element('#dPin').hasAttribute('open')).toBe(false);
      expect(app.state.state.currentCategory).toBe('abertos');
    });

    it('Enter confirma e outras teclas não', async () => {
      const app = await bootApp();
      const action = jest.fn();
      app.section.requestPin('1234', action);
      const field = element('#pinIn');
      if (!(field instanceof HTMLInputElement)) throw new Error('sem campo');
      pressKey(field, 'a');
      expect(action).not.toHaveBeenCalled();
      field.value = '1234';
      expect(pressKey(field, 'Enter').defaultPrevented).toBe(true);
      expect(action).toHaveBeenCalled();
    });

    it('o envio do formulário não recarrega a página', async () => {
      const app = await bootApp();
      app.section.requestPin('1234', jest.fn());
      const submitEvent = new Event('submit', { cancelable: true });
      element('#pinForm').dispatchEvent(submitEvent);
      expect(submitEvent.defaultPrevented).toBe(true);
    });

    it('aceita título, mensagem e cancelamento', async () => {
      const app = await bootApp();
      const onCancel = jest.fn();
      app.section.requestPin('1234', jest.fn(), 'Mensagem', onCancel, 'Título');
      expect(element('#pinTitle').textContent).toBe('Título');
      expect(element('#pinHint').textContent).toBe('Mensagem');
      expect(element('#pinOk').textContent).toBe('Continuar');
      element('#pinCancel').click();
      await flush();
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('mensagem sem título usa "Digite o PIN"', async () => {
      const app = await bootApp();
      app.section.requestPin('1234', jest.fn(), 'Mensagem');
      expect(element('#pinTitle').textContent).toBe('Digite o PIN');
    });

    it('acertar não chama o cancelamento', async () => {
      const app = await bootApp();
      const onCancel = jest.fn();
      app.section.requestPin('1234', jest.fn(), undefined, onCancel);
      typePin('1234');
      await flush();
      expect(onCancel).not.toHaveBeenCalled();
    });

    it('withPin executa direto sem bloqueio e pede com force', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData({ locked: ['live:x'] }));
      const action = jest.fn();
      app.section.withPin('live:livre', action);
      expect(action).toHaveBeenCalledTimes(1);
      app.state.state.unlockedCategories.add('live:x');
      app.section.withPin('live:x', action);
      expect(action).toHaveBeenCalledTimes(2);
      app.section.withPin('live:x', action, true);
      expect(element('#dPin').hasAttribute('open')).toBe(true);
    });

    it('sem PIN salvo usa 0000', async () => {
      const app = await bootApp();
      openCatalog(app, catalog(), userData({ locked: ['live:x'] }));
      app.state.state.options.pin = '';
      const action = jest.fn();
      app.section.withPin('live:x', action);
      typePin('0000');
      expect(action).toHaveBeenCalled();
    });
  });

  it('progresso de série sem histórico é zero', async () => {
    const app = await bootApp();
    openCatalog(app, catalog({ series: sectionData([series(1)], { drama: 'Drama' }) }), userData());
    await openTestSection(app, 'series');
    expect(document.querySelector('#items .pg')).toBeNull();
  });
});
