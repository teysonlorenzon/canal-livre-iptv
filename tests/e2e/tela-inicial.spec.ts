import { hashString } from '../../src/data/m3u';
import { expect, M3U_PLAYLIST, MOCK_ORIGIN, test } from './support/app';

/** Chave do filme "Velozes e Furiosos" na lista de teste (hash da URL). */
const VELOZES_KEY = hashString(`${MOCK_ORIGIN}/filmes/velozes.mp4`);

const DESC = { kind: 'vod', ref: 'vod:x', title: 'Filme Antigo', url: 'http://mock.test/filmes/antigo.mp4' };

/**
 * Registro de histórico salvo.
 * @param extra Campos a trocar.
 * @returns Registro.
 */
const historyEntry = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...DESC,
  desc: DESC,
  pos: 60,
  dur: 120,
  t: Date.now(),
  ...extra,
});

test.describe('tela inicial', () => {
  test('mostra as prateleiras vazias com a explicação', async ({ app, page }) => {
    await app.openWithList();
    await expect(page.locator('.shelf-recent')).toContainText('Os canais que você assistir aparecem aqui.');
    await expect(page.locator('.shelf-fav')).toContainText('Toque na estrela');
    await expect(page.locator('.shelf-cont')).toContainText('Filmes e episódios que você começar aparecem aqui.');
  });

  test('Continuar assistindo mostra o progresso e remove', async ({ app, page }) => {
    await app.openWithList({ ux_e2e: { hist: [historyEntry()] } });
    const card = page.locator('.shelf-cont .card');
    await expect(card).toContainText('Filme Antigo');
    await expect(card.locator('.pg')).toHaveAttribute('style', /width: ?50%/);
    await card.hover();
    await card.locator('.card-del').click();
    await expect(app.toast).toHaveText('Removido do histórico.');
    await expect(page.locator('.shelf-cont .card')).toHaveCount(0);
  });

  test('filme terminado sai de Continuar e vai para Assistidos', async ({ app, page }) => {
    const finished = { ...DESC, ref: 'vod:' + VELOZES_KEY, title: 'Velozes e Furiosos' };
    await app.openWithList({ ux_e2e: { hist: [{ ...finished, desc: finished, pos: 118, dur: 120, t: Date.now() }] } });
    await expect(page.locator('.shelf-cont .card')).toHaveCount(0);
    await expect(page.locator('.shelf-watchedvod')).toContainText('Velozes e Furiosos');
  });

  test('recomenda a sequência do filme assistido', async ({ app, page }) => {
    const finished = { ...DESC, ref: 'vod:' + VELOZES_KEY, title: 'Velozes e Furiosos' };
    await app.openWithList({ ux_e2e: { hist: [{ ...finished, desc: finished, pos: 118, dur: 120, t: Date.now() }] } });
    const shelf = page.locator('.shelf-recvod');
    await expect(shelf).toContainText('Porque você assistiu “Velozes e Furiosos”');
    await expect(shelf).toContainText('Velozes e Furiosos 2');
    await shelf.locator('.card').first().click();
    await expect(page.locator('#dDetail')).toBeVisible();
  });

  test('Top 10 usa a categoria de destaque da lista', async ({ app, page }) => {
    const list =
      '#EXTM3U\n#EXTINF:-1 group-title="Filmes Top 10",Sucesso\nhttp://mock.test/filmes/sucesso.mp4\n#EXTINF:-1 group-title="Filmes Ação",Outro\nhttp://mock.test/filmes/outro.mp4';
    await app.open({ storage: { pls: [{ ...M3U_PLAYLIST, url: undefined }], active: 'e2e', m3u_e2e: list } });
    const shelf = page.locator('.shelf-topvod');
    await expect(shelf).toContainText('Top 10 filmes da semana');
    await expect(shelf).toContainText('Sucesso');
    await expect(shelf.locator('.top-rank')).toHaveText('1');
    await shelf.locator('.card').click();
    await expect(page.locator('#detailBody h3')).toHaveText('Sucesso');
  });

  test('as setas rolam as prateleiras cheias', async ({ app, page }) => {
    const list = [
      '#EXTM3U',
      ...Array.from({ length: 12 }, (_, index) => `#EXTINF:-1 group-title="G",Canal ${index}\nhttp://mock.test/live/${index}.m3u8`),
    ].join('\n');
    await app.open({ storage: { pls: [{ ...M3U_PLAYLIST, url: undefined }], active: 'e2e', m3u_e2e: list } });
    await app.openSection('live');
    for (const index of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) await page.locator('#items li .star').nth(index).click();
    await page.locator('#goHome').click();
    const shelf = page.locator('.shelf-fav');
    const nextArrow = shelf.locator('.scroll-arrow.next');
    await expect(nextArrow).toBeVisible();
    await nextArrow.click();
    await expect.poll(() => shelf.locator('.strip').evaluate(strip => strip.scrollLeft)).toBeGreaterThan(0);
  });
});
