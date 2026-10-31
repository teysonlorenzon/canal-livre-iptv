import { join } from 'node:path';

const mockBundleWeb = jest.fn(() => Promise.resolve());
const mockRenderSvg = jest.fn();
const mockRenderIcons = jest.fn();
const mockWriteStaticFiles = jest.fn();
const mockBuild = jest.fn(() => Promise.resolve());
const mockWatch = jest.fn(() => Promise.resolve());
const mockServe = jest.fn(() => Promise.resolve());
const mockContext = jest.fn(() => Promise.resolve({ watch: mockWatch, serve: mockServe }));
const mockFs = {
  copyFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  existsSync: jest.fn(() => true),
  readdirSync: jest.fn((): string[] => []),
  readFileSync: jest.fn((): string | Buffer => '<svg><rect rx="9"/></svg>'),
  rmSync: jest.fn(),
  writeFileSync: jest.fn(),
};

const ROOT = join(__dirname, '../../..');

jest.mock('node:fs', () => mockFs);
jest.mock('esbuild', () => ({ build: mockBuild, context: mockContext }));
jest.mock('../../../tools/bundle.ts', () => ({
  bundleOptions: (outDir: string, options: Record<string, unknown>) => ({ outdir: outDir, ...options }),
  bundleWeb: mockBundleWeb,
  renderIcons: mockRenderIcons,
  renderSvg: mockRenderSvg,
  root: '/projeto',
  WEB_DEV_DIR: '/projeto/.dev',
  WEB_OUT_DIR: '/projeto/dist',
  WEB_TARGET: ['chrome68'],
  writeStaticFiles: mockWriteStaticFiles,
}));

describe('scripts de build', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue([]);
    mockFs.readFileSync.mockReturnValue('<svg><rect rx="9"/></svg>');
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('web: monta em dist/', async () => {
    const { buildFinished } = await import('../../../tools/build-web');
    await buildFinished;
    expect(mockBundleWeb).toHaveBeenCalledWith('/projeto/dist', { target: ['chrome68'] });
    expect(console.log).toHaveBeenCalledWith('dist/ pronto');
  });

  it('web: mantém a política de privacidade no endereço cadastrado nas lojas', async () => {
    const { buildWeb } = await import('../../../tools/web');
    await buildWeb('/projeto/dist');
    expect(mockFs.mkdirSync).toHaveBeenCalledWith('/projeto/dist/store/play', { recursive: true });
    expect(mockFs.copyFileSync).toHaveBeenCalledWith(
      '/projeto/store/play/politica-de-privacidade.html',
      '/projeto/dist/store/play/politica-de-privacidade.html',
    );
  });

  it('dev: serve de .dev/, sem tocar na dist/ versionada, e remonta a cada mudança', async () => {
    const { serverStarted } = await import('../../../tools/dev-server');
    await serverStarted;
    expect(mockFs.rmSync).toHaveBeenCalledWith('/projeto/.dev', { recursive: true, force: true });
    expect(mockFs.rmSync).not.toHaveBeenCalledWith('/projeto/dist', expect.anything());
    expect(mockWriteStaticFiles).toHaveBeenCalledWith('/projeto/.dev');
    expect(mockContext).toHaveBeenCalledWith(expect.objectContaining({ minify: false, sourcemap: true }));
    expect(mockWatch).toHaveBeenCalled();
    expect(mockServe).toHaveBeenCalledWith({ servedir: '/projeto/.dev', host: '127.0.0.1', port: 8765 });
  });

  it('TV: monta para o Chromium 68, copia o appinfo e gera os ícones quadrados', async () => {
    const { buildFinished } = await import('../../../apps/tv-webos/build');
    await buildFinished;
    expect(mockBundleWeb).toHaveBeenCalledWith(join(ROOT, 'apps/tv-webos/dist'), {
      target: 'chrome68',
      entry: join(ROOT, 'apps/tv-webos/tv.ts'),
    });
    expect(mockFs.copyFileSync).toHaveBeenCalledWith(
      join(ROOT, 'apps/tv-webos/appinfo.json'),
      join(ROOT, 'apps/tv-webos/dist/appinfo.json'),
    );
    expect(mockRenderSvg).toHaveBeenCalledWith('<svg><rect rx="0"/></svg>', 80, 80, join(ROOT, 'apps/tv-webos/dist/icon.png'), '13171aff');
    expect(mockRenderSvg).toHaveBeenCalledWith(
      '<svg><rect rx="0"/></svg>',
      130,
      130,
      join(ROOT, 'apps/tv-webos/dist/largeIcon.png'),
      '13171aff',
    );
  });

  it('celular: monta para WebView e Safari', async () => {
    const { buildFinished } = await import('../../../apps/mobile/build');
    await buildFinished;
    expect(mockBundleWeb).toHaveBeenCalledWith(join(ROOT, 'apps/mobile/www'), {
      target: ['chrome90', 'safari15'],
      entry: join(ROOT, 'apps/mobile/mobile.ts'),
    });
  });

  it('desktop: monta a janela e o processo principal e copia o ícone', async () => {
    const { buildFinished } = await import('../../../apps/desktop/build');
    await buildFinished;
    expect(mockBundleWeb).toHaveBeenCalledWith(join(ROOT, 'apps/desktop/app'), {
      target: 'chrome130',
      entry: join(ROOT, 'apps/desktop/desktop.ts'),
    });
    expect(mockBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        outfile: join(ROOT, 'apps/desktop/app/main.cjs'),
        platform: 'node',
        format: 'cjs',
        external: ['electron'],
      }),
    );
    expect(mockRenderIcons).not.toHaveBeenCalled();
    expect(mockFs.copyFileSync).toHaveBeenCalledWith(join(ROOT, 'apps/desktop/build/icon.png'), join(ROOT, 'apps/desktop/app/icon.png'));
  });

  it('desktop: recria o ícone se não existir', async () => {
    mockFs.existsSync.mockReturnValue(false);
    const { buildFinished } = await import('../../../apps/desktop/build');
    await buildFinished;
    expect(mockRenderIcons).toHaveBeenCalledWith(join(ROOT, 'brand/icon-app.svg'), [[join(ROOT, 'apps/desktop/build/icon.png'), 512]]);
  });

  describe('ícones do celular', () => {
    const pngHeader = (width: number, height: number): Buffer => {
      const bytes = Buffer.alloc(24);
      bytes.writeUInt32BE(width, 16);
      bytes.writeUInt32BE(height, 20);
      return bytes;
    };

    it('gera ícones e telas de abertura do Android e do iOS', async () => {
      mockFs.readFileSync.mockImplementation((...args: unknown[]) =>
        String(args[0]).endsWith('.png') ? pngHeader(480, 320) : '<svg><rect width="130"/><path/></svg>',
      );
      mockFs.readdirSync.mockImplementation((...args: unknown[]) =>
        String(args[0]).endsWith('res')
          ? ['drawable', 'drawable-land-hdpi', 'mipmap-hdpi', 'values']
          : String(args[0]).endsWith('Splash.imageset')
            ? ['splash.png', 'Contents.json']
            : ['splash.png'],
      );
      mockFs.existsSync.mockImplementation((...args: unknown[]) => !String(args[0]).endsWith('sem-splash.png'));
      await import('../../../apps/mobile/icons');
      const outputs = mockRenderSvg.mock.calls.map(call => String(call.slice(3, 4)));
      expect(outputs.some(output => output.endsWith('mipmap-xxxhdpi/ic_launcher.png'))).toBe(true);
      expect(outputs.some(output => output.endsWith('mipmap-mdpi/ic_launcher_foreground.png'))).toBe(true);
      expect(outputs.some(output => output.endsWith('AppIcon-512@2x.png'))).toBe(true);
      expect(outputs.some(output => output.endsWith('Splash.imageset/splash.png'))).toBe(true);
    });

    it('sem os projetos nativos não faz nada', async () => {
      mockFs.existsSync.mockReturnValue(false);
      await import('../../../apps/mobile/icons');
      expect(mockRenderSvg).not.toHaveBeenCalled();
    });
  });
});
