/**
 * Monta o player web (iptv-player.html) como pasta pronta para empacotar em outra plataforma
 * (TV LG, desktop, celular): junta os scripts num só arquivo convertido para o navegador alvo,
 * copia hls.js/mpegts.js para dentro (sem depender de CDN) e acrescenta scripts/estilos extras.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { transformSync } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

/**
 * Gera a pasta do app.
 * @param {string} outDir Pasta de saída (apagada e recriada).
 * @param {object} options Opções.
 * @param {string} options.target Navegador alvo do esbuild (ex.: `chrome68`).
 * @param {string[]} [options.extraJs] Scripts acrescentados ao fim do app (ex.: navegação por controle).
 * @param {string[]} [options.extraCss] Folhas de estilo acrescentadas ao fim.
 * @param {string[]} [options.headHtml] HTML extra no `<head>` (ex.: `<script src="capacitor.js">`).
 * @returns {number} Quantidade de scripts do app incluídos.
 */
export function bundleWeb(outDir, { target, extraJs = [], extraCss = [], headHtml = [] }){
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, 'vendor'), { recursive: true });

  const html = readFileSync(join(root, 'iptv-player.html'), 'utf8');
  const scriptSources = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(match => match[1]);
  const localScripts = scriptSources.filter(source => !/^https?:/.test(source));
  const headScripts = localScripts.filter(source => html.indexOf(`<script src="${source}">`) < html.indexOf('<body>'));
  const bodyScripts = localScripts.filter(source => !headScripts.includes(source));

  /**
   * Junta os scripts, marcando o início de cada um com o caminho, e converte para o navegador alvo.
   * @param {string[]} filePaths Caminhos absolutos ou relativos à raiz do repositório.
   * @returns {string} Código convertido.
   */
  const transpileScripts = filePaths => transformSync(filePaths.map(filePath => `// ${filePath}\n` + readFileSync(filePath.startsWith('/') ? filePath : join(root, filePath), 'utf8')).join('\n;\n'), { loader: 'js', target, charset: 'utf8' }).code;
  writeFileSync(join(outDir, 'head.js'), transpileScripts(headScripts));
  writeFileSync(join(outDir, 'app.js'), transpileScripts([...bodyScripts, ...extraJs]));

  const cssText = [join(root, 'src/styles/style.css'), ...extraCss].map(filePath => readFileSync(filePath, 'utf8')).join('\n');
  writeFileSync(join(outDir, 'style.css'), transformSync(cssText, { loader: 'css', target, charset: 'utf8' }).code);

  copyFileSync(require.resolve('hls.js/dist/hls.min.js'), join(outDir, 'vendor/hls.min.js'));
  copyFileSync(require.resolve('mpegts.js/dist/mpegts.js'), join(outDir, 'vendor/mpegts.js'));

  const pageHtml = html
    .replace(/<!--[\s\S]*?-->\n?/g, '')
    .replace(/<link rel="stylesheet" href="src\/styles\/style.css">/, '<link rel="stylesheet" href="style.css">')
    .replace(/<script src="https:\/\/[^"]*hls[^"]*"><\/script>/, '<script src="vendor/hls.min.js"></script>')
    .replace(/<script src="https:\/\/[^"]*mpegts[^"]*"><\/script>/, '<script src="vendor/mpegts.js"></script>')
    .replace(/<script src="(?!vendor\/)[^"]+"><\/script>\n?/g, '')
    .replace('</head>', [...headHtml, '<script src="head.js"></script>'].join('\n') + '\n</head>')
    .replace('</body>', '<script src="app.js"></script>\n</body>');
  writeFileSync(join(outDir, 'index.html'), pageHtml);
  return headScripts.length + bodyScripts.length;
}

/**
 * Renderiza um SVG num PNG de largura × altura usando o Chrome em modo headless.
 * @param {string} svg Código SVG (com `viewBox`).
 * @param {number} width Largura em px.
 * @param {number} height Altura em px.
 * @param {string} outputPath Arquivo PNG de saída.
 * @param {string} [background] Cor de fundo da página, em hexadecimal RRGGBBAA (padrão transparente).
 * @returns {void}
 */
export function renderSvg(svg, width, height, outputPath, background = '00000000'){
  const chromeBinary = ['google-chrome', 'chromium', 'chromium-browser'].find(browserName => { try { execFileSync('which', [browserName], { stdio: 'ignore' }); return true; } catch { return false; } });
  if (!chromeBinary) throw new Error('Chrome não encontrado para gerar as imagens.');
  mkdirSync(dirname(outputPath), { recursive: true });
  const tempHtmlPath = outputPath + '.html';
  writeFileSync(tempHtmlPath, `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" `)}</body></html>`);
  execFileSync(chromeBinary, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--default-background-color=${background}`, `--window-size=${width},${height}`, `--screenshot=${outputPath}`, 'file://' + tempHtmlPath], { stdio: 'ignore' });
  rmSync(tempHtmlPath);
  if (!existsSync(outputPath)) throw new Error('Falha ao gerar ' + outputPath);
}

/**
 * Gera PNGs quadrados de um ícone SVG.
 * @param {string} svgPath Caminho do SVG.
 * @param {Array<[string, number]>} outputs Pares [arquivo de saída, tamanho em px].
 * @param {string} [background] Cor de fundo (padrão transparente), em hexadecimal RRGGBBAA.
 * @returns {void}
 */
export function renderIcons(svgPath, outputs, background = '00000000'){
  const svg = readFileSync(svgPath, 'utf8');
  for (const [outputPath, size] of outputs) renderSvg(svg, size, size, outputPath, background);
}

export { root };
