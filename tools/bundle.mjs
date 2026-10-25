// Monta o player web (iptv-player.html) como pasta pronta para empacotar em outra plataforma
// (TV LG, desktop, celular): junta os scripts num só arquivo convertido para o navegador alvo,
// copia hls.js/mpegts.js para dentro (sem depender de CDN) e acrescenta scripts/estilos extras.
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
 * @param {object} o Opções.
 * @param {string} o.target Navegador alvo do esbuild (ex.: `chrome68`).
 * @param {string[]} [o.extraJs] Scripts acrescentados ao fim do app (ex.: navegação por controle).
 * @param {string[]} [o.extraCss] Folhas de estilo acrescentadas ao fim.
 * @param {string[]} [o.headHtml] HTML extra no `<head>` (ex.: `<script src="capacitor.js">`).
 * @returns {number} Quantidade de scripts do app incluídos.
 */
export function bundleWeb(outDir, { target, extraJs = [], extraCss = [], headHtml = [] }){
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, 'vendor'), { recursive: true });

  const html = readFileSync(join(root, 'iptv-player.html'), 'utf8');
  const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
  const local = srcs.filter(s => !/^https?:/.test(s));
  const head = local.filter(s => html.indexOf(`<script src="${s}">`) < html.indexOf('<body>'));
  const body = local.filter(s => !head.includes(s));

  const js = files => transformSync(files.map(f => `// ${f}\n` + readFileSync(f.startsWith('/') ? f : join(root, f), 'utf8')).join('\n;\n'), { loader: 'js', target, charset: 'utf8' }).code;
  writeFileSync(join(outDir, 'head.js'), js(head));
  writeFileSync(join(outDir, 'app.js'), js([...body, ...extraJs]));

  const css = [join(root, 'src/styles/style.css'), ...extraCss].map(f => readFileSync(f, 'utf8')).join('\n');
  writeFileSync(join(outDir, 'style.css'), transformSync(css, { loader: 'css', target, charset: 'utf8' }).code);

  copyFileSync(require.resolve('hls.js/dist/hls.min.js'), join(outDir, 'vendor/hls.min.js'));
  copyFileSync(require.resolve('mpegts.js/dist/mpegts.js'), join(outDir, 'vendor/mpegts.js'));

  const page = html
    .replace(/<!--[\s\S]*?-->\n?/g, '')
    .replace(/<link rel="stylesheet" href="src\/styles\/style.css">/, '<link rel="stylesheet" href="style.css">')
    .replace(/<script src="https:\/\/[^"]*hls[^"]*"><\/script>/, '<script src="vendor/hls.min.js"></script>')
    .replace(/<script src="https:\/\/[^"]*mpegts[^"]*"><\/script>/, '<script src="vendor/mpegts.js"></script>')
    .replace(/<script src="(?!vendor\/)[^"]+"><\/script>\n?/g, '')
    .replace('</head>', [...headHtml, '<script src="head.js"></script>'].join('\n') + '\n</head>')
    .replace('</body>', '<script src="app.js"></script>\n</body>');
  writeFileSync(join(outDir, 'index.html'), page);
  return head.length + body.length;
}

/**
 * Renderiza um SVG num PNG de largura × altura usando o Chrome em modo headless.
 * @param {string} svg Código SVG (com `viewBox`).
 * @param {number} w Largura em px.
 * @param {number} h Altura em px.
 * @param {string} out Arquivo PNG de saída.
 * @param {string} [bg] Cor de fundo da página, em hexadecimal RRGGBBAA (padrão transparente).
 * @returns {void}
 */
export function renderSvg(svg, w, h, out, bg = '00000000'){
  const chrome = ['google-chrome', 'chromium', 'chromium-browser'].find(b => { try { execFileSync('which', [b], { stdio: 'ignore' }); return true; } catch { return false; } });
  if (!chrome) throw new Error('Chrome não encontrado para gerar as imagens.');
  mkdirSync(dirname(out), { recursive: true });
  const tmp = out + '.html';
  writeFileSync(tmp, `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" `)}</body></html>`);
  execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--default-background-color=${bg}`, `--window-size=${w},${h}`, `--screenshot=${out}`, 'file://' + tmp], { stdio: 'ignore' });
  rmSync(tmp);
  if (!existsSync(out)) throw new Error('Falha ao gerar ' + out);
}

/**
 * Gera PNGs quadrados de um ícone SVG.
 * @param {string} svgPath Caminho do SVG.
 * @param {Array<[string, number]>} outputs Pares [arquivo de saída, tamanho em px].
 * @param {string} [bg] Cor de fundo (padrão transparente), em hexadecimal RRGGBBAA.
 * @returns {void}
 */
export function renderIcons(svgPath, outputs, bg = '00000000'){
  const svg = readFileSync(svgPath, 'utf8');
  for (const [out, size] of outputs) renderSvg(svg, size, size, out, bg);
}

export { root };
