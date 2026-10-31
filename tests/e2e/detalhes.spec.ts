import { expect, test, XTREAM_PLAYLIST } from './support/app';

test.describe('detalhes', () => {
  test('filme: abre, favorita e fecha', async ({ app, page }) => {
    await app.openWithList();
    await app.openSection('vod');
    await page.locator('#items .card', { hasText: 'O Chamado' }).click();
    await expect(page.locator('#dDetail')).toBeVisible();
    await expect(page.locator('#detailTitle')).toHaveText('O Chamado');
    await page.locator('#mFav').click();
    await expect(page.locator('#mFav')).toHaveText('★ Favorito');
    await page.locator('#mClose').click();
    await expect(page.locator('#dDetail')).toBeHidden();
    await expect.poll(() => app.stored('ux_e2e')).toMatchObject({ fav: { vod: [expect.any(String)] } });
  });

  test('filme do Xtream traz sinopse, elenco e dados extras', async ({ app, page }) => {
    await app.open({ storage: { pls: [XTREAM_PLAYLIST], active: 'xt' } });
    await app.openSection('vod');
    await page.locator('#items .card').click();
    await expect(page.locator('#detailBody')).toContainText('Sinopse completa');
    await expect(page.locator('#detailBody')).toContainText('Elenco: Elenco Xtream');
    await expect(page.locator('#detailBody')).toContainText('2024');
    await expect(page.locator('#detailBody')).toContainText('★ 8.5');
  });

  test('série: temporadas, episódios e reprodução', async ({ app, page }) => {
    await app.openWithList();
    await app.openSection('series');
    await page.locator('#items .card').click();
    await expect(page.locator('#detailBody')).toContainText('2 temporadas');
    await expect(page.locator('.eps li')).toHaveCount(2);
    await page.locator('[data-s="2"]').click();
    await expect(page.locator('.eps li')).toHaveCount(1);
    await expect(page.locator('[data-s="2"]')).toHaveClass(/on/);
    await page.locator('.eps li').click();
    await expect(page.locator('#dDetail')).toBeHidden();
    await expect(page.locator('#player')).toBeVisible();
    await expect(page.locator('#plTitle')).toHaveText('Minha Série · T2E1');
  });

  test('série do Xtream carrega os episódios da API', async ({ app, page }) => {
    await app.open({ storage: { pls: [XTREAM_PLAYLIST], active: 'xt' } });
    await app.openSection('series');
    await page.locator('#items .card').click();
    await expect(page.locator('.eps')).toContainText('Piloto');
    await expect(page.locator('.eps')).toContainText('45 min');
    await page.locator('#sClose').click();
    await expect(page.locator('#dDetail')).toBeHidden();
  });

  test('série favorita fica marcada', async ({ app, page }) => {
    await app.openWithList();
    await app.openSection('series');
    await page.locator('#items .card').click();
    await page.locator('#sFav').click();
    await expect(page.locator('#sFav')).toHaveText('★ Favorito');
    await page.locator('#sClose').click();
    await page.locator('#items .card').click();
    await expect(page.locator('#sFav')).toHaveText('★ Favorito');
  });

  test('Esc fecha o diálogo', async ({ app, page }) => {
    await app.openWithList();
    await app.openSection('vod');
    await page.locator('#items .card').first().click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#dDetail')).toBeHidden();
  });
});
