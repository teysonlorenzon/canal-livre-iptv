import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const mockBuild = jest.fn((_options: unknown) => Promise.resolve());
const mockExecFileSync = jest.fn();

jest.mock('esbuild', () => ({ build: (options: unknown): unknown => mockBuild(options) }));
jest.mock('node:child_process', () => ({ execFileSync: (...args: unknown[]): unknown => mockExecFileSync(...args) }));

import { bundleOptions, bundleWeb, renderIcons, renderSvg, root, WEB_OUT_DIR, WEB_TARGET, writeStaticFiles } from '../../../tools/bundle';

describe('build', () => {
  let outDir: string;

  beforeEach(() => {
    outDir = mkdtempSync(join(tmpdir(), 'zapp-'));
    mockBuild.mockClear();
    mockExecFileSync.mockReset();
  });

  afterEach(() => rmSync(outDir, { recursive: true, force: true }));

  describe('opções do esbuild', () => {
    it('gera bundle minificado com a entrada padrão do player', () => {
      expect(bundleOptions('/saida', { target: 'chrome68' })).toMatchObject({
        entryPoints: { head: join(root, 'src/head.ts'), app: join(root, 'src/main.ts') },
        outdir: '/saida',
        bundle: true,
        format: 'iife',
        target: 'chrome68',
        minify: true,
      });
    });

    it('aceita outra entrada e sem minificar', () => {
      expect(bundleOptions('/saida', { target: ['a'], entry: '/tv.ts', minify: false })).toMatchObject({
        entryPoints: { app: '/tv.ts' },
        minify: false,
      });
    });

    it('a versão web sai em dist/ e inclui o Chromium das TVs', () => {
      expect(WEB_OUT_DIR).toBe(join(root, 'dist'));
      expect(WEB_TARGET).toContain('chrome68');
    });
  });

  describe('arquivos estáticos', () => {
    it('gera a página minificada e copia as bibliotecas de vídeo', () => {
      writeStaticFiles(outDir);
      const pageHtml = readFileSync(join(outDir, 'index.html'), 'utf8');
      expect(pageHtml).toContain('<script src="app.js"></script><script src="vendor/hls.min.js">');
      expect(pageHtml).not.toContain('\n');
      expect(existsSync(join(outDir, 'vendor/hls.min.js'))).toBe(true);
      expect(readFileSync(join(outDir, 'vendor/mpegts.js'), 'utf8')).not.toContain('sourceMappingURL');
    });
  });

  describe('bundleWeb', () => {
    it('recria a pasta, gera o bundle e os arquivos estáticos', async () => {
      writeFileSync(join(outDir, 'antigo.txt'), 'x');
      await bundleWeb(outDir, { target: 'chrome68' });
      expect(mockBuild).toHaveBeenCalledTimes(1);
      expect(existsSync(join(outDir, 'antigo.txt'))).toBe(false);
      expect(existsSync(join(outDir, 'index.html'))).toBe(true);
    });
  });

  describe('renderSvg', () => {
    /**
     * Simula o Chrome: acha o executável pelo nome e grava a imagem pedida.
     * @param browserName Navegador instalado.
     * @param shouldWrite Gravar a imagem.
     */
    function installChrome(browserName: string, shouldWrite = true): void {
      mockExecFileSync.mockImplementation((command: string, args: string[]) => {
        if (command === 'which') {
          if (args[0] !== browserName) throw new Error('não instalado');
          return;
        }
        const screenshot = args.find(argument => argument.startsWith('--screenshot='));
        if (screenshot && shouldWrite) writeFileSync(screenshot.slice('--screenshot='.length), 'png');
      });
    }

    it('renderiza com o Chrome disponível e apaga o HTML temporário', () => {
      installChrome('chromium');
      const output = join(outDir, 'sub/icone.png');
      renderSvg('<svg viewBox="0 0 1 1"></svg>', 80, 40, output, 'ffffffff');
      expect(existsSync(output)).toBe(true);
      expect(existsSync(output + '.html')).toBe(false);
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'chromium',
        expect.arrayContaining(['--window-size=80,40', '--default-background-color=ffffffff']),
        { stdio: 'ignore' },
      );
    });

    it('usa fundo transparente por padrão', () => {
      installChrome('google-chrome');
      renderSvg('<svg></svg>', 1, 1, join(outDir, 'a.png'));
      expect(mockExecFileSync).toHaveBeenCalledWith('google-chrome', expect.arrayContaining(['--default-background-color=00000000']), {
        stdio: 'ignore',
      });
    });

    it('falha sem Chrome', () => {
      installChrome('nenhum');
      expect(() => renderSvg('<svg></svg>', 1, 1, join(outDir, 'a.png'))).toThrow('Chrome não encontrado para gerar as imagens.');
    });

    it('falha se a imagem não for gerada', () => {
      installChrome('chromium-browser', false);
      const output = join(outDir, 'a.png');
      expect(() => renderSvg('<svg></svg>', 1, 1, output)).toThrow('Falha ao gerar ' + output);
    });

    it('renderIcons gera cada tamanho', () => {
      installChrome('chromium');
      const svgPath = join(outDir, 'icone.svg');
      writeFileSync(svgPath, '<svg></svg>');
      const first = join(outDir, 'a.png'),
        second = join(outDir, 'b.png');
      renderIcons(svgPath, [
        [first, 16],
        [second, 32],
      ]);
      expect(existsSync(first) && existsSync(second)).toBe(true);
      renderIcons(svgPath, [[first, 16]], '000000ff');
      expect(mockExecFileSync).toHaveBeenLastCalledWith('chromium', expect.arrayContaining(['--default-background-color=000000ff']), {
        stdio: 'ignore',
      });
    });
  });
});
