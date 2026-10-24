// Monta em dist/ o app para LG webOS a partir do player web: código convertido para o
// Chromium das TVs, navegação por controle remoto (tv.js/tv.css), appinfo.json e ícones.
import { copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleWeb, renderIcons } from '../../tools/bundle.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, 'dist');

// webOS 5 (TVs LG de 2020) usa Chromium 68.
const n = bundleWeb(dist, { target: 'chrome68', extraJs: [join(here, 'tv.js')], extraCss: [join(here, 'tv.css')] });
copyFileSync(join(here, 'appinfo.json'), join(dist, 'appinfo.json'));
renderIcons(join(here, 'icon.svg'), [[join(dist, 'icon.png'), 80], [join(dist, 'largeIcon.png'), 130]]);
console.log('dist/ pronto:', n, 'scripts do app');
