/**
 * Monta em www/ o player web para o Capacitor (WebView do Android 8+ atualizada, Chromium 90+,
 * e Safari do iOS 15+), com os ajustes de celular (mobile.js/mobile.css).
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bundleWeb } from '../../tools/bundle.mjs';

const appDir = dirname(fileURLToPath(import.meta.url));
const scriptCount = bundleWeb(join(appDir, 'www'), {
  target: ['chrome90', 'safari15'],
  extraJs: [join(appDir, 'mobile.js')],
  extraCss: [join(appDir, 'mobile.css')],
});
console.log('www/ pronto:', scriptCount, 'scripts do app');
