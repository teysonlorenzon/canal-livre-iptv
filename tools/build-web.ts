/**
 * Monta em dist/ a versão web de produção. A pasta é versionada: o GitHub Pages serve a branch, e
 * o `index.html` da raiz leva para `dist/index.html`. Depois de mexer em `src/`, rode este script
 * e inclua a `dist/` no commit; o teste `tests/unit/tools/dist.test.ts` acusa quando ela está velha.
 */
import { WEB_OUT_DIR } from './bundle.ts';
import { buildWeb } from './web.ts';

export const buildFinished = buildWeb(WEB_OUT_DIR).then(() => console.log('dist/ pronto'));
