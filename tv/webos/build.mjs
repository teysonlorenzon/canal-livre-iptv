// Monta em dist/ o app para LG webOS a partir do player web (../../iptv-player.html):
// junta os scripts num só arquivo convertido para o Chromium das TVs, copia hls.js/mpegts.js
// para dentro do pacote (sem depender de CDN) e acrescenta a navegação por controle remoto.
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const dist = join(here, 'dist');
// webOS 5 (TVs LG de 2020) usa Chromium 68.
const target = 'chrome68';

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'vendor'), { recursive: true });

const html = readFileSync(join(root, 'iptv-player.html'), 'utf8');
const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
const local = srcs.filter(s => !/^https?:/.test(s));
const head = local.filter(s => html.indexOf(`<script src="${s}">`) < html.indexOf('<body>'));
const body = local.filter(s => !head.includes(s));

const js = files => transformSync(files.map(f => `// ${f}\n` + readFileSync(join(root, f), 'utf8')).join('\n;\n'), { loader: 'js', target, charset: 'utf8' }).code;
writeFileSync(join(dist, 'head.js'), js(head));
writeFileSync(join(dist, 'app.js'), js(body) + '\n' + transformSync(readFileSync(join(here, 'tv.js'), 'utf8'), { loader: 'js', target, charset: 'utf8' }).code);

const css = readFileSync(join(root, 'css/style.css'), 'utf8') + '\n' + readFileSync(join(here, 'tv.css'), 'utf8');
writeFileSync(join(dist, 'style.css'), transformSync(css, { loader: 'css', target, charset: 'utf8' }).code);

copyFileSync(join(here, 'node_modules/hls.js/dist/hls.min.js'), join(dist, 'vendor/hls.min.js'));
copyFileSync(join(here, 'node_modules/mpegts.js/dist/mpegts.js'), join(dist, 'vendor/mpegts.js'));

const page = html
  .replace(/<link rel="stylesheet" href="css\/style.css">/, '<link rel="stylesheet" href="style.css">')
  .replace(/<script src="https:\/\/[^"]*hls[^"]*"><\/script>/, '<script src="vendor/hls.min.js"></script>')
  .replace(/<script src="https:\/\/[^"]*mpegts[^"]*"><\/script>/, '<script src="vendor/mpegts.js"></script>')
  .replace(/<script src="(?!vendor\/)[^"]+"><\/script>\n?/g, '')
  .replace('</head>', '<script src="head.js"></script>\n</head>')
  .replace('</body>', '<script src="app.js"></script>\n</body>');
writeFileSync(join(dist, 'index.html'), page);
copyFileSync(join(here, 'appinfo.json'), join(dist, 'appinfo.json'));

// Ícones PNG gerados a partir do SVG com o Chrome em modo headless.
const chrome = ['google-chrome', 'chromium', 'chromium-browser'].find(b => { try { execFileSync('which', [b]); return true; } catch { return false; } });
if (!chrome) throw new Error('Chrome não encontrado para gerar os ícones.');
const svg = readFileSync(join(here, 'icon.svg'), 'utf8');
for (const [name, size] of [['icon.png', 80], ['largeIcon.png', 130]]) {
  const tmp = join(dist, '_icon.html');
  writeFileSync(tmp, `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000', `--window-size=${size},${size}`, `--screenshot=${join(dist, name)}`, 'file://' + tmp], { stdio: 'ignore' });
  rmSync(tmp);
  if (!existsSync(join(dist, name))) throw new Error('Falha ao gerar ' + name);
}
console.log('dist/ pronto:', body.length + head.length, 'scripts do app');
