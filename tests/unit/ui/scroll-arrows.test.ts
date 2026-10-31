import { element, fire, preparePage } from '../support/boot';

type ScrollArrowsModule = typeof import('../../../src/ui/scroll-arrows');

/**
 * Define as medidas de uma faixa que rola.
 * @param strip Faixa.
 * @param scrollWidth Largura do conteúdo.
 * @param clientWidth Largura visível.
 */
function setStripSize(strip: HTMLElement, scrollWidth: number, clientWidth: number): void {
  Object.defineProperty(strip, 'scrollWidth', { configurable: true, value: scrollWidth });
  Object.defineProperty(strip, 'clientWidth', { configurable: true, value: clientWidth });
}

describe('setas de rolagem', () => {
  let module: ScrollArrowsModule;

  beforeEach(async () => {
    preparePage();
    module = await import('../../../src/ui/scroll-arrows');
    document.body.innerHTML = `<div id="strip"></div>${module.scrollArrowsHtml('extra', 'arrows')}`;
  });

  const arrow = (direction: string): HTMLButtonElement => {
    const button = element(`[data-scroll="${direction}"]`);
    if (!(button instanceof HTMLButtonElement)) throw new Error('sem seta');
    return button;
  };

  it('monta o HTML com classe e id opcionais', () => {
    expect(element('#arrows').className).toBe('scroll-arrows extra');
    expect(module.scrollArrowsHtml()).not.toContain('id=');
    expect(module.scrollArrowsHtml()).toContain('class="scroll-arrows" ');
  });

  it('esconde as setas quando tudo cabe', () => {
    setStripSize(element('#strip'), 100, 100);
    module.bindScrollArrows(element('#strip'), element('#arrows'));
    expect(element('#arrows').hidden).toBe(true);
  });

  it('apaga a seta do lado em que chegou ao fim', () => {
    const strip = element('#strip');
    setStripSize(strip, 500, 100);
    module.bindScrollArrows(strip, element('#arrows'));
    expect(element('#arrows').hidden).toBe(false);
    expect(arrow('-1').disabled).toBe(true);
    expect(arrow('1').disabled).toBe(false);
    strip.scrollLeft = 400;
    fire(strip, 'scroll');
    expect(arrow('-1').disabled).toBe(false);
    expect(arrow('1').disabled).toBe(true);
  });

  it('funciona sem os botões das setas', () => {
    element('#arrows').innerHTML = '';
    expect(() => module.updateScrollArrows(element('#strip'), element('#arrows'))).not.toThrow();
  });

  it('rola quase a largura visível, com um mínimo', () => {
    const strip = element('#strip');
    setStripSize(strip, 2000, 1000);
    module.bindScrollArrows(strip, element('#arrows'));
    arrow('1').click();
    expect(strip.scrollBy).toHaveBeenLastCalledWith({ left: 800, behavior: 'smooth' });
    setStripSize(strip, 2000, 50);
    strip.scrollLeft = 100;
    fire(strip, 'scroll');
    arrow('-1').click();
    expect(strip.scrollBy).toHaveBeenLastCalledWith({ left: -120, behavior: 'smooth' });
  });

  it('ignora cliques fora das setas', () => {
    const strip = element('#strip');
    module.bindScrollArrows(strip, element('#arrows'));
    jest.mocked(strip.scrollBy).mockClear();
    element('#arrows').click();
    expect(strip.scrollBy).not.toHaveBeenCalled();
  });

  it('atualiza as faixas ligadas ao mudar o tamanho da janela', () => {
    const strip = element('#strip');
    module.initScrollArrows();
    setStripSize(strip, 100, 100);
    module.bindScrollArrows(strip, element('#arrows'));
    setStripSize(strip, 500, 100);
    fire(window, 'resize');
    expect(element('#arrows').hidden).toBe(false);
  });

  it('esquece faixas que saíram da página', () => {
    const strip = element('#strip'),
      arrows = element('#arrows');
    module.initScrollArrows();
    module.bindScrollArrows(strip, arrows);
    strip.remove();
    setStripSize(strip, 500, 100);
    fire(window, 'resize');
    expect(arrows.hidden).toBe(true);
    document.body.insertAdjacentHTML('beforeend', '<div id="outra"></div>');
    module.bindScrollArrows(element('#outra'), arrows);
    fire(window, 'resize');
    expect(arrows.hidden).toBe(true);
  });
});
