import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { expect, test } from './support/app';

test.describe('abertura do app', () => {
  test('mostra a abertura e abre a lista padrão sozinho', async ({ app, page }) => {
    await app.open({ keepIntro: true });
    await expect(page.locator('#intro')).toBeAttached();
    await expect(page.locator('#intro')).not.toBeAttached();
    await expect(page.locator('#plSelTxt')).toHaveText('Canais abertos BR');
    await expect(page.locator('[data-sec="live"]')).toContainText('canais');
    expect(app.pageErrors).toEqual([]);
  });

  test('uma tecla pula a abertura', async ({ app, page }) => {
    await app.open({ keepIntro: true });
    await page.keyboard.press('x');
    await expect(page.locator('#intro')).not.toBeAttached();
  });

  test('toca a animação completa sem "reduzir movimento"', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ reducedMotion: 'no-preference' });
    const page = await context.newPage();
    await page.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
    await page.goto(baseURL ?? '/');
    await expect(page.locator('#intro.go')).toBeAttached();
    await expect(page.locator('#intro')).not.toBeAttached({ timeout: 6000 });
    await context.close();
  });

  test('o build do dist abre direto do arquivo, sem servidor', async ({ page }) => {
    await page.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(join(process.cwd(), 'dist/index.html')).href);
    await expect(page.locator('#plSelTxt')).toHaveText('Canais abertos BR');
    await expect(page.locator('[data-sec="live"]')).toContainText('canais');
    expect(errors).toEqual([]);
  });

  test('a política de privacidade continua no endereço cadastrado nas lojas', async ({ page, baseURL }) => {
    const response = await page.goto(`${baseURL ?? ''}store/play/politica-de-privacidade.html`);
    expect(response?.status()).toBe(200);
    await expect(page.locator('body')).toContainText('Zapp IPTV');
  });

  test('sem listas convida a adicionar', async ({ app, page }) => {
    await app.open({ storage: { pls: [] } });
    await expect(page.locator('#home')).toContainText('Adicione sua lista IPTV');
    await page.locator('#wAdd').click();
    await expect(page.locator('#dSettings')).toBeVisible();
  });

  test('o relógio aparece no topo', async ({ app, page }) => {
    await app.open();
    await expect(page.locator('#clock')).toHaveText(/^\d{2}:\d{2}$/);
  });
});

test.describe('tema', () => {
  test('alterna automático, claro e escuro e salva', async ({ app, page }) => {
    await app.open();
    const html = page.locator('html');
    await expect(html).not.toHaveAttribute('data-theme');
    await page.locator('#themeBtn').click();
    await expect(html).toHaveAttribute('data-theme', 'light');
    await expect(app.toast).toHaveText('Tema: Claro');
    await page.locator('#themeBtn').click();
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await page.locator('#themeBtn').click();
    await expect(html).not.toHaveAttribute('data-theme');
  });

  test('o tema salvo vale ao recarregar', async ({ app, page }) => {
    await app.open({ storage: { theme: 'dark' } });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('#themeBtn')).toHaveAttribute('title', 'Tema: Escuro');
  });
});
