import { preparePage, readStorage } from '../support/boot';

type Utils = typeof import('../../../src/core/utils');

describe('utilitários', () => {
  let utils: Utils;

  beforeEach(async () => {
    preparePage();
    document.body.innerHTML = `
      <dialog id="dPin"><input id="pinIn"></dialog>
      <dialog id="dDetail"></dialog>
      <header></header><main id="app"><button id="before">antes</button></main>
      <div id="player" hidden></div>
      <div id="toast"></div>
      <div id="loading" hidden><button id="loadCancel">Cancelar</button><p id="loadingTxt"></p><p id="loadingNote"></p><ol id="loadingSteps"></ol><p id="loadingSec"></p><p id="loadingHint" hidden></p></div>`;
    utils = await import('../../../src/core/utils');
  });

  describe('esc', () => {
    it('escapa HTML e trata vazios', () => {
      expect(utils.esc(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
      expect(utils.esc(null)).toBe('');
      expect(utils.esc(undefined)).toBe('');
      expect(utils.esc(12)).toBe('12');
    });
  });

  describe('store', () => {
    it('salva e lê em JSON com o prefixo cl_', () => {
      expect(utils.store.set('chave', { a: 1 })).toBe(true);
      expect(readStorage('chave')).toEqual({ a: 1 });
      expect(utils.store.get('chave')).toEqual({ a: 1 });
    });

    it('devolve null sem valor ou com JSON inválido', () => {
      expect(utils.store.get('nada')).toBeNull();
      localStorage.setItem('cl_ruim', '{');
      expect(utils.store.get('ruim')).toBeNull();
    });

    it('getText só aceita texto', () => {
      utils.store.set('texto', 'x');
      utils.store.set('numero', 1);
      expect(utils.store.getText('texto')).toBe('x');
      expect(utils.store.getText('numero')).toBeNull();
    });

    it('remove valores', () => {
      utils.store.set('chave', 1);
      utils.store.del('chave');
      expect(utils.store.get('chave')).toBeNull();
    });

    it('ignora erros do armazenamento', () => {
      const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('cheio');
      });
      const removeItem = jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('indisponível');
      });
      expect(utils.store.set('chave', 1)).toBe(false);
      expect(() => utils.store.del('chave')).not.toThrow();
      setItem.mockRestore();
      removeItem.mockRestore();
    });
  });

  describe('toast', () => {
    const toastElement = (): HTMLElement => {
      const found = document.getElementById('toast');
      if (!found) throw new Error('sem toast');
      return found;
    };

    it('mostra a mensagem e some depois de 3,2 s', () => {
      utils.toast('Olá');
      expect(toastElement().textContent).toBe('Olá');
      expect(toastElement().classList.contains('show')).toBe(true);
      jest.advanceTimersByTime(3200);
      expect(toastElement().classList.contains('show')).toBe(false);
    });

    it('fica dentro do diálogo em uso', () => {
      const dialogs = document.querySelectorAll('dialog');
      dialogs[0]?.showModal();
      dialogs[1]?.showModal();
      utils.toast('no último');
      expect(toastElement().parentElement?.id).toBe('dDetail');
      document.getElementById('pinIn')?.focus();
      utils.toast('no focado');
      expect(toastElement().parentElement?.id).toBe('dPin');
    });

    it('fica dentro do player, quando ele está aberto', () => {
      const player = document.getElementById('player');
      if (!player) throw new Error('sem player');
      player.hidden = false;
      utils.toast('no player');
      expect(toastElement().parentElement).toBe(player);
    });

    it('volta para a página quando o diálogo fecha', async () => {
      utils.initToast();
      const dialog = document.querySelector('dialog');
      dialog?.showModal();
      utils.toast('dentro');
      expect(toastElement().parentElement?.id).toBe('dPin');
      dialog?.close();
      await jest.advanceTimersByTimeAsync(0);
      expect(toastElement().parentElement).toBe(document.body);
    });

    it('ignora o fechamento de um diálogo sem o aviso', async () => {
      utils.initToast();
      const second = document.getElementById('dDetail');
      if (!(second instanceof HTMLDialogElement)) throw new Error('sem diálogo');
      second.showModal();
      second.close();
      await jest.advanceTimersByTimeAsync(0);
      expect(toastElement().parentElement).toBe(document.body);
    });
  });

  describe('onDialogClose', () => {
    it('chama a função só ao fechar', async () => {
      const dialog = document.querySelector('dialog');
      if (!dialog) throw new Error('sem diálogo');
      const handler = jest.fn();
      utils.onDialogClose(dialog, handler);
      dialog.showModal();
      await jest.advanceTimersByTimeAsync(0);
      expect(handler).not.toHaveBeenCalled();
      dialog.close();
      await jest.advanceTimersByTimeAsync(0);
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('loading', () => {
    const byId = (id: string): HTMLElement => {
      const found = document.getElementById(id);
      if (!found) throw new Error('sem elemento ' + id);
      return found;
    };

    it('mostra as etapas, a observação e o tempo', () => {
      utils.loading('Baixando… (pode levar 1 minuto)');
      expect(byId('loading').hidden).toBe(false);
      expect(byId('loadingTxt').textContent).toBe('Baixando…');
      expect(byId('loadingNote').textContent).toBe('Pode levar 1 minuto');
      expect(byId('loadingSec').textContent).toBe('');
      utils.loading('Organizando…');
      expect(byId('loadingNote').textContent).toBe('');
      expect(byId('loadingSteps').textContent).toContain('Baixando');
      utils.loading('Organizando…');
      expect(byId('loadingSteps').querySelectorAll('li')).toHaveLength(1);
    });

    it('conta o tempo, mostra a dica e formata minutos', () => {
      utils.loading('Baixando…');
      jest.advanceTimersByTime(8000);
      expect(byId('loadingSec').textContent).toBe('8 s');
      expect(byId('loadingHint').hidden).toBe(true);
      jest.advanceTimersByTime(8000);
      expect(byId('loadingHint').hidden).toBe(false);
      jest.advanceTimersByTime(49000);
      expect(byId('loadingSec').textContent).toBe('1:05');
    });

    it('trava o fundo, foca Cancelar e devolve o foco ao esconder', () => {
      const before = byId('before');
      before.focus();
      utils.loading('Baixando…');
      expect(document.querySelector('header')?.hasAttribute('inert')).toBe(true);
      expect(byId('app').hasAttribute('inert')).toBe(true);
      expect(document.activeElement).toBe(byId('loadCancel'));
      utils.loading('Outra etapa…');
      utils.loading(null);
      expect(byId('app').hasAttribute('inert')).toBe(false);
      expect(document.activeElement).toBe(before);
      utils.loading(null);
      expect(byId('app').hasAttribute('inert')).toBe(false);
    });

    it('sem foco anterior, esconder a tela solta o foco do botão oculto', () => {
      (document.activeElement as HTMLElement | null)?.blur();
      utils.loading('Baixando…');
      expect(document.activeElement).toBe(byId('loadCancel'));
      utils.loading(null);
      expect(document.activeElement).toBe(document.body);
    });

    it('na TV não leva o foco para Cancelar', () => {
      document.documentElement.classList.add('tv');
      utils.loading('Baixando…');
      expect(document.activeElement).not.toBe(byId('loadCancel'));
      utils.loading(null);
    });

    it('esconde a tela e recomeça as etapas', () => {
      utils.loading('Primeira');
      utils.loading('Segunda');
      utils.loading(null);
      expect(byId('loading').hidden).toBe(true);
      utils.loading('Terceira');
      expect(byId('loadingSteps').textContent).toBe('');
    });
  });

  describe('formatação', () => {
    it('formata tempo', () => {
      expect(utils.formatTime(5)).toBe('0:05');
      expect(utils.formatTime(65)).toBe('1:05');
      expect(utils.formatTime(3725)).toBe('1:02:05');
      expect(utils.formatTime(NaN)).toBe('0:00');
    });

    it('formata hora', () => {
      expect(utils.formatHourMinute(new Date(Date.UTC(2026, 0, 1, 9, 5)))).toBe('09:05');
    });

    it('gera iniciais', () => {
      expect(utils.initials('Maria da Silva')).toBe('MD');
      expect(utils.initials('canal')).toBe('C');
      expect(utils.initials('★★')).toBe('•');
    });

    it('decodifica Base64 em UTF-8', () => {
      expect(utils.decodeBase64(btoa(unescape(encodeURIComponent('Programação'))))).toBe('Programação');
      expect(utils.decodeBase64('não é base64!')).toBe('não é base64!');
      expect(utils.decodeBase64('')).toBe('');
    });

    it('reconhece categorias adultas', () => {
      expect(utils.ADULT_PATTERN.test('Canais XXX')).toBe(true);
      expect(utils.ADULT_PATTERN.test('Filmes')).toBe(false);
      expect(utils.SECTION_NAMES.live).toBe('TV ao vivo');
    });
  });
});
