/**
 * Monta em app/ o player web para o Electron (Chromium atual, sem conversão para navegadores
 * antigos). O ícone (build/icon.png) fica no repositório; para recriá-lo a partir do SVG da
 * marca, apague o arquivo e rode o build numa máquina com Chrome.
 */
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

import { bundleWeb, renderIcons } from '../../tools/bundle.ts';

const appDir = dirname(fileURLToPath(import.meta.url));
const appOutDir = join(appDir, 'app');

/**
 * Monta a pasta do app desktop.
 */
async function buildDesktopApp(): Promise<void> {
  await bundleWeb(appOutDir, { target: 'chrome130', entry: join(appDir, 'desktop.ts') });
  await build({
    entryPoints: [join(appDir, 'main.ts')],
    outfile: join(appOutDir, 'main.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron'],
    minify: true,
    legalComments: 'none',
  });
  const iconPath = join(appDir, 'build', 'icon.png');
  if (!existsSync(iconPath)) renderIcons(join(appDir, '..', '..', 'brand', 'icon-app.svg'), [[iconPath, 512]]);
  copyFileSync(iconPath, join(appOutDir, 'icon.png'));
  console.log('app/ pronto');
}

export const buildFinished = buildDesktopApp();
