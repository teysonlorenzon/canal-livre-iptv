/**
 * Monta o player para cada plataforma: gera `app.js` e `app.css` a partir da entrada da plataforma
 * (bundle minificado e convertido para o navegador alvo), `head.js`, o `index.html` e copia
 * hls.js/mpegts.js para dentro da pasta (sem depender de CDN).
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build, type BuildOptions } from 'esbuild';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

/** Navegadores da versão web: os que têm `<dialog>`, de que o app precisa, e o Chromium das TVs LG de 2020. */
export const WEB_TARGET = ['chrome68', 'edge79', 'firefox98', 'safari15'];

/** Pasta da versão web de produção, versionada no git. */
export const WEB_OUT_DIR = join(root, 'dist');

/** Pasta do servidor de desenvolvimento, fora do git: `dist/` só recebe o build de produção. */
export const WEB_DEV_DIR = join(root, '.dev');

/** Como montar o player para uma plataforma. */
interface BundleOptions {
  /** Navegador alvo do esbuild (ex.: `chrome68`). */
  target: string | string[];
  /** Arquivo de entrada da plataforma (padrão: o player web). */
  entry?: string;
  /** Minificar (padrão: sim). */
  minify?: boolean;
}

/**
 * Opções do esbuild para montar o player.
 * @param outDir Pasta de saída.
 * @param options Como montar.
 * @returns Opções do esbuild.
 */
export function bundleOptions(outDir: string, { target, entry = join(root, 'src/main.ts'), minify = true }: BundleOptions): BuildOptions {
  return {
    entryPoints: { head: join(root, 'src/head.ts'), app: entry },
    outdir: outDir,
    bundle: true,
    format: 'iife',
    target,
    minify,
    charset: 'utf8',
    legalComments: 'none',
    logLevel: 'warning',
  };
}

/**
 * Copia para a pasta o que não passa pelo esbuild: a página, sem espaços entre as tags, e as
 * bibliotecas de vídeo, que já vêm minificadas.
 * @param outDir Pasta de saída.
 */
export function writeStaticFiles(outDir: string): void {
  mkdirSync(join(outDir, 'vendor'), { recursive: true });
  copyFileSync(require.resolve('hls.js/dist/hls.min.js'), join(outDir, 'vendor/hls.min.js'));
  const mpegtsCode = readFileSync(require.resolve('mpegts.js/dist/mpegts.js'), 'utf8');
  writeFileSync(join(outDir, 'vendor/mpegts.js'), mpegtsCode.replace(/\n\/\/# sourceMappingURL=.*\s*$/, ''));
  const pageHtml = readFileSync(join(root, 'src/iptv-player.html'), 'utf8');
  writeFileSync(join(outDir, 'index.html'), pageHtml.replace(/\s+/g, ' ').replace(/> </g, '><').trim());
}

/**
 * Gera a pasta do app.
 * @param outDir Pasta de saída (apagada e recriada).
 * @param options Como montar.
 */
export async function bundleWeb(outDir: string, options: BundleOptions): Promise<void> {
  rmSync(outDir, { recursive: true, force: true });
  await build(bundleOptions(outDir, options));
  writeStaticFiles(outDir);
}

/**
 * Renderiza um SVG num PNG de largura × altura usando o Chrome em modo headless.
 * @param svg Código SVG (com `viewBox`).
 * @param width Largura em px.
 * @param height Altura em px.
 * @param outputPath Arquivo PNG de saída.
 * @param background Cor de fundo da página, em hexadecimal RRGGBBAA (padrão transparente).
 */
export function renderSvg(svg: string, width: number, height: number, outputPath: string, background = '00000000'): void {
  const chromeBinary = ['google-chrome', 'chromium', 'chromium-browser'].find(browserName => {
    try {
      execFileSync('which', [browserName], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  });
  if (!chromeBinary) throw new Error('Chrome não encontrado para gerar as imagens.');
  mkdirSync(dirname(outputPath), { recursive: true });
  const tempHtmlPath = outputPath + '.html';
  writeFileSync(
    tempHtmlPath,
    `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" `)}</body></html>`,
  );
  execFileSync(
    chromeBinary,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      `--default-background-color=${background}`,
      `--window-size=${width},${height}`,
      `--screenshot=${outputPath}`,
      'file://' + tempHtmlPath,
    ],
    { stdio: 'ignore' },
  );
  rmSync(tempHtmlPath);
  if (!existsSync(outputPath)) throw new Error('Falha ao gerar ' + outputPath);
}

/**
 * Gera PNGs quadrados de um ícone SVG.
 * @param svgPath Caminho do SVG.
 * @param outputs Pares [arquivo de saída, tamanho em px].
 * @param background Cor de fundo (padrão transparente), em hexadecimal RRGGBBAA.
 */
export function renderIcons(svgPath: string, outputs: [string, number][], background = '00000000'): void {
  const svg = readFileSync(svgPath, 'utf8');
  for (const [outputPath, size] of outputs) renderSvg(svg, size, size, outputPath, background);
}
