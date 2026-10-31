/**
 * Monta a versão web numa pasta: tudo minificado, num `index.html` que abre em qualquer navegador
 * moderno, inclusive direto do arquivo, sem servidor. A política de privacidade vai junto, no
 * mesmo caminho cadastrado na Google Play e na LG Content Store.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { bundleWeb, root, WEB_TARGET } from './bundle.ts';

const PRIVACY_POLICY_PATH = 'store/play/politica-de-privacidade.html';

/**
 * Monta a versão web.
 * @param outDir Pasta de saída (apagada e recriada).
 */
export async function buildWeb(outDir: string): Promise<void> {
  await bundleWeb(outDir, { target: WEB_TARGET });
  mkdirSync(dirname(join(outDir, PRIVACY_POLICY_PATH)), { recursive: true });
  copyFileSync(join(root, PRIVACY_POLICY_PATH), join(outDir, PRIVACY_POLICY_PATH));
}
