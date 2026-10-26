/**
 * Monta em dist/ o app para LG webOS a partir do player web: código convertido para o
 * Chromium 68 das TVs (webOS 5, TVs LG de 2020), navegação por controle remoto
 * (tv.js/tv.css), appinfo.json e ícones. O ícone é quadrado, sem cantos transparentes: o
 * launcher da LG aplica o próprio formato, e com cantos vazios o ícone parecia menor e com moldura.
 */
import { copyFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleWeb, renderSvg } from '../../tools/bundle.mjs';

const appDir = dirname(fileURLToPath(import.meta.url));
const distDir = join(appDir, 'dist');

const scriptCount = bundleWeb(distDir, { target: 'chrome68', extraJs: [join(appDir, 'tv.js')], extraCss: [join(appDir, 'tv.css')] });
copyFileSync(join(appDir, 'appinfo.json'), join(distDir, 'appinfo.json'));
const squareIconSvg = readFileSync(join(appDir, '..', '..', 'brand', 'icon-tv.svg'), 'utf8').replace(/rx="\d+"/, 'rx="0"');
for (const [fileName, size] of [['icon.png', 80], ['largeIcon.png', 130]]) renderSvg(squareIconSvg, size, size, join(distDir, fileName), '13171aff');
console.log('dist/ pronto:', scriptCount, 'scripts do app');
