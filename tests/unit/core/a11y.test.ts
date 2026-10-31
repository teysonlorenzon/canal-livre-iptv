import { preparePage } from '../support/boot';

type A11y = typeof import('../../../src/core/a11y');

describe('acessibilidade', () => {
  let a11y: A11y;

  beforeEach(async () => {
    preparePage();
    document.body.innerHTML = `
      <a class="skip-link" href="#app">Pular</a>
      <header><button id="topo">Topo</button></header>
      <div id="modal"><header><button id="fechar">Fechar</button></header></div>
      <main id="app" tabindex="-1">
        <p id="srStatus" role="status"></p>
        <h1 id="appTitle" tabindex="-1">Título</h1>
        <ul id="lista"><li data-i="1"><button class="row-main">Um</button></li><li data-i="2"><button class="row-main">Dois</button></li></ul>
        <div id="escondido" hidden><button id="dentro">Dentro</button></div>
        <form><input id="campo"><input id="outro"><p id="erro" role="alert" hidden></p></form>
      </main>`;
    a11y = await import('../../../src/core/a11y');
  });

  const byId = (id: string): HTMLElement => {
    const found = document.getElementById(id);
    if (!found) throw new Error('sem ' + id);
    return found;
  };

  describe('fundo inerte', () => {
    it('trava e destrava, só destravando quando todos os modais fecharem', () => {
      a11y.lockBackground();
      a11y.lockBackground();
      expect(byId('app').hasAttribute('inert')).toBe(true);
      expect(byId('topo').closest('header')?.hasAttribute('inert')).toBe(true);
      expect(document.querySelector('.skip-link')?.hasAttribute('inert')).toBe(true);
      expect(byId('fechar').closest('header')?.hasAttribute('inert')).toBe(false);
      a11y.unlockBackground();
      expect(byId('app').hasAttribute('inert')).toBe(true);
      a11y.unlockBackground();
      expect(byId('app').hasAttribute('inert')).toBe(false);
      a11y.unlockBackground();
      expect(byId('app').hasAttribute('inert')).toBe(false);
    });
  });

  describe('plataforma e movimento', () => {
    it('reconhece a TV', () => {
      expect(a11y.isTvPlatform()).toBe(false);
      document.documentElement.classList.add('tv');
      expect(a11y.isTvPlatform()).toBe(true);
    });

    it('lê a preferência de movimento reduzido', () => {
      expect(a11y.prefersReducedMotion()).toBe(false);
      jest.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
      expect(a11y.prefersReducedMotion()).toBe(true);
    });
  });

  describe('foco', () => {
    it('não guarda nada sem foco específico', () => {
      expect(a11y.rememberFocus()).toBeNull();
    });

    it('devolve o foco ao mesmo elemento', () => {
      byId('topo').focus();
      const memory = a11y.rememberFocus();
      byId('campo').focus();
      expect(memory?.restore()).toBe(true);
      expect(document.activeElement).toBe(byId('topo'));
    });

    it('acha o elemento de novo depois que a lista é redesenhada', () => {
      const secondRow = document.querySelectorAll<HTMLElement>('.row-main')[1];
      secondRow?.focus();
      const memory = a11y.rememberFocus();
      byId('lista').innerHTML =
        '<li data-i="1"><button class="row-main">Um</button></li><li data-i="2"><button class="row-main">Dois de novo</button></li>';
      expect(memory?.restore()).toBe(true);
      expect(document.activeElement?.textContent).toBe('Dois de novo');
    });

    it('identifica pelo id e pelos atributos do próprio elemento', () => {
      byId('lista').innerHTML = '<li data-i="3" id="comId"></li>';
      byId('comId').tabIndex = 0;
      byId('comId').focus();
      const memory = a11y.rememberFocus();
      byId('lista').innerHTML = '<li data-i="3" id="comId" tabindex="0"></li>';
      expect(memory?.restore()).toBe(true);
      byId('lista').innerHTML = '<li data-i="4" data-x="a&quot;b" tabindex="0"></li>';
      document.querySelector<HTMLElement>('li')?.focus();
      const quoted = a11y.rememberFocus();
      byId('lista').innerHTML = '<li data-i="4" data-x="a&quot;b" tabindex="0"></li>';
      expect(quoted?.restore()).toBe(true);
    });

    it('sem como identificar o elemento, só volta se ele ainda existir', () => {
      document.body.insertAdjacentHTML('beforeend', '<button id="solto-sem-ancora" type="button">x</button>');
      const loose = document.createElement('button');
      document.body.appendChild(loose);
      loose.focus();
      const memory = a11y.rememberFocus();
      loose.remove();
      expect(memory?.restore()).toBe(false);
    });

    it('preservingFocus devolve o foco, ou usa o plano B se o elemento sumiu', () => {
      const firstRow = document.querySelector<HTMLElement>('.row-main');
      firstRow?.focus();
      a11y.preservingFocus(byId('lista'), () => {
        byId('lista').innerHTML = '<li data-i="1"><button class="row-main">Novo</button></li>';
      });
      expect(document.activeElement?.textContent).toBe('Novo');
      a11y.preservingFocus(
        byId('lista'),
        () => {
          byId('lista').innerHTML = '<li data-i="9"><button class="row-main">Outro</button></li>';
        },
        () => byId('topo'),
      );
      expect(document.activeElement).toBe(byId('topo'));
      byId('topo').focus();
      a11y.preservingFocus(byId('lista'), () => undefined);
      expect(document.activeElement).toBe(byId('topo'));
      document.querySelector<HTMLElement>('.row-main')?.focus();
      a11y.preservingFocus(byId('lista'), () => {
        byId('lista').innerHTML = '';
      });
    });

    it('resgata o foco que estava numa tela escondida', () => {
      byId('dentro').focus();
      byId('escondido').hidden = true;
      a11y.rescueFocus(byId('appTitle'));
      expect(document.activeElement).toBe(byId('appTitle'));
    });

    it('não mexe no foco fora de telas escondidas, sem foco e na TV', () => {
      a11y.rescueFocus(byId('appTitle'));
      expect(document.activeElement).toBe(document.body);
      byId('topo').focus();
      a11y.rescueFocus(byId('appTitle'));
      expect(document.activeElement).toBe(byId('topo'));
      byId('escondido').hidden = false;
      byId('dentro').focus();
      byId('escondido').hidden = true;
      document.documentElement.classList.add('tv');
      a11y.rescueFocus(byId('appTitle'));
      expect(document.activeElement).toBe(byId('dentro'));
    });
  });

  describe('anúncios e erros', () => {
    it('anuncia ao leitor de tela', () => {
      a11y.announce('3 canais');
      expect(byId('srStatus').textContent).toBe('3 canais');
    });

    it('mostra o erro, marca os campos e foca o primeiro', () => {
      a11y.showFormError(byId('erro'), 'Preencha.', [byId('campo'), byId('outro')]);
      expect(byId('erro').textContent).toBe('Preencha.');
      expect(byId('erro').hidden).toBe(false);
      expect(byId('campo').getAttribute('aria-invalid')).toBe('true');
      expect(byId('outro').getAttribute('aria-describedby')).toBe('erro');
      expect(document.activeElement).toBe(byId('campo'));
    });

    it('sem campos só mostra o texto', () => {
      a11y.showFormError(byId('erro'), 'Falhou.', []);
      expect(byId('erro').hidden).toBe(false);
    });

    it('apaga o erro e a marca de inválido', () => {
      a11y.showFormError(byId('erro'), 'Preencha.', [byId('campo')]);
      a11y.clearFormError(byId('erro'), [byId('campo')]);
      expect(byId('erro').textContent).toBe('');
      expect(byId('erro').hidden).toBe(true);
      expect(byId('campo').hasAttribute('aria-invalid')).toBe(false);
    });
  });
});
