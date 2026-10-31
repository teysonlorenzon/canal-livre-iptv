import { advance, element, preparePage, pressKey, REDUCED_MOTION } from '../support/boot';

type IntroModule = typeof import('../../../src/ui/intro');

/**
 * Carrega a abertura numa página limpa.
 * @returns Módulo.
 */
async function loadIntro(): Promise<IntroModule> {
  preparePage();
  return import('../../../src/ui/intro');
}

describe('abertura', () => {
  it('desenha o logo, a explosão e some sozinha', async () => {
    const { playIntro } = await loadIntro();
    const finished = jest.fn();
    void playIntro().then(finished);
    const intro = element('#intro');
    expect(intro.querySelectorAll('.in-ray')).toHaveLength(20);
    expect(intro.querySelectorAll('.in-spark')).toHaveLength(26);
    expect(document.querySelector('.in-z')?.getAttribute('style')).toContain('stroke-dasharray: 100');
    await advance(20);
    expect(intro.classList.contains('go')).toBe(true);
    await advance(2100);
    expect(intro.classList.contains('out')).toBe(true);
    expect(finished).not.toHaveBeenCalled();
    await advance(500);
    expect(document.getElementById('intro')).toBeNull();
    expect(finished).toHaveBeenCalled();
  });

  it('posiciona a explosão no Z', async () => {
    const { playIntro } = await loadIntro();
    const getBoundingClientRect = jest
      .spyOn(SVGElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ left: 100, top: 50, width: 260, height: 200, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => null });
    void playIntro();
    expect(element('#inBurst').style.left).toBe('232px');
    expect(element('#inBurst').style.top).toBe('144px');
    getBoundingClientRect.mockRestore();
  });

  it('uma tecla pula a abertura sem chegar ao app', async () => {
    const { playIntro } = await loadIntro();
    const finished = jest.fn();
    void playIntro().then(finished);
    const appListener = jest.fn();
    document.addEventListener('keydown', appListener);
    const keyEvent = pressKey(document.body, 'Escape');
    expect(keyEvent.defaultPrevented).toBe(true);
    expect(appListener).not.toHaveBeenCalled();
    expect(element('#intro').classList.contains('out')).toBe(true);
    pressKey(document.body, 'a');
    expect(appListener).toHaveBeenCalledTimes(1);
    await advance(500);
    expect(finished).toHaveBeenCalled();
  });

  it('um clique pula a abertura, uma vez só', async () => {
    const { playIntro } = await loadIntro();
    const finished = jest.fn();
    void playIntro().then(finished);
    element('#intro').click();
    element('#intro').click();
    await advance(500);
    expect(finished).toHaveBeenCalledTimes(1);
    await advance(3000);
    expect(finished).toHaveBeenCalledTimes(1);
  });

  it('com movimento reduzido só aparece e some', async () => {
    const { playIntro } = await loadIntro();
    jest.mocked(window.matchMedia).mockReturnValue(REDUCED_MOTION);
    const finished = jest.fn();
    void playIntro().then(finished);
    expect(element('#intro').classList.contains('still')).toBe(true);
    await advance(1400);
    expect(finished).toHaveBeenCalled();
  });

  it('funciona sem os traços do logo', async () => {
    const { playIntro } = await loadIntro();
    const svgClass = window.SVGPathElement;
    Object.defineProperty(window, 'SVGPathElement', { configurable: true, writable: true, value: class {} });
    void playIntro();
    expect(element('#intro')).toBeDefined();
    Object.defineProperty(window, 'SVGPathElement', { configurable: true, writable: true, value: svgClass });
  });
});
