import { bootApp, element, pressKey } from '../support/boot';

describe('desktop', () => {
  it('marca a página como desktop', async () => {
    await bootApp({ entry: 'desktop' });
    expect(document.documentElement.classList.contains('desktop')).toBe(true);
  });

  it('F11 entra e sai da tela cheia', async () => {
    await bootApp({ entry: 'desktop' });
    const requestFullscreen = jest.fn(() => Promise.resolve());
    const exitFullscreen = jest.fn(() => Promise.resolve());
    document.documentElement.requestFullscreen = requestFullscreen;
    document.exitFullscreen = exitFullscreen;
    expect(pressKey(document.body, 'F11').defaultPrevented).toBe(true);
    expect(requestFullscreen).toHaveBeenCalled();
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: element('#app') });
    pressKey(document.body, 'F11');
    expect(exitFullscreen).toHaveBeenCalled();
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
  });

  it('outras teclas passam', async () => {
    await bootApp({ entry: 'desktop' });
    expect(pressKey(document.body, 'a').defaultPrevented).toBe(false);
  });
});
