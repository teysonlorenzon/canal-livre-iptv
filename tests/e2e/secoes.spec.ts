import { expect, test } from './support/app';

test.describe('seções', () => {
  test('lista os canais e as categorias', async ({ app, page }) => {
    await app.openWithList();
    await app.openSection('live');
    await expect(page.locator('#secTitle')).toHaveText('TV ao vivo');
    await expect(page.locator('#items li')).toHaveCount(3);
    await expect(page.locator('#cats li').first()).toContainText('Todos');
    await expect(page.locator('#cats')).toContainText('Abertos');
    await page.locator('#cats li', { hasText: 'Notícias' }).click();
    await expect(page.locator('#items li')).toHaveCount(1);
    await expect(page.locator('#items li')).toContainText('Canal Três');
  });

  test('mostra o programa atual quando há guia', async ({ app, page }) => {
    await app.openWithList();
    await app.openSection('live');
    await expect(page.locator('#items li', { hasText: 'Canal Um' })).toContainText('Jornal da Hora');
    await expect(page.locator('#items li', { hasText: 'Canal Dois' })).toContainText('CATCH-UP');
  });

  test('a busca filtra pelo nome', async ({ app, page }) => {
    await app.openWithList();
    await app.openSection('vod');
    await page.locator('#q').fill('velozes');
    await expect(page.locator('#items .card')).toHaveCount(2);
    await page.locator('#q').fill('não existe');
    await expect(page.locator('#items')).toContainText('Nada encontrado.');
  });

  test('a tecla / foca a busca', async ({ app, page }) => {
    await app.openWithList();
    await app.openSection('live');
    await page.locator('#secTitle').click();
    await page.keyboard.press('/');
    await expect(page.locator('#q')).toBeFocused();
  });

  test('ordena de A a Z e de Z a A', async ({ app, page }) => {
    await app.openWithList();
    await app.openSection('vod');
    await page.locator('#sortDd .dd-btn').click();
    await page.locator('#sortDd li', { hasText: 'A → Z' }).click();
    await expect(page.locator('#items .card b').first()).toHaveText('Filme Proibido');
    await expect(page.locator('#sortDd .dd-btn')).toHaveAccessibleName('Ordenar: A → Z');
    await page.locator('#sortDd .dd-btn').click();
    await page.locator('#sortDd li', { hasText: 'Z → A' }).click();
    await expect(page.locator('#items .card b').first()).toHaveText('Velozes e Furiosos 2');
  });

  test('a ordenação funciona pelo teclado e em séries', async ({ app, page }) => {
    await app.openWithList();
    await app.openSection('series');
    await page.locator('#sortDd .dd-btn').focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#sortDd li[aria-selected=true]')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.locator('#sortDd .dd-btn')).toHaveAccessibleName('Ordenar: A → Z');
    await expect(page.locator('#sortDd .dd-btn')).toBeFocused();
    await page.locator('#sortDd .dd-btn').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#sortDdMenu')).toBeHidden();
  });

  test('canais não têm ordenação por nota', async ({ app, page }) => {
    await app.openWithList();
    await app.openSection('live');
    await expect(page.locator('#sortDd [data-value=rate]')).toHaveJSProperty('hidden', true);
    await page.locator('#goHome').click();
    await app.openSection('vod');
    await expect(page.locator('#sortDd [data-value=rate]')).toHaveJSProperty('hidden', false);
  });

  test('favorita um canal e ele aparece nos favoritos e na tela inicial', async ({ app, page }) => {
    await app.openWithList();
    await app.openSection('live');
    await page.locator('#items li', { hasText: 'Canal Dois' }).locator('.star').click();
    await expect(page.locator('#cats li', { hasText: 'Favoritos' })).toContainText('1');
    await page.locator('#cats li', { hasText: 'Favoritos' }).click();
    await expect(page.locator('#items li')).toHaveCount(1);
    await page.locator('#goHome').click();
    await expect(page.locator('.shelf-fav')).toContainText('Canal Dois');
    await page.locator('[data-sec="live"]').click();
    await page.locator('#cats li', { hasText: 'Favoritos' }).click();
    await page.locator('#items .star').click();
    await expect(page.locator('#items')).toContainText('Nenhum favorito nesta seção.');
  });

  test('pagina listas grandes', async ({ app, page }) => {
    const canais = Array.from(
      { length: 250 },
      (_, index) => `#EXTINF:-1 group-title="G",Canal ${index}\nhttp://mock.test/live/${index}.m3u8`,
    ).join('\n');
    await app.open({ storage: { pls: [{ id: 'g', name: 'Grande', type: 'm3u' }], active: 'g', m3u_g: `#EXTM3U\n${canais}` } });
    await app.openSection('live');
    await expect(page.locator('#items li')).toHaveCount(200);
    await page.locator('#moreBtn').click();
    await expect(page.locator('#items li')).toHaveCount(250);
    await expect(page.locator('#moreBtn')).toHaveCount(0);
  });

  test('uma lista pequena não mostra "Mostrar mais"', async ({ app, page }) => {
    await app.openWithList();
    await app.openSection('live');
    await expect(page.locator('#moreBtn')).toHaveCount(0);
    expect(app.pageErrors).toEqual([]);
  });

  test('o logo volta para o início', async ({ app, page }) => {
    await app.openWithList();
    await app.openSection('live');
    await page.locator('#goHome').click();
    await expect(page.locator('#home')).toBeVisible();
    await expect(page.locator('#section')).toBeHidden();
  });
});
