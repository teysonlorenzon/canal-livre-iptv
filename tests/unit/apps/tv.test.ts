import { advance, type AppModules, bootApp, element, fire, flush, inputField, openCatalog, pressKey } from '../support/boot';
import { catalog, channel, historyEntry, mediaDescriptor, movie, sectionData, series, userData } from '../support/fixtures';
import { controlVideo, type VideoState } from '../support/media';
import { resetBrowser } from '../support/setup';

const KEY_BACK = 461;
const KEY_PLAY = 415;
const KEY_PAUSE = 19;
const KEY_STOP = 413;
const KEY_FF = 417;
const KEY_RW = 412;
const KEY_RED = 403;
const KEY_GREEN = 404;
const KEY_YELLOW = 405;
const KEY_BLUE = 406;

/** Posição de um elemento na tela do teste. */
interface Box {
  left: number;
  top: number;
  width?: number;
  height?: number;
}

const boxes = new WeakMap<Element, Box>();

/**
 * Define onde um elemento aparece na tela do teste.
 * @param target Elemento.
 * @param box Posição.
 */
const placeElement = (target: Element, box: Box): void => {
  boxes.set(target, box);
};

/**
 * Tela do teste: elementos escondidos ou em diálogos fechados não ocupam espaço.
 * @param this Elemento medido.
 * @returns Retângulo.
 */
function measure(this: Element): DOMRect {
  const isHidden = !!this.closest('[hidden]') || !!this.closest('dialog:not([open])');
  const box = boxes.get(this) ?? { left: 0, top: 0 };
  const width = isHidden ? 0 : (box.width ?? 100),
    height = isHidden ? 0 : (box.height ?? 50);
  return {
    left: box.left,
    top: box.top,
    right: box.left + width,
    bottom: box.top + height,
    width,
    height,
    x: box.left,
    y: box.top,
    toJSON: () => null,
  };
}

/** App da TV com o vídeo sob controle. */
interface TvApp {
  app: AppModules;
  video: VideoState;
}

/**
 * Inicia o app da TV com um catálogo.
 * @param catalogData Catálogo.
 * @param preferences Preferências.
 * @returns App e vídeo.
 */
async function bootTv(catalogData = catalog(), preferences = userData()): Promise<TvApp> {
  Element.prototype.getBoundingClientRect = measure;
  const app = await bootApp({ entry: 'tv' });
  openCatalog(app, catalogData, preferences);
  await advance(20);
  return { app, video: controlVideo(app.playback.video()) };
}

/**
 * Aperta uma tecla do controle no elemento focado.
 * @param key Nome da tecla.
 * @param keyCode Código da tecla.
 * @returns O evento.
 */
const pressRemote = (key: string, keyCode = 0): KeyboardEvent => pressKey(document.activeElement ?? document.body, key, keyCode);

/**
 * Foca um item de lista, como a navegação da TV faz.
 * @param selector Seletor do item.
 */
function focusItem(selector: string): void {
  const item = element(selector);
  item.tabIndex = -1;
  item.focus();
}

/**
 * Espera a TV reagir a uma mudança de tela.
 */
const settle = (): Promise<void> => advance(20);

describe('TV LG', () => {
  afterAll(() => resetBrowser());

  it('marca a página como TV e foca "TV ao vivo" ao abrir', async () => {
    await bootTv();
    expect(document.documentElement.classList.contains('tv')).toBe(true);
    expect(document.activeElement).toBe(element('.tile.live'));
  });

  describe('navegação pelas setas', () => {
    /**
     * Monta uma grade 2×2 de botões na tela inicial.
     * @returns Os quatro botões.
     */
    function buildGrid(): HTMLElement[] {
      element('#home').innerHTML = '<button id="a"></button><button id="b"></button><button id="c"></button><button id="d"></button>';
      for (const hiddenArea of ['header']) element(hiddenArea).hidden = true;
      const [a, b, c, d] = ['#a', '#b', '#c', '#d'].map(element);
      if (!a || !b || !c || !d) throw new Error('grade incompleta');
      placeElement(a, { left: 0, top: 0 });
      placeElement(b, { left: 200, top: 0 });
      placeElement(c, { left: 0, top: 100 });
      placeElement(d, { left: 200, top: 100 });
      a.focus();
      return [a, b, c, d];
    }

    it('anda para os quatro lados', async () => {
      await bootTv();
      const [a, b, c, d] = buildGrid();
      expect(pressRemote('ArrowRight').defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(b);
      pressRemote('ArrowDown');
      expect(document.activeElement).toBe(d);
      pressRemote('ArrowLeft');
      expect(document.activeElement).toBe(c);
      pressRemote('ArrowUp');
      expect(document.activeElement).toBe(a);
    });

    it('não sai da tela nas pontas', async () => {
      await bootTv();
      const [a] = buildGrid();
      pressRemote('ArrowUp');
      expect(document.activeElement).toBe(a);
      pressRemote('ArrowLeft');
      expect(document.activeElement).toBe(a);
    });

    it('para os lados só anda na mesma linha', async () => {
      await bootTv();
      const [a, b] = buildGrid();
      if (!b) throw new Error('sem botão');
      placeElement(b, { left: 200, top: 300 });
      a?.focus();
      pressRemote('ArrowRight');
      expect(document.activeElement).toBe(a);
    });

    it('para baixo escolhe o mais alinhado da linha seguinte', async () => {
      await bootTv();
      const [a, b, c, d] = buildGrid();
      if (!a || !b || !c || !d) throw new Error('sem botão');
      placeElement(a, { left: 190, top: 0 });
      placeElement(b, { left: 900, top: 0 });
      a.focus();
      pressRemote('ArrowDown');
      expect(document.activeElement).toBe(d);
    });

    it('sem foco começa no primeiro elemento', async () => {
      await bootTv();
      const [a] = buildGrid();
      (document.activeElement instanceof HTMLElement ? document.activeElement : a)?.blur();
      pressKey(document.body, 'ArrowDown');
      expect(document.activeElement).toBe(a);
    });

    it('sem elementos não faz nada', async () => {
      await bootTv();
      element('header').hidden = true;
      element('#home').hidden = true;
      element('#section').hidden = true;
      expect(pressKey(document.body, 'ArrowDown').defaultPrevented).toBe(true);
    });

    it('elemento invisível não recebe foco', async () => {
      await bootTv();
      const [a, b] = buildGrid();
      if (!b) throw new Error('sem botão');
      b.style.visibility = 'hidden';
      a?.focus();
      pressRemote('ArrowRight');
      expect(document.activeElement).toBe(a);
    });

    it('ignora outras teclas', async () => {
      await bootTv();
      expect(pressRemote('x').defaultPrevented).toBe(false);
    });

    it('não interfere no menu de listas nem no seletor aberto', async () => {
      await bootTv();
      const menuItemKey = pressKey(element('#plMenu'), 'ArrowDown');
      expect(menuItemKey.defaultPrevented).toBe(true);
      element('#plSel').focus();
      expect(pressRemote('ArrowDown').defaultPrevented).toBe(true);
      expect(element('#plMenu').hidden).toBe(false);
    });

    it('a barra de progresso fica com as setas laterais', async () => {
      const { app } = await bootTv();
      app.player.playMedia(mediaDescriptor());
      element('#openSettings').click();
      element('#dSettings').insertAdjacentHTML('beforeend', '<input type="range" id="faixa">');
      const range = inputField('#faixa');
      range.focus();
      expect(pressRemote('ArrowLeft').defaultPrevented).toBe(false);
      expect(pressRemote('ArrowRight').defaultPrevented).toBe(false);
      expect(pressRemote('ArrowUp').defaultPrevented).toBe(true);
    });

    it('rola o item focado para dentro da tela e dá foco a itens de lista', async () => {
      const { app } = await bootTv();
      await app.section.openSection('live');
      await settle();
      const firstItem = element('#items li');
      expect(firstItem.getAttribute('tabindex')).toBe('-1');
      expect(firstItem.scrollIntoView).toHaveBeenCalledWith({ block: 'center', inline: 'nearest' });
    });
  });

  describe('campos de texto', () => {
    /**
     * Abre as configurações e foca um campo.
     * @returns O campo.
     */
    async function focusField(): Promise<HTMLInputElement> {
      await bootTv();
      element('#openSettings').click();
      await settle();
      const field = inputField('#aName');
      field.focus();
      return field;
    }

    it('ao receber foco fica só leitura', async () => {
      const field = await focusField();
      expect(field.readOnly).toBe(true);
    });

    it('OK entra e sai da edição', async () => {
      const field = await focusField();
      expect(pressRemote('Enter').defaultPrevented).toBe(true);
      expect(field.readOnly).toBe(false);
      expect(field.dataset.editing).toBe('1');
      pressRemote('Enter');
      expect(field.readOnly).toBe(true);
      expect(field.dataset.editing).toBeUndefined();
    });

    it('área de texto em edição mantém o Enter', async () => {
      await bootTv();
      element('#openSettings').click();
      element('#addSeg [data-t="file"]').click();
      await settle();
      const area = element('#aRaw');
      area.focus();
      pressRemote('Enter');
      expect(pressRemote('Enter').defaultPrevented).toBe(false);
      expect(area.dataset.editing).toBe('1');
    });

    it('Voltar sai da edição sem fechar o diálogo', async () => {
      const field = await focusField();
      pressRemote('Enter');
      expect(pressRemote('Back', KEY_BACK).defaultPrevented).toBe(true);
      expect(field.dataset.editing).toBeUndefined();
      expect(element('#dSettings').hasAttribute('open')).toBe(true);
    });

    it('setas laterais movem o cursor; para cima e para baixo saem da edição', async () => {
      const field = await focusField();
      pressRemote('Enter');
      expect(pressRemote('ArrowLeft').defaultPrevented).toBe(false);
      expect(field.dataset.editing).toBe('1');
      pressRemote('ArrowDown');
      expect(field.dataset.editing).toBeUndefined();
    });

    it('sair do campo encerra a edição', async () => {
      const field = await focusField();
      pressRemote('Enter');
      field.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: element('#aServer') }));
      expect(field.dataset.editing).toBeUndefined();
      pressRemote('Enter');
      field.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      expect(field.dataset.editing).toBe('1');
    });

    it('outros campos não são afetados', async () => {
      await focusField();
      const checkbox = element('#dSettings').appendChild(document.createElement('input'));
      checkbox.type = 'checkbox';
      checkbox.focus();
      expect(checkbox.readOnly).toBe(false);
      const clicked = jest.fn();
      checkbox.addEventListener('click', clicked);
      pressRemote('Enter');
      expect(clicked).toHaveBeenCalled();
      fire(checkbox, 'focusout');
    });
  });

  describe('Voltar', () => {
    it('fecha o diálogo aberto', async () => {
      await bootTv();
      element('#openSettings').click();
      pressRemote('Back', KEY_BACK);
      expect(element('#dSettings').hasAttribute('open')).toBe(false);
    });

    it('fecha o menu de listas', async () => {
      await bootTv();
      element('#plSel').click();
      pressRemote('Back', KEY_BACK);
      expect(element('#plMenu').hidden).toBe(true);
      expect(document.activeElement).toBe(element('#plSel'));
    });

    it('no player fecha a lista, depois os controles, depois o player', async () => {
      const { app } = await bootTv();
      app.player.playLive(channel(1), [channel(1)]);
      await settle();
      element('#cList').click();
      await settle();
      pressRemote('Back', KEY_BACK);
      expect(element('#side').hidden).toBe(true);
      expect(element('#player').hidden).toBe(false);
      element('#cPlay').focus();
      pressRemote('Back', KEY_BACK);
      expect(element('#player').classList.contains('idle')).toBe(true);
      expect(document.activeElement).toBe(document.body);
      pressRemote('Back', KEY_BACK);
      expect(element('#player').hidden).toBe(true);
    });

    it('na seção volta para o início e foca', async () => {
      const { app } = await bootTv();
      await app.section.openSection('live');
      await settle();
      pressRemote('Back', KEY_BACK);
      expect(element('#home').hidden).toBe(false);
      await settle();
      expect(document.activeElement?.classList.contains('tile')).toBe(true);
    });

    it('no início pergunta antes de sair', async () => {
      await bootTv();
      const close = jest.spyOn(window, 'close').mockImplementation(() => undefined);
      pressRemote('Back', KEY_BACK);
      expect(element('#dExit').hasAttribute('open')).toBe(true);
      expect(document.activeElement).toBe(element('#exitNo'));
      element('#exitNo').click();
      expect(element('#dExit').hasAttribute('open')).toBe(false);
      await settle();
      element('#goHome').focus();
      pressRemote('Back', KEY_BACK);
      expect(element('#dExit').hasAttribute('open')).toBe(true);
      element('#exitYes').click();
      expect(close).toHaveBeenCalled();
    });
  });

  describe('foco automático', () => {
    it('com o player aberto não rouba o foco para os controles', async () => {
      const { app } = await bootTv();
      element('#goHome').focus();
      app.player.playLive(channel(1));
      await settle();
      expect(document.activeElement).toBe(document.body);
    });

    it('na lista lateral foca o item atual, ou o primeiro', async () => {
      const { app } = await bootTv();
      const channels = [channel(1), channel(2)];
      app.player.playLive(channels[0], channels);
      await settle();
      element('#cList').click();
      await settle();
      expect(document.activeElement).toBe(element('#sideList .on'));
      element('#sideList').innerHTML = '<li class="cur" tabindex="-1">Guia</li>';
      (document.activeElement instanceof HTMLElement ? document.activeElement : element('#sideList li')).blur();
      await settle();
      expect(document.activeElement).toBe(element('#sideList .cur'));
      element('#sideList').innerHTML = '<li data-x="0">Item</li>';
      await settle();
      expect(document.activeElement).toBe(element('#sideList li'));
      element('#sideList').innerHTML = '';
      await settle();
      expect(document.activeElement).toBe(document.body);
    });

    it('volta para o conteúdo principal quando o foco some', async () => {
      await bootTv();
      element('.tile.live').blur();
      element('#home').innerHTML = '<div></div>';
      await settle();
      expect(document.activeElement?.tagName).toBe('BUTTON');
    });

    it('elemento focado continua focado', async () => {
      await bootTv();
      const focused = document.activeElement;
      element('#toast').hidden = true;
      await settle();
      expect(document.activeElement).toBe(focused);
    });

    it('com diálogo aberto foca dentro dele', async () => {
      await bootTv();
      element('#openSettings').click();
      await settle();
      expect(element('#dSettings').contains(document.activeElement)).toBe(true);
    });

    it('sem nada para focar não faz nada', async () => {
      await bootTv();
      element('.tile.live').blur();
      element('header').hidden = true;
      element('#home').hidden = true;
      await settle();
      expect(document.activeElement).toBe(document.body);
    });

    it('quando os controles somem, o foco sai deles', async () => {
      const { app } = await bootTv();
      app.player.playLive(channel(1));
      await settle();
      element('#cPlay').focus();
      element('#player').classList.add('idle');
      await flush();
      expect(document.activeElement).toBe(document.body);
    });

    it('sem foco nos controles nada muda ao esconder', async () => {
      const { app } = await bootTv();
      app.player.playLive(channel(1));
      await settle();
      element('#player').classList.remove('idle');
      await flush();
      expect(document.activeElement).toBe(document.body);
    });

    it('a aba de temporada recebe o foco de novo depois de redesenhar', async () => {
      const { app } = await bootTv(catalog(), userData());
      await app.details.openSeries(series(1));
      await settle();
      element('[data-s="2"]').click();
      await settle();
      expect(document.activeElement).toBe(element('[data-s="2"]'));
    });

    it('cliques em outros elementos não mudam o foco', async () => {
      const { app } = await bootTv();
      await app.details.openSeries(series(1));
      await settle();
      element('.stabs').click();
      element('#goHome').click();
      element('#dDetail').insertAdjacentHTML('beforeend', '<div class="stabs"><button data-s="9" id="solto"></button></div>');
      const loose = element('#solto');
      loose.remove();
      loose.click();
      expect(element('#dDetail').hasAttribute('open')).toBe(true);
    });
  });

  describe('Enter nos itens', () => {
    it('abre categorias, itens e episódios', async () => {
      const { app } = await bootTv();
      await app.section.openSection('live');
      await settle();
      focusItem('[data-c="abertos"]');
      expect(pressRemote('Enter').defaultPrevented).toBe(true);
      expect(app.state.state.currentCategory).toBe('abertos');
    });
  });

  describe('botão vermelho: busca', () => {
    it('na seção foca a busca e abre o teclado', async () => {
      const { app } = await bootTv();
      await app.section.openSection('live');
      await settle();
      expect(pressRemote('Red', KEY_RED).defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(element('#q'));
      expect(element('#q').dataset.editing).toBe('1');
    });

    it('no início abre a seção atual', async () => {
      await bootTv();
      pressRemote('Red', KEY_RED);
      await flush();
      await flush();
      expect(element('#section').hidden).toBe(false);
      expect(document.activeElement).toBe(element('#q'));
    });

    it('sem lista não faz nada', async () => {
      const { app } = await bootTv();
      app.state.state.catalog = null;
      pressRemote('Red', KEY_RED);
      await flush();
      expect(element('#section').hidden).toBe(true);
    });

    it('fecha o diálogo e o menu antes', async () => {
      await bootTv();
      element('#openSettings').click();
      element('#plSel').click();
      pressRemote('Red', KEY_RED);
      await flush();
      expect(element('#dSettings').hasAttribute('open')).toBe(false);
      expect(element('#plMenu').hidden).toBe(true);
    });

    it('no player fecha e busca na seção do que tocava', async () => {
      const { app } = await bootTv();
      app.player.playMedia(mediaDescriptor());
      await settle();
      pressRemote('Red', KEY_RED);
      await flush();
      await flush();
      expect(element('#player').hidden).toBe(true);
      expect(app.state.state.currentSection).toBe('vod');
      expect(document.activeElement).toBe(element('#q'));
    });

    it('não foca se a seção não abrir', async () => {
      const { app } = await bootTv(catalog({ vod: null }));
      app.state.state.activePlaylist = { id: 'x', name: 'X', type: 'xtream', server: 'http://x.test', user: 'u', pass: 'p' };
      app.state.state.currentSection = 'vod';
      jest.mocked(window.fetch).mockImplementation(() => Promise.resolve(new Response('', { status: 500 })));
      pressRemote('Red', KEY_RED);
      await flush();
      await flush();
      expect(element('#section').hidden).toBe(true);
      expect(document.activeElement).not.toBe(element('#q'));
    });

    it('player sem mídia usa a seção atual', async () => {
      const { app } = await bootTv();
      app.player.playLive(channel(1));
      await settle();
      app.playback.playback.currentMedia = null;
      pressRemote('Red', KEY_RED);
      await flush();
      expect(element('#player').hidden).toBe(true);
    });
  });

  describe('botão amarelo: favoritos', () => {
    it('favorita o canal da lista pela estrela', async () => {
      const { app } = await bootTv();
      await app.section.openSection('live');
      await settle();
      focusItem('#items li');
      expect(pressRemote('Yellow', KEY_YELLOW).defaultPrevented).toBe(true);
      expect(app.state.state.userData.fav.live).toEqual(['c1']);
      expect(element('#toast').textContent).toBe('Adicionado aos favoritos');
      pressRemote('Yellow', KEY_YELLOW);
      expect(element('#toast').textContent).toBe('Removido dos favoritos');
    });

    it('favorita o cartão de filme da seção', async () => {
      const { app } = await bootTv();
      await app.section.openSection('vod');
      await settle();
      focusItem('#items [data-i="0"]');
      pressRemote('Yellow', KEY_YELLOW);
      expect(app.state.state.userData.fav.vod).toEqual(['m1']);
    });

    it('na categoria Favoritos mantém o foco no vizinho', async () => {
      const { app } = await bootTv(
        catalog({ vod: sectionData([movie(1), movie(2)], { acao: 'Ação' }) }),
        userData({ fav: { live: [], vod: ['m1', 'm2'], series: [] } }),
      );
      await app.section.openSection('vod');
      element('[data-c="fav"]').click();
      await settle();
      focusItem('#items [data-i="1"]');
      pressRemote('Yellow', KEY_YELLOW);
      await settle();
      expect(document.activeElement).toBe(element('#items [data-i="0"]'));
    });

    it('o último favorito devolve o foco à categoria', async () => {
      const { app } = await bootTv(catalog(), userData({ fav: { live: [], vod: ['m1'], series: [] } }));
      await app.section.openSection('vod');
      element('[data-c="fav"]').click();
      await settle();
      focusItem('#items [data-i="0"]');
      pressRemote('Yellow', KEY_YELLOW);
      expect(document.activeElement).toBe(element('#cats li.on'));
    });

    it('sem nada para focar depois de remover, segue a vida', async () => {
      const { app } = await bootTv(catalog(), userData({ fav: { live: [], vod: ['m1'], series: [] } }));
      await app.section.openSection('vod');
      element('[data-c="fav"]').click();
      await settle();
      element('#cats').innerHTML = '';
      focusItem('#items [data-i="0"]');
      expect(() => pressRemote('Yellow', KEY_YELLOW)).not.toThrow();
    });

    it('item inválido é ignorado', async () => {
      const { app } = await bootTv();
      await app.section.openSection('vod');
      await settle();
      element('#items [data-i="0"]').dataset.i = '9';
      focusItem('#items [data-i="9"]');
      pressRemote('Yellow', KEY_YELLOW);
      expect(app.state.state.userData.fav.vod).toEqual([]);
    });

    it('favorita o canal da prateleira, mantendo o foco no cartão', async () => {
      const { app } = await bootTv(catalog(), userData({ recentLive: ['c1', 'c2'] }));
      focusItem('.shelf-recent .card');
      pressRemote('Yellow', KEY_YELLOW);
      expect(app.state.state.userData.fav.live).toEqual(['c1']);
      expect(document.activeElement).toBe(element('.shelf-recent .card'));
    });

    it('desfavoritar na prateleira de favoritos foca o vizinho', async () => {
      const { app } = await bootTv(catalog(), userData({ fav: { live: ['c1', 'c2'], vod: [], series: [] } }));
      focusItem('.shelf-fav .card:nth-child(2)');
      pressRemote('Yellow', KEY_YELLOW);
      expect(app.state.state.userData.fav.live).toEqual(['c1']);
      expect(document.activeElement).toBe(element('.shelf-fav .card'));
    });

    it('o último da prateleira leva o foco para outro cartão do canal ou para os blocos', async () => {
      await bootTv(catalog(), userData({ fav: { live: ['c1'], vod: [], series: [] }, recentLive: ['c1'] }));
      focusItem('.shelf-fav .card');
      pressRemote('Yellow', KEY_YELLOW);
      expect(document.activeElement).toBe(element('.shelf-recent .card'));
    });

    it('sem outro cartão vai para os blocos', async () => {
      await bootTv(catalog(), userData({ fav: { live: ['c1'], vod: [], series: [] } }));
      focusItem('.shelf-fav .card');
      pressRemote('Yellow', KEY_YELLOW);
      expect(document.activeElement).toBe(element('#home .tile'));
    });

    it('cartão de filme em Continuar assistindo favorita sem redesenhar', async () => {
      const { app } = await bootTv(catalog(), userData({ hist: [historyEntry()] }));
      focusItem('.shelf-cont .card');
      pressRemote('Yellow', KEY_YELLOW);
      expect(app.state.state.userData.fav.vod).toEqual(['m1']);
      expect(document.activeElement).toBe(element('.shelf-cont .card'));
    });

    it('cartão sem referência de favorito é ignorado', async () => {
      const { app } = await bootTv(catalog(), userData({ hist: [historyEntry()] }));
      const card = element('.shelf-cont .card');
      card.dataset.fav = 'outra:1';
      card.focus();
      pressRemote('Yellow', KEY_YELLOW);
      delete card.dataset.fav;
      pressRemote('Yellow', KEY_YELLOW);
      card.dataset.fav = 'semseparador';
      pressRemote('Yellow', KEY_YELLOW);
      expect(app.state.state.userData.fav.vod).toEqual([]);
    });

    it('cartão fora de prateleira é tratado', async () => {
      const { app } = await bootTv(catalog(), userData({ recentLive: ['c1'] }));
      const card = element('.shelf-recent .card');
      element('#home').appendChild(card);
      card.focus();
      pressRemote('Yellow', KEY_YELLOW);
      expect(app.state.state.userData.fav.live).toEqual(['c1']);
    });

    it('no diálogo de detalhes usa o botão Favoritar', async () => {
      const { app } = await bootTv();
      await app.details.openMovie(movie(1));
      await settle();
      pressRemote('Yellow', KEY_YELLOW);
      expect(app.state.state.userData.fav.vod).toEqual(['m1']);
      expect(element('#toast').textContent).toBe('Adicionado aos favoritos');
      element('#detailBody').innerHTML = '';
      pressRemote('Yellow', KEY_YELLOW);
      expect(element('#toast').textContent).toBe('Adicionado aos favoritos');
    });

    it('em outros diálogos não faz nada', async () => {
      const { app } = await bootTv();
      element('#openSettings').click();
      pressRemote('Yellow', KEY_YELLOW);
      expect(app.state.state.userData.fav.live).toEqual([]);
    });

    it('fora de itens não faz nada', async () => {
      const { app } = await bootTv();
      element('#goHome').focus();
      pressRemote('Yellow', KEY_YELLOW);
      pressKey(document, 'Yellow', KEY_YELLOW);
      expect(app.state.state.userData.fav.live).toEqual([]);
    });
  });

  describe('botão azul: remover do histórico', () => {
    it('remove o canal da categoria Recentes e foca o vizinho', async () => {
      const { app } = await bootTv(catalog(), userData({ recentLive: ['c1', 'c2'] }));
      await app.section.openSection('live');
      element('[data-c="recent"]').click();
      await settle();
      focusItem('#items [data-i="1"]');
      expect(pressRemote('Blue', KEY_BLUE).defaultPrevented).toBe(true);
      expect(app.state.state.userData.recentLive).toEqual(['c1']);
      expect(document.activeElement).toBe(element('#items [data-i="0"]'));
    });

    it('o último recente devolve o foco à categoria', async () => {
      const { app } = await bootTv(catalog(), userData({ recentLive: ['c1'] }));
      await app.section.openSection('live');
      element('[data-c="recent"]').click();
      await settle();
      focusItem('#items [data-i="0"]');
      pressRemote('Blue', KEY_BLUE);
      expect(document.activeElement).toBe(element('#cats li.on'));
    });

    it('sem categoria selecionada não foca nada', async () => {
      const { app } = await bootTv(catalog(), userData({ recentLive: ['c1'] }));
      await app.section.openSection('live');
      element('[data-c="recent"]').click();
      await settle();
      element('#cats').innerHTML = '';
      focusItem('#items [data-i="0"]');
      expect(() => pressRemote('Blue', KEY_BLUE)).not.toThrow();
    });

    it('item sem botão de remover é ignorado', async () => {
      const { app } = await bootTv(catalog(), userData({ recentLive: ['c1'] }));
      await app.section.openSection('live');
      await settle();
      focusItem('#items li');
      pressRemote('Blue', KEY_BLUE);
      expect(app.state.state.userData.recentLive).toEqual(['c1']);
    });

    it('remove o cartão da prateleira e foca o vizinho', async () => {
      const { app } = await bootTv(catalog(), userData({ recentLive: ['c1', 'c2'] }));
      focusItem('.shelf-recent .card:nth-child(2)');
      pressRemote('Blue', KEY_BLUE);
      expect(app.state.state.userData.recentLive).toEqual(['c1']);
      expect(document.activeElement).toBe(element('.shelf-recent .card'));
    });

    it('o último cartão leva o foco para os blocos', async () => {
      await bootTv(catalog(), userData({ recentLive: ['c1'] }));
      focusItem('.shelf-recent .card');
      pressRemote('Blue', KEY_BLUE);
      expect(document.activeElement).toBe(element('#home .tile'));
    });

    it('sem blocos para focar não quebra', async () => {
      await bootTv(catalog(), userData({ recentLive: ['c1'] }));
      focusItem('.shelf-recent .card');
      element('.tiles').remove();
      expect(() => pressRemote('Blue', KEY_BLUE)).not.toThrow();
    });

    it('cartão sem botão de remover é ignorado', async () => {
      const { app } = await bootTv(catalog(), userData({ fav: { live: ['c1'], vod: [], series: [] } }));
      focusItem('.shelf-fav .card');
      pressRemote('Blue', KEY_BLUE);
      expect(app.state.state.userData.fav.live).toEqual(['c1']);
    });

    it('cartão fora de prateleira é ignorado', async () => {
      const { app } = await bootTv(catalog(), userData({ recentLive: ['c1'] }));
      const card = element('.shelf-recent .card');
      element('#home').appendChild(card);
      card.focus();
      pressRemote('Blue', KEY_BLUE);
      expect(app.state.state.userData.recentLive).toEqual(['c1']);
    });

    it('com diálogo aberto não faz nada', async () => {
      const { app } = await bootTv(catalog(), userData({ recentLive: ['c1'] }));
      focusItem('.shelf-recent .card');
      element('#openSettings').click();
      pressRemote('Blue', KEY_BLUE);
      expect(app.state.state.userData.recentLive).toEqual(['c1']);
    });
  });

  describe('teclas no player', () => {
    /**
     * Inicia a TV com um canal tocando.
     * @returns App e vídeo.
     */
    async function bootPlayingTv(): Promise<TvApp> {
      const tv = await bootTv();
      const items = tv.app.state.state.catalog?.live.items ?? [];
      tv.app.player.playLive(items[0], items);
      await settle();
      return tv;
    }

    it.each([
      [KEY_PLAY, 'Play'],
      [KEY_PAUSE, 'Pause'],
    ])('tecla %i alterna a reprodução', async keyCode => {
      const { app, video } = await bootPlayingTv();
      video.paused = true;
      jest.mocked(app.playback.video().play).mockClear();
      expect(pressRemote('', keyCode).defaultPrevented).toBe(true);
      expect(app.playback.video().play).toHaveBeenCalled();
    });

    it('Stop fecha o player', async () => {
      await bootPlayingTv();
      pressRemote('', KEY_STOP);
      expect(element('#player').hidden).toBe(true);
    });

    it('avançar e voltar pulam 10 s', async () => {
      const { video } = await bootPlayingTv();
      video.currentTime = 50;
      pressRemote('', KEY_FF);
      expect(video.currentTime).toBe(60);
      pressRemote('', KEY_RW);
      expect(video.currentTime).toBe(50);
    });

    it('vermelho busca', async () => {
      await bootPlayingTv();
      pressRemote('', KEY_RED);
      await flush();
      await flush();
      expect(element('#player').hidden).toBe(true);
      expect(element('#section').hidden).toBe(false);
    });

    it('verde abre o guia', async () => {
      await bootPlayingTv();
      pressRemote('', KEY_GREEN);
      await flush();
      expect(element('#side').dataset.mode).toBe('epg');
    });

    it('amarelo favorita o canal tocando e atualiza a estrela', async () => {
      const { app } = await bootPlayingTv();
      pressRemote('', KEY_YELLOW);
      expect(app.state.state.userData.fav.live).toEqual(['c1']);
      expect(document.querySelector('#cFav svg')?.classList.contains('on')).toBe(true);
      expect(element('#toast').textContent).toBe('Adicionado aos favoritos');
    });

    it('amarelo na lista lateral favorita o canal focado', async () => {
      const { app } = await bootPlayingTv();
      element('#cList').click();
      await settle();
      focusItem('#sideList li:nth-child(2)');
      pressRemote('', KEY_YELLOW);
      expect(app.state.state.userData.fav.live).toEqual(['c2']);
      expect(document.querySelector('#cFav svg')?.classList.contains('on')).toBe(false);
    });

    it('amarelo favorita o filme e a série tocando', async () => {
      const { app } = await bootTv();
      app.player.playMedia(mediaDescriptor());
      await settle();
      pressRemote('', KEY_YELLOW);
      expect(app.state.state.userData.fav.vod).toEqual(['m1']);
      app.details.playEpisode(series(1), {}, series(1).eps ?? [], 0);
      await settle();
      pressRemote('', KEY_YELLOW);
      expect(app.state.state.userData.fav.series).toEqual(['s1']);
    });

    it('amarelo sem mídia não faz nada', async () => {
      const { app } = await bootPlayingTv();
      app.playback.playback.currentMedia = null;
      pressRemote('', KEY_YELLOW);
      expect(app.state.state.userData.fav.live).toEqual([]);
    });

    it('no catch-up favorita o canal', async () => {
      const { app } = await bootPlayingTv();
      app.player.playCatchup(channel(2), { s: 1000, e: 2000, title: 'x', desc: '' });
      await settle();
      pressRemote('', KEY_YELLOW);
      expect(app.state.state.userData.fav.live).toEqual(['c2']);
    });

    it('com os controles escondidos, ←/→ trocam de canal e ↑/↓ mostram os controles', async () => {
      const { app } = await bootPlayingTv();
      expect(pressRemote('ArrowRight').defaultPrevented).toBe(true);
      expect(app.playback.playback.currentMedia?.item?.k).toBe('c2');
      await settle();
      pressRemote('ArrowLeft');
      expect(app.playback.playback.currentMedia?.item?.k).toBe('c1');
      await settle();
      pressRemote('ArrowDown');
      expect(document.activeElement).toBe(element('#cPlay'));
    });

    it('em filmes, ←/→ pulam 10 s', async () => {
      const { app, video } = await bootTv();
      app.player.playMedia(mediaDescriptor());
      await settle();
      video.currentTime = 50;
      pressRemote('ArrowRight');
      expect(video.currentTime).toBe(60);
      pressRemote('ArrowLeft');
      expect(video.currentTime).toBe(50);
    });

    it('com os controles focados as setas navegam', async () => {
      await bootPlayingTv();
      const play = element('#cPlay'),
        next = element('#cMute');
      placeElement(play, { left: 0, top: 500 });
      placeElement(next, { left: 150, top: 500 });
      for (const button of document.querySelectorAll('.pctrl button'))
        if (button !== play && button !== next) placeElement(button, { left: 2000, top: 2000 });
      play.focus();
      pressRemote('ArrowRight');
      expect(document.activeElement).toBe(next);
    });

    it('a barra de progresso focada fica com ←/→', async () => {
      const { app } = await bootTv();
      app.player.playMedia(mediaDescriptor());
      await settle();
      const seek = inputField('#seek');
      seek.focus();
      expect(pressRemote('ArrowLeft').defaultPrevented).toBe(false);
      expect(pressRemote('ArrowUp').defaultPrevented).toBe(true);
    });

    it('OK nos controles só reexibe; sem foco neles pausa', async () => {
      const { app, video } = await bootPlayingTv();
      const play = element('#cPlay');
      play.focus();
      element('#player').classList.add('idle');
      await flush();
      play.focus();
      pressRemote('Enter');
      expect(element('#player').classList.contains('idle')).toBe(false);
      play.blur();
      video.paused = true;
      jest.mocked(app.playback.video().play).mockClear();
      expect(pressKey(document.body, 'Enter').defaultPrevented).toBe(true);
      expect(app.playback.video().play).toHaveBeenCalled();
    });

    it('OK com a lista aberta escolhe o canal', async () => {
      const { app } = await bootPlayingTv();
      element('#cList').click();
      await settle();
      focusItem('#sideList li:nth-child(2)');
      pressRemote('Enter');
      expect(app.playback.playback.currentMedia?.item?.k).toBe('c2');
    });

    it('OK com a lista aberta fora dos itens não pausa', async () => {
      const { app } = await bootPlayingTv();
      element('#cList').click();
      await settle();
      element('#sideClose').focus();
      expect(pressRemote('Enter').defaultPrevented).toBe(false);
      expect(app.playback.playback.currentMedia?.item?.k).toBe('c1');
    });

    it('outras teclas passam para o app', async () => {
      await bootPlayingTv();
      expect(pressKey(document, 'x').defaultPrevented).toBe(false);
    });

    it('com diálogo aberto o player não recebe as teclas', async () => {
      const { app } = await bootPlayingTv();
      element('#openSettings').click();
      await settle();
      pressRemote('', KEY_STOP);
      expect(element('#player').hidden).toBe(false);
      expect(app.playback.playback.currentMedia).not.toBeNull();
    });
  });

  it('o catálogo vazio não trava o foco', async () => {
    const { app } = await bootTv(catalog({ live: sectionData([]) }), userData());
    await app.section.openSection('live');
    await settle();
    expect(element('#items').textContent).toBe('Nada encontrado.');
  });
});
