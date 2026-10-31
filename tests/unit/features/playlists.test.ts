import { advance, bootApp, element, flush, pressKey, readStorage } from '../support/boot';
import { M3U_PLAYLIST, SAMPLE_M3U, XTREAM_PLAYLIST, xtreamHandler } from '../support/fixtures';

const FILE_PLAYLIST = { id: 'f1', name: 'De arquivo', type: 'm3u' };
const STORAGE = { pls: [M3U_PLAYLIST, FILE_PLAYLIST, XTREAM_PLAYLIST], active: M3U_PLAYLIST.id };

/**
 * Item do menu de listas.
 * @param index Posição.
 * @returns O item.
 */
const menuItem = (index: number): HTMLElement => element(`#plMenu li:nth-child(${index})`);

describe('listas', () => {
  describe('seletor do topo', () => {
    it('mostra a lista ativa e o tipo de cada uma', async () => {
      await bootApp({ storage: STORAGE, fetch: () => new Response(SAMPLE_M3U) });
      expect(element('#plSelTxt').textContent).toBe('Minha M3U');
      expect(element('#plSel').title).toBe('Lista: Minha M3U');
      expect(menuItem(1).textContent).toBe('Minha M3UM3U');
      expect(menuItem(1).getAttribute('aria-checked')).toBe('true');
      expect(menuItem(2).textContent).toBe('De arquivoArquivo M3U');
      expect(menuItem(3).textContent).toBe('Minha XtreamXtream');
      expect(menuItem(4).textContent).toBe('Gerenciar listas…');
      expect(element('#plList').textContent).toContain('Xtream · http://iptv.test:8080/ · usuário');
      expect(element('#plList').textContent).toContain('M3U · http://lista.test/a.m3u');
      expect(element('#plList').textContent).toContain('M3U · arquivo local');
    });

    it('sem listas convida a adicionar', async () => {
      await bootApp({ storage: { pls: [] } });
      expect(element('#plSelTxt').textContent).toBe('Nenhuma lista');
      expect(element('#plMenu').textContent).toBe('Adicionar lista…');
      expect(element('#plList').textContent).toContain('Nenhuma lista ainda');
    });

    it('avisa enquanto a lista carrega', async () => {
      await bootApp({ storage: { pls: [M3U_PLAYLIST] }, fetch: () => new Promise<Response>(() => undefined), finishIntro: false });
      expect(element('#plSelTxt').textContent).toBe('Carregando…');
    });

    it('abre e fecha com o clique e fecha ao clicar fora', async () => {
      await bootApp({ storage: STORAGE, fetch: () => new Response(SAMPLE_M3U) });
      element('#plSel').click();
      expect(element('#plMenu').hidden).toBe(false);
      expect(element('#plSel').getAttribute('aria-expanded')).toBe('true');
      element('#plMenu').click();
      element('#plSel').click();
      expect(element('#plMenu').hidden).toBe(true);
      element('#plSel').click();
      element('#home').click();
      expect(element('#plMenu').hidden).toBe(true);
      element('#home').click();
      expect(element('#plMenu').hidden).toBe(true);
    });

    it('abre pelo teclado focando a lista ativa', async () => {
      await bootApp({ storage: STORAGE, fetch: () => new Response(SAMPLE_M3U) });
      const button = element('#plSel');
      pressKey(button, 'x');
      expect(element('#plMenu').hidden).toBe(true);
      expect(pressKey(button, 'ArrowDown').defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(menuItem(1));
    });

    it('sem lista ativa foca o primeiro item', async () => {
      await bootApp({ storage: { pls: [] } });
      pressKey(element('#plSel'), 'Enter');
      expect(document.activeElement).toBe(menuItem(1));
    });

    it('navega pelo menu com o teclado', async () => {
      await bootApp({ storage: STORAGE, fetch: () => new Response(SAMPLE_M3U) });
      pressKey(element('#plSel'), 'Enter');
      const menu = element('#plMenu');
      pressKey(menu, 'ArrowDown');
      expect(document.activeElement).toBe(menuItem(2));
      pressKey(menu, 'ArrowUp');
      expect(document.activeElement).toBe(menuItem(1));
      pressKey(menu, 'ArrowUp');
      expect(document.activeElement).toBe(menuItem(4));
      pressKey(menu, 'ArrowDown');
      expect(document.activeElement).toBe(menuItem(1));
      pressKey(menu, 'End');
      expect(document.activeElement).toBe(menuItem(4));
      pressKey(menu, 'Home');
      expect(document.activeElement).toBe(menuItem(1));
      pressKey(menu, 'Enter');
      expect(menu.hidden).toBe(true);
      expect(document.activeElement).toBe(element('#plSel'));
    });

    it('Esc e Tab fecham o menu; Enter sem foco não escolhe nada', async () => {
      await bootApp({ storage: STORAGE, fetch: () => new Response(SAMPLE_M3U) });
      const menu = element('#plMenu');
      pressKey(element('#plSel'), 'Enter');
      pressKey(menu, 'Escape');
      expect(menu.hidden).toBe(true);
      expect(document.activeElement).toBe(element('#plSel'));
      pressKey(element('#plSel'), 'Enter');
      pressKey(menu, 'Tab');
      expect(menu.hidden).toBe(true);
      menu.hidden = false;
      element('#plSel').focus();
      pressKey(menu, ' ');
      expect(menu.hidden).toBe(false);
      pressKey(menu, 'a');
    });

    it('escolher outra lista abre a lista', async () => {
      const { state } = await bootApp({
        storage: STORAGE,
        fetch: url => (url.includes('iptv.test') ? xtreamHandler()(url) : new Response(SAMPLE_M3U)),
      });
      element('#plSel').click();
      menuItem(3).click();
      await flush();
      await flush();
      expect(state.state.activePlaylist?.id).toBe(XTREAM_PLAYLIST.id);
      expect(readStorage('active')).toBe(XTREAM_PLAYLIST.id);
    });

    it('escolher a lista ativa não recarrega', async () => {
      await bootApp({ storage: STORAGE, fetch: () => new Response(SAMPLE_M3U) });
      const calls = jest.mocked(window.fetch).mock.calls.length;
      element('#plSel').click();
      menuItem(1).click();
      await flush();
      expect(jest.mocked(window.fetch).mock.calls).toHaveLength(calls);
    });

    it('Gerenciar listas abre as configurações', async () => {
      await bootApp({ storage: STORAGE, fetch: () => new Response(SAMPLE_M3U) });
      element('#plSel').click();
      menuItem(4).click();
      expect(element('#dSettings').hasAttribute('open')).toBe(true);
    });
  });

  describe('gerenciamento', () => {
    it('Abrir e Atualizar abrem a lista e fecham as configurações', async () => {
      await bootApp({ storage: STORAGE, fetch: () => new Response(SAMPLE_M3U) });
      localStorage.setItem('cl_m3u_f1', JSON.stringify(SAMPLE_M3U));
      element('#openSettings').click();
      element('[data-open="f1"]').click();
      await flush();
      expect(element('#dSettings').hasAttribute('open')).toBe(false);
      expect(readStorage('active')).toBe('f1');
      element('#openSettings').click();
      const calls = jest.mocked(window.fetch).mock.calls.length;
      element('[data-reload="l1"]').click();
      await flush();
      await flush();
      expect(jest.mocked(window.fetch).mock.calls.length).toBeGreaterThan(calls);
      expect(readStorage('active')).toBe('l1');
    });

    it('clique fora dos botões não faz nada', async () => {
      await bootApp({ storage: STORAGE, fetch: () => new Response(SAMPLE_M3U) });
      element('#plList').click();
      element('#plList .plrow b').click();
      expect(readStorage('pls')).toHaveLength(3);
    });

    it('remover pede confirmação e apaga os dados de todos os perfis', async () => {
      await bootApp({
        storage: {
          ...STORAGE,
          active: 'f1',
          users: [
            { id: 'main', name: 'Principal' },
            { id: 'u1', name: 'Outro' },
          ],
          m3u_f1: SAMPLE_M3U,
          ux_l1: {},
          'ux_l1@u1': {},
          m3u_l1: SAMPLE_M3U,
        },
      });
      await flush();
      const removeButton = element('[data-del="l1"]');
      removeButton.click();
      expect(removeButton.textContent).toBe('Confirmar');
      expect(readStorage('pls')).toHaveLength(3);
      removeButton.click();
      expect(readStorage('pls')).toHaveLength(2);
      expect(readStorage('ux_l1')).toBeNull();
      expect(readStorage('ux_l1@u1')).toBeNull();
      expect(readStorage('m3u_l1')).toBeNull();
      expect(readStorage('active')).toBe('f1');
    });

    it('remover a lista ativa abre a próxima', async () => {
      const { state } = await bootApp({
        storage: { pls: [M3U_PLAYLIST, FILE_PLAYLIST], active: 'l1', m3u_l1: SAMPLE_M3U, m3u_f1: SAMPLE_M3U },
      });
      element('[data-del="l1"]').click();
      element('[data-del="l1"]').click();
      await flush();
      expect(state.state.activePlaylist?.id).toBe('f1');
    });

    it('remover a última lista deixa o app sem lista', async () => {
      const { state } = await bootApp({ storage: { pls: [M3U_PLAYLIST], active: 'l1', m3u_l1: SAMPLE_M3U } });
      element('[data-del="l1"]').click();
      element('[data-del="l1"]').click();
      await flush();
      expect(state.state.activePlaylist).toBeNull();
      expect(state.state.catalog).toBeNull();
      expect(readStorage('active')).toBeNull();
      expect(element('#home').textContent).toContain('Adicione sua lista IPTV');
    });
  });

  describe('abertura de uma lista', () => {
    it('na primeira execução abre a lista padrão embutida, sem baixar nada', async () => {
      const { state } = await bootApp();
      expect(state.state.activePlaylist?.id).toBe('br-gratis');
      expect(state.state.catalog?.live.items.length).toBeGreaterThan(10);
      expect(window.fetch).not.toHaveBeenCalled();
    });

    it('volta para a lista padrão se a ativa sumiu', async () => {
      const { state } = await bootApp({
        storage: { pls: [{ id: 'br-gratis', name: 'Padrão', type: 'm3u' }, FILE_PLAYLIST], active: 'sumiu' },
      });
      expect(state.state.activePlaylist?.id).toBe('br-gratis');
    });

    it('sem a padrão abre a primeira', async () => {
      const { state } = await bootApp({ storage: { pls: [FILE_PLAYLIST], m3u_f1: SAMPLE_M3U } });
      expect(state.state.activePlaylist?.id).toBe('f1');
    });

    it('sem listas não abre nada', async () => {
      const { playlists } = await bootApp({ storage: { pls: [] } });
      expect(playlists.fallbackPlaylistId()).toBeNull();
      await expect(playlists.openPlaylist('inexistente')).resolves.toBeUndefined();
    });

    it('usa a cópia salva da lista', async () => {
      await bootApp({ storage: { pls: [M3U_PLAYLIST], m3u_l1: SAMPLE_M3U } });
      expect(window.fetch).toHaveBeenCalledTimes(1);
      expect(String(jest.mocked(window.fetch).mock.calls[0]?.[0])).toBe('http://epg.test/guia.xml');
    });

    it('baixa a lista, salva a cópia e carrega o guia', async () => {
      const { state } = await bootApp({
        storage: { pls: [M3U_PLAYLIST] },
        fetch: url =>
          new Response(
            url.includes('epg.test')
              ? '<tv><programme start="20260615110000 +0000" stop="20260615130000 +0000" channel="canal.um"><title>Agora</title></programme></tv>'
              : SAMPLE_M3U,
          ),
      });
      expect(readStorage('m3u_l1')).toBe(SAMPLE_M3U);
      expect(state.state.catalog?.epg?.get('canal.um')).toHaveLength(1);
    });

    it('prefere o guia cadastrado na lista', async () => {
      await bootApp({ storage: { pls: [{ ...M3U_PLAYLIST, epg: 'http://meu.test/epg.xml' }], m3u_l1: SAMPLE_M3U } });
      expect(String(jest.mocked(window.fetch).mock.calls[0]?.[0])).toBe('http://meu.test/epg.xml');
    });

    it('guia que falha não impede de abrir', async () => {
      const { state } = await bootApp({
        storage: { pls: [M3U_PLAYLIST], m3u_l1: SAMPLE_M3U },
        fetch: () => new Response('', { status: 500 }),
      });
      expect(state.state.catalog?.epg).toBeUndefined();
      expect(state.state.catalog?.live.items).toHaveLength(4);
    });

    it('lista sem conteúdo salvo mostra o erro', async () => {
      await bootApp({ storage: { pls: [FILE_PLAYLIST] } });
      expect(element('#home').textContent).toContain('Conteúdo da lista não encontrado');
    });

    it('lista com problema mostra o erro e deixa tentar de novo', async () => {
      const responses = [new Response('', { status: 500 }), new Response(SAMPLE_M3U), new Response('')];
      await bootApp({ storage: { pls: [M3U_PLAYLIST] }, fetch: () => responses.shift() ?? new Response('') });
      expect(element('#home').textContent).toContain('Não foi possível abrir “Minha M3U”');
      expect(element('#home').textContent).toContain('O servidor respondeu com erro 500');
      element('#wRetry').click();
      await flush();
      await flush();
      expect(element('#home').textContent).toContain('TV ao vivo');
    });

    it('a tela de erro leva às configurações', async () => {
      await bootApp({ storage: { pls: [FILE_PLAYLIST] } });
      element('#wAdd').click();
      expect(element('#dSettings').hasAttribute('open')).toBe(true);
    });

    it('mostra a tela de carregamento enquanto baixa', async () => {
      await bootApp({ storage: { pls: [M3U_PLAYLIST] }, fetch: () => new Promise<Response>(() => undefined) });
      expect(element('#loading').hidden).toBe(false);
      expect(element('#loadingTxt').textContent).toBe('Baixando lista…');
      await advance(120000);
      expect(element('#home').textContent).toContain('O servidor não respondeu em 120 segundos');
    });
  });
});
