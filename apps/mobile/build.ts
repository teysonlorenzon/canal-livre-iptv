/**
 * Monta em www/ o player web para o Capacitor (WebView do Android 8+ atualizada, Chromium 90+,
 * e Safari do iOS 15+), com os ajustes de celular (mobile.ts/mobile.css).
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bundleWeb } from '../../tools/bundle.ts';

const appDir = dirname(fileURLToPath(import.meta.url));
export const buildFinished = bundleWeb(join(appDir, 'www'), { target: ['chrome90', 'safari15'], entry: join(appDir, 'mobile.ts') }).then(
  () => console.log('www/ pronto'),
);
