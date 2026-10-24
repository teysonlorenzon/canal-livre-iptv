// Monta em app/ o player web para o Electron (Chromium atual, sem conversão para navegadores
// antigos). O ícone (build/icon.png) fica no repositório; para recriá-lo a partir do SVG da
// marca, apague o arquivo e rode o build numa máquina com Chrome.
import { existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleWeb, renderIcons } from '../../tools/bundle.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const n = bundleWeb(join(here, 'app'), { target: 'chrome130', extraJs: [join(here, 'desktop.js')] });
const icon = join(here, 'build', 'icon.png');
if (!existsSync(icon)) renderIcons(join(here, '..', '..', 'brand', 'icon-app.svg'), [[icon, 512]]);
copyFileSync(icon, join(here, 'app', 'icon.png'));
console.log('app/ pronto:', n, 'scripts do app');
