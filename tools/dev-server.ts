/**
 * Servidor de desenvolvimento: monta a versão web em `.dev/`, sem minificar, remonta a cada
 * mudança em `src/` e serve em http://127.0.0.1:8765. Fica fora da `dist/`, que é versionada e só
 * recebe o build de produção. Mudanças em `src/iptv-player.html` pedem reiniciar.
 */
import { rmSync } from 'node:fs';

import { context } from 'esbuild';

import { bundleOptions, WEB_DEV_DIR, WEB_TARGET, writeStaticFiles } from './bundle.ts';

const DEV_HOST = '127.0.0.1';
const DEV_PORT = 8765;

/**
 * Monta a versão web e começa a servir e a remontar a cada mudança.
 */
async function startDevServer(): Promise<void> {
  rmSync(WEB_DEV_DIR, { recursive: true, force: true });
  writeStaticFiles(WEB_DEV_DIR);
  const buildContext = await context({ ...bundleOptions(WEB_DEV_DIR, { target: WEB_TARGET, minify: false }), sourcemap: true });
  await buildContext.watch();
  await buildContext.serve({ servedir: WEB_DEV_DIR, host: DEV_HOST, port: DEV_PORT });
  console.log(`Zapp IPTV em http://${DEV_HOST}:${DEV_PORT}`);
}

export const serverStarted = startDevServer();
