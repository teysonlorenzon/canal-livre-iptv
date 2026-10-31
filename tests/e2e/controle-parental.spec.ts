import { expect, test } from './support/app';

test.describe('controle parental', () => {
  test('categoria bloqueada pede o PIN', async ({ app, page }) => {
    await app.openWithList();
    await page.locator('#openSettings').click();
    await page.locator('[data-k="live:Notícias"][data-t="locked"]').check();
    await page.locator('#closeSettings').click();
    await app.openSection('live');
    await expect(page.locator('#items li')).toHaveCount(2);
    await page.locator('#cats li', { hasText: 'Notícias' }).click();
    await expect(page.locator('#dPin')).toBeVisible();
    await app.enterPin('1111');
    await expect(page.locator('#pinError')).toBeVisible();
    await app.enterPin('0000');
    await expect(page.locator('#dPin')).toBeHidden();
    await expect(page.locator('#items li')).toHaveCount(1);
  });

  test('cancelar o PIN mantém o bloqueio', async ({ app, page }) => {
    await app.openWithList({ ux_e2e: { locked: ['live:Notícias'] } });
    await app.openSection('live');
    await page.locator('#cats li', { hasText: 'Notícias' }).click();
    await page.locator('#pinCancel').click();
    await expect(page.locator('#dPin')).toBeHidden();
    await expect(page.locator('#items li')).toHaveCount(2);
  });

  test('desbloquear uma categoria exige o PIN', async ({ app, page }) => {
    await app.openWithList({ ux_e2e: { locked: ['live:Notícias'] } });
    await page.locator('#openSettings').click();
    await page.locator('[data-k="live:Notícias"][data-t="locked"]').click();
    await expect(page.locator('#dPin')).toBeVisible();
    await app.enterPin('0000');
    await expect(page.locator('#dSettings')).toBeVisible();
    await expect(page.locator('[data-k="live:Notícias"][data-t="locked"]')).not.toBeChecked();
  });

  test('ocultar tira a categoria da seção', async ({ app, page }) => {
    await app.openWithList();
    await page.locator('#openSettings').click();
    await page.locator('[data-k="live:Notícias"][data-t="hidden"]').check();
    await page.locator('#closeSettings').click();
    await expect(page.locator('[data-sec="live"]')).toContainText('3 canais');
    await app.openSection('live');
    await expect(page.locator('#cats')).not.toContainText('Notícias');
    await expect(page.locator('#items li')).toHaveCount(2);
  });

  test('bloqueia as categorias adultas automaticamente', async ({ app, page }) => {
    await app.openWithList();
    await page.locator('#openSettings').click();
    await page.locator('#autoAdult').click();
    await expect(app.toast).toHaveText('1 categorias bloqueadas.');
    await page.locator('#catSec').selectOption('vod');
    await expect(page.locator('[data-k="vod:Adultos XXX"][data-t="locked"]')).toBeChecked();
    await page.locator('#autoAdult').click();
    await expect(app.toast).toHaveText('Nenhuma categoria adulta encontrada.');
  });

  test('categoria de seção não baixada pede para abrir', async ({ app, page }) => {
    await app.open({ storage: { pls: [] } });
    await page.locator('#wAdd').click();
    await expect(page.locator('#catRows')).toContainText('Abra uma lista para configurar as categorias.');
  });

  test('troca o PIN', async ({ app, page }) => {
    await app.openWithList();
    await page.locator('#openSettings').click();
    await page.locator('#pinOld').fill('9999');
    await page.locator('#pinSave').click();
    await expect(app.toast).toHaveText('PIN atual incorreto.');
    await page.locator('#pinOld').fill('0000');
    await page.locator('#pinNew').fill('12');
    await page.locator('#pinSave').click();
    await expect(app.toast).toHaveText('O novo PIN precisa ter de 4 a 8 números.');
    await page.locator('#pinNew').fill('4321');
    await page.locator('#pinSave').click();
    await expect(app.toast).toHaveText('PIN alterado.');
    expect(await app.stored('opts')).toMatchObject({ pin: '4321' });
  });

  test('salva as opções de reprodução', async ({ app, page }) => {
    await app.openWithList();
    await page.locator('#openSettings').click();
    await page.locator('#optFmt').selectOption('ts');
    await page.locator('#optAuto').selectOption('0');
    expect(await app.stored('opts')).toMatchObject({ fmt: 'ts', auto: '0' });
    await page.reload();
    await page.locator('#openSettings').click();
    await expect(page.locator('#optFmt')).toHaveValue('ts');
    await expect(page.locator('#optAuto')).toHaveValue('0');
  });

  test('limpa o histórico', async ({ app, page }) => {
    await app.openWithList({ ux_e2e: { recentLive: ['x'] } });
    await page.locator('#openSettings').click();
    await page.locator('#clearHist').click();
    await expect(app.toast).toHaveText('Histórico limpo.');
    expect(await app.stored('ux_e2e')).toMatchObject({ recentLive: [] });
  });
});
