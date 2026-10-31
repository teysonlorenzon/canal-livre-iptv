import type { Page } from '@playwright/test';

import { expect, test } from './support/app';

const KEY_BACK = 461;
const KEY_RED = 403;
const KEY_YELLOW = 405;
const KEY_BLUE = 406;
const KEY_STOP = 413;

/**
 * Aperta uma tecla do controle da LG, que só existe pelo código numérico.
 * @param page Página.
 * @param keyCode Código da tecla.
 */
async function pressRemote(page: Page, keyCode: number): Promise<void> {
  await page.evaluate(code => {
    const target = document.activeElement ?? document.body;
    target.dispatchEvent(new KeyboardEvent('keydown', { keyCode: code, bubbles: true, cancelable: true }));
  }, keyCode);
}

test.describe('TV LG', () => {
  test('começa em "TV ao vivo" e anda pelas setas', async ({ app, page }) => {
    await app.openWithList();
    await expect(page.locator('html')).toHaveClass(/tv/);
    await expect(page.locator('.tile.live')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-sec="vod"]')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-sec="series"]')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('[data-sec="vod"]')).toBeFocused();
    expect(app.pageErrors).toEqual([]);
  });

  test('OK abre a seção e Voltar retorna um nível por vez', async ({ app, page }) => {
    await app.openWithList();
    await expect(page.locator('.tile.live')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#section')).toBeVisible();
    await pressRemote(page, KEY_BACK);
    await expect(page.locator('#home')).toBeVisible();
    await expect(page.locator('.tile').first()).toBeFocused();
  });

  test('Voltar no início pergunta antes de sair, com foco em Cancelar', async ({ app, page }) => {
    await app.openWithList();
    await pressRemote(page, KEY_BACK);
    await expect(page.locator('#dExit')).toBeVisible();
    await expect(page.locator('#exitNo')).toBeFocused();
    await pressRemote(page, KEY_BACK);
    await expect(page.locator('#dExit')).toBeHidden();
  });

  test('o player recebe as teclas do controle', async ({ app, page }) => {
    await app.openWithList();
    await page.keyboard.press('Enter');
    await page.locator('#items li').first().click();
    await expect(page.locator('#player')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#plTitle')).toHaveText('2  Canal Dois');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#cPlay')).toBeFocused();
    await pressRemote(page, KEY_BACK);
    await expect(page.locator('#player')).toHaveClass(/idle/);
    await pressRemote(page, KEY_STOP);
    await expect(page.locator('#player')).toBeHidden();
  });

  test('botão vermelho abre a busca', async ({ app, page }) => {
    await app.openWithList();
    await pressRemote(page, KEY_RED);
    await expect(page.locator('#q')).toBeFocused();
    await expect(page.locator('#section')).toBeVisible();
  });

  test('botão amarelo favorita o canal focado', async ({ app, page }) => {
    await app.openWithList();
    await page.keyboard.press('Enter');
    await expect(page.locator('#section')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#items li').first()).toBeFocused();
    await pressRemote(page, KEY_YELLOW);
    await expect(app.toast).toHaveText('Adicionado aos favoritos');
    await pressRemote(page, KEY_YELLOW);
    await expect(app.toast).toHaveText('Removido dos favoritos');
  });

  test('botão azul remove dos recentes e devolve o foco', async ({ app, page }) => {
    await app.openWithList();
    await page.keyboard.press('Enter');
    await page.locator('#items li').first().click();
    await pressRemote(page, KEY_STOP);
    await page.locator('#goHome').click();
    await page.locator('.shelf-recent .card').focus();
    await pressRemote(page, KEY_BLUE);
    await expect(page.locator('.shelf-recent .card')).toHaveCount(0);
    await expect(page.locator('#home .tile').first()).toBeFocused();
  });

  test('campo de texto só abre o teclado com OK', async ({ app, page }) => {
    await app.openWithList();
    await page.locator('#openSettings').click();
    const field = page.locator('#aName');
    await field.focus();
    await expect(field).toHaveJSProperty('readOnly', true);
    await page.keyboard.press('Enter');
    await expect(field).toHaveJSProperty('readOnly', false);
    await pressRemote(page, KEY_BACK);
    await expect(field).toHaveJSProperty('readOnly', true);
    await expect(page.locator('#dSettings')).toBeVisible();
  });

  test('a interface da TV não usa CSS zoom', async ({ app, page }) => {
    await app.openWithList();
    const usesZoom = await page.evaluate(() => getComputedStyle(document.documentElement).zoom);
    expect(usesZoom).toBe('1');
  });
});
