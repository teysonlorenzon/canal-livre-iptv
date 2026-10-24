// Monta em www/ o player web para o Capacitor (WebView do Android e do iOS), com os ajustes
// de celular (mobile.js/mobile.css).
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleWeb } from '../../tools/bundle.mjs';

const here = dirname(fileURLToPath(import.meta.url));
// WebView do Android 8+ atualizado (Chromium 90+) e Safari do iOS 15+.
const n = bundleWeb(join(here, 'www'), { target: ['chrome90', 'safari15'], extraJs: [join(here, 'mobile.js')], extraCss: [join(here, 'mobile.css')] });
console.log('www/ pronto:', n, 'scripts do app');
