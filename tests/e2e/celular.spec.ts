import { expect, test } from './support/app';

const PORTRAIT = { width: 390, height: 844 };
const LANDSCAPE = { width: 844, height: 390 };

test.describe('celular', () => {
  for (const [name, viewport] of Object.entries({ retrato: PORTRAIT, paisagem: LANDSCAPE }))
    test(`${name}: nenhuma tela rola para o lado`, async ({ app, page }) => {
      await page.setViewportSize(viewport);
      await app.openWithList();
      const overflow = (): Promise<number> =>
        page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(await overflow()).toBeLessThanOrEqual(0);
      await app.openSection('live');
      expect(await overflow()).toBeLessThanOrEqual(0);
      await page.locator('#goHome').click();
      await page.locator('#openSettings').click();
      await expect(page.locator('#dSettings')).toBeVisible();
      expect(await overflow()).toBeLessThanOrEqual(0);
    });

  test('abre uma seção e toca um canal pelo toque', async ({ app, page }) => {
    await page.setViewportSize(PORTRAIT);
    await app.openWithList();
    await page.locator('[data-sec="live"]').tap();
    await page.locator('#items li').first().tap();
    await expect(page.locator('#player')).toBeVisible();
    await expect(page.locator('#plTitle')).toHaveText('1  Canal Um');
  });

  test('os diálogos cabem na tela', async ({ app, page }) => {
    await page.setViewportSize(PORTRAIT);
    await app.openWithList();
    await app.openSection('vod');
    await page.locator('#items .card').first().tap();
    const box = await page.locator('#dDetail').boundingBox();
    expect(box?.width ?? 0).toBeLessThanOrEqual(PORTRAIT.width);
  });
});
