/**
 * Monta em app/ o player web para o Electron (Chromium atual, sem conversão para navegadores
 * antigos). O ícone (build/icon.png) fica no repositório; para recriá-lo a partir do SVG da
 * marca, apague o arquivo e rode o build numa máquina com Chrome.
 */
import { existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleWeb, renderIcons } from '../../tools/bundle.mjs';

const appDir = dirname(fileURLToPath(import.meta.url));
const scriptCount = bundleWeb(join(appDir, 'app'), { target: 'chrome130', extraJs: [join(appDir, 'desktop.js')] });
const iconPath = join(appDir, 'build', 'icon.png');
if (!existsSync(iconPath)) renderIcons(join(appDir, '..', '..', 'brand', 'icon-app.svg'), [[iconPath, 512]]);
copyFileSync(iconPath, join(appDir, 'app', 'icon.png'));
console.log('app/ pronto:', scriptCount, 'scripts do app');
