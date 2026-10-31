import { flush, preparePage } from '../support/boot';

const electronMock = {
  windows: [] as FakeWindow[],
  whenReady: jest.fn(() => Promise.resolve()),
  on: jest.fn(),
  quit: jest.fn(),
  openExternal: jest.fn(() => Promise.resolve()),
  setApplicationMenu: jest.fn(),
};

/** Janela falsa do Electron. */
class FakeWindow {
  windowOpenHandler: ((details: { url: string }) => { action: string }) | null = null;
  webContents = {
    setWindowOpenHandler: (handler: (details: { url: string }) => { action: string }): void => {
      this.windowOpenHandler = handler;
    },
  };
  loadFile = jest.fn(() => Promise.resolve());

  options: Record<string, unknown>;

  constructor(options: Record<string, unknown>) {
    this.options = options;
    electronMock.windows.push(this);
  }
}

jest.mock('electron', () => ({
  app: { whenReady: electronMock.whenReady, on: electronMock.on, quit: electronMock.quit },
  BrowserWindow: FakeWindow,
  Menu: { setApplicationMenu: electronMock.setApplicationMenu },
  shell: { openExternal: electronMock.openExternal },
}));

describe('processo principal do Electron', () => {
  beforeEach(async () => {
    preparePage();
    electronMock.windows.length = 0;
    await import('../../../apps/desktop/main');
    await flush();
  });

  it('abre a janela sem menu, com o bloqueio de CORS desligado e sem acesso ao Node', () => {
    const [mainWindow] = electronMock.windows;
    expect(electronMock.setApplicationMenu).toHaveBeenCalledWith(null);
    expect(mainWindow?.options).toMatchObject({
      title: 'Zapp IPTV',
      webPreferences: { webSecurity: false, contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    expect(String(mainWindow?.options.icon)).toMatch(/icon\.png$/);
    expect(String(mainWindow?.loadFile.mock.calls[0])).toMatch(/index\.html$/);
  });

  it('links externos vão para o navegador do sistema', () => {
    const decision = electronMock.windows[0]?.windowOpenHandler?.({ url: 'https://exemplo.test' });
    expect(decision).toEqual({ action: 'deny' });
    expect(electronMock.openExternal).toHaveBeenCalledWith('https://exemplo.test');
  });

  it('fechar a janela encerra o app', () => {
    const closeHandler = electronMock.on.mock.calls.find(([eventName]) => eventName === 'window-all-closed')?.[1];
    closeHandler();
    expect(electronMock.quit).toHaveBeenCalled();
  });
});
