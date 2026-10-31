/**
 * Monta em dist/ a versão web: tudo minificado, num `index.html` que abre em qualquer navegador
 * moderno, inclusive direto do arquivo, sem servidor. A política de privacidade vai junto, no
 * mesmo endereço cadastrado na Google Play e na LG Content Store.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { bundleWeb, root, WEB_OUT_DIR, WEB_TARGET } from './bundle.ts';

const PRIVACY_POLICY_PATH = 'store/play/politica-de-privacidade.html';

/**
 * Monta a versão web.
 */
async function buildWeb(): Promise<void> {
  await bundleWeb(WEB_OUT_DIR, { target: WEB_TARGET });
  mkdirSync(dirname(join(WEB_OUT_DIR, PRIVACY_POLICY_PATH)), { recursive: true });
  copyFileSync(join(root, PRIVACY_POLICY_PATH), join(WEB_OUT_DIR, PRIVACY_POLICY_PATH));
  console.log('dist/ pronto');
}

export const buildFinished = buildWeb();
