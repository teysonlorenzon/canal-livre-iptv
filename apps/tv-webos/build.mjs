// Monta em dist/ o app para LG webOS a partir do player web: código convertido para o
// Chromium das TVs, navegação por controle remoto (tv.js/tv.css), appinfo.json e ícones.
import { copyFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleWeb, renderSvg } from '../../tools/bundle.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, 'dist');

// webOS 5 (TVs LG de 2020) usa Chromium 68.
const n = bundleWeb(dist, { target: 'chrome68', extraJs: [join(here, 'tv.js')], extraCss: [join(here, 'tv.css')] });
copyFileSync(join(here, 'appinfo.json'), join(dist, 'appinfo.json'));
// Ícone quadrado, sem cantos transparentes: o launcher da LG aplica o próprio formato, e com
// cantos vazios o ícone parecia menor e com moldura.
const icon = readFileSync(join(here, '..', '..', 'brand', 'icon-tv.svg'), 'utf8').replace(/rx="\d+"/, 'rx="0"');
for (const [name, size] of [['icon.png', 80], ['largeIcon.png', 130]]) renderSvg(icon, size, size, join(dist, name), '13171aff');
console.log('dist/ pronto:', n, 'scripts do app');
