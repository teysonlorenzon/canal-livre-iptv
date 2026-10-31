/** @jest-environment node */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { WEB_OUT_DIR } from '../../../tools/bundle';
import { buildWeb } from '../../../tools/web';

/**
 * Caminhos de todos os arquivos de uma pasta, relativos a ela.
 * @param directory Pasta.
 * @returns Caminhos em ordem alfabética.
 */
function listFiles(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => relative(directory, join(entry.parentPath, entry.name)))
    .sort();
}

describe('dist/ versionada', () => {
  it('é igual a um build novo do código atual', async () => {
    const freshDir = mkdtempSync(join(tmpdir(), 'zapp-dist-'));
    try {
      await buildWeb(freshDir);
      const committedFiles = listFiles(WEB_OUT_DIR),
        freshFiles = listFiles(freshDir);
      const staleFiles = [...new Set([...committedFiles, ...freshFiles])].filter(
        file =>
          !committedFiles.includes(file) ||
          !freshFiles.includes(file) ||
          !readFileSync(join(WEB_OUT_DIR, file)).equals(readFileSync(join(freshDir, file))),
      );
      if (staleFiles.length)
        throw new Error(`A dist/ está desatualizada (${staleFiles.join(', ')}). Rode "npm run web:build" e inclua a dist/ no commit.`);
    } finally {
      rmSync(freshDir, { recursive: true, force: true });
    }
  });
});
