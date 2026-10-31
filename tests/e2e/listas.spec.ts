import { expect, M3U_PLAYLIST, MOCK_ORIGIN, test, XTREAM_ORIGIN, XTREAM_PLAYLIST } from './support/app';

test.describe('listas', () => {
  test('adiciona uma lista M3U por URL', async ({ app, page }) => {
    await app.open({ storage: { pls: [] } });
    await page.locator('#wAdd').click();
    await page.locator('#addSeg [data-t="m3u"]').click();
    await page.locator('#aName').fill('Pela URL');
    await page.locator('#aUrl').fill(`${MOCK_ORIGIN}/lista.m3u`);
    await page.locator('#addBtn').click();
    await expect(page.locator('#dSettings')).toBeHidden();
    await expect(page.locator('#plSelTxt')).toHaveText('Pela URL');
    await expect(page.locator('[data-sec="live"]')).toContainText('3 canais');
    await expect(page.locator('[data-sec="vod"]')).toContainText('4 títulos');
    await expect(page.locator('[data-sec="series"]')).toContainText('1 séries');
  });

  test('adiciona uma lista colando o conteúdo', async ({ app, page }) => {
    await app.open({ storage: { pls: [] } });
    await page.locator('#wAdd').click();
    await page.locator('#addSeg [data-t="file"]').click();
    await page.locator('#aName').fill('Colada');
    await page.locator('#aRaw').fill(`#EXTM3U\n#EXTINF:-1 group-title="G",Canal Colado\n${MOCK_ORIGIN}/live/colado.m3u8`);
    await page.locator('#addBtn').click();
    await expect(page.locator('[data-sec="live"]')).toContainText('1 canais');
    await page.reload();
    await expect(page.locator('#plSelTxt')).toHaveText('Colada');
  });

  test('adiciona uma lista por arquivo', async ({ app, page }) => {
    await app.open({ storage: { pls: [] } });
    await page.locator('#wAdd').click();
    await page.locator('#addSeg [data-t="file"]').click();
    await page
      .locator('#aFile')
      .setInputFiles({ name: 'lista.m3u', mimeType: 'audio/x-mpegurl', buffer: Buffer.from(`#EXTM3U\n${MOCK_ORIGIN}/live/arquivo.m3u8`) });
    await page.locator('#addBtn').click();
    await expect(page.locator('[data-sec="live"]')).toContainText('1 canais');
  });

  test('adiciona uma lista Xtream e mostra os dados da conta', async ({ app, page }) => {
    await app.open({ storage: { pls: [] } });
    await page.locator('#wAdd').click();
    await page.locator('#aName').fill('Minha Xtream');
    await page.locator('#aServer').fill(XTREAM_ORIGIN);
    await page.locator('#aUser').fill('eu');
    await page.locator('#aPass').fill('senha');
    await page.locator('#addBtn').click();
    await expect(page.locator('[data-sec="live"]')).toContainText('2 canais');
    await expect(page.locator('[data-sec="vod"]')).toContainText('1 títulos');
    await expect(page.locator('.acct')).toContainText('Usuário eu');
    await expect(page.locator('.acct')).toContainText('Conexões 0/2');
  });

  test('senha errada no Xtream mostra o erro e deixa tentar de novo', async ({ app, page }) => {
    await app.open({ storage: { pls: [{ ...XTREAM_PLAYLIST, pass: 'errada' }], active: 'xt' } });
    await expect(page.locator('#home')).toContainText('Usuário ou senha inválidos');
    await page.locator('#wRetry').click();
    await expect(page.locator('#home')).toContainText('Usuário ou senha inválidos');
  });

  test('URL get.php vira lista Xtream', async ({ app, page }) => {
    await app.open({ storage: { pls: [] } });
    await page.locator('#wAdd').click();
    await page.locator('#addSeg [data-t="m3u"]').click();
    await page.locator('#aUrl').fill(`${XTREAM_ORIGIN}/get.php?username=eu&password=senha&type=m3u_plus`);
    await page.locator('#addBtn').click();
    await expect(page.locator('.acct')).toContainText('Usuário eu');
    expect(await app.stored('pls')).toEqual([expect.objectContaining({ type: 'xtream', user: 'eu' })]);
  });

  test('valida o formulário', async ({ app, page }) => {
    await app.open({ storage: { pls: [] } });
    await page.locator('#wAdd').click();
    await page.locator('#addBtn').click();
    await expect(page.locator('#addError')).toHaveText('Preencha servidor, usuário e senha.');
    await page.locator('#addSeg [data-t="m3u"]').click();
    await page.locator('#addBtn').click();
    await expect(page.locator('#addError')).toHaveText('Informe a URL da lista.');
    await page.locator('#addSeg [data-t="file"]').click();
    await page.locator('#addBtn').click();
    await expect(page.locator('#addError')).toHaveText('Escolha um arquivo ou cole o conteúdo.');
    await page.locator('#aRaw').fill('não é lista');
    await page.locator('#aRaw').fill('#EXTM3U');
    await page.locator('#addBtn').click();
    await expect(page.locator('#addError')).toHaveText('Nenhum canal encontrado no conteúdo');
  });

  test('erro do servidor aparece na tela inicial', async ({ app, page }) => {
    await app.open({ storage: { pls: [{ ...M3U_PLAYLIST, url: `${MOCK_ORIGIN}/erro.m3u` }] } });
    await expect(page.locator('#home')).toContainText('O servidor respondeu com erro 500');
    await page.locator('#wAdd').click();
    await expect(page.locator('#dSettings')).toBeVisible();
  });

  test('o carregamento pode ser cancelado', async ({ app, page }) => {
    await app.open({ storage: { pls: [{ ...M3U_PLAYLIST, url: `${MOCK_ORIGIN}/lenta.m3u` }] } });
    await expect(page.locator('#loading')).toBeVisible();
    await expect(page.locator('#loadingTxt')).toHaveText('Baixando lista…');
    await page.locator('#loadCancel').click();
    await expect(page.locator('#loading')).toBeHidden();
    await expect(page.locator('#home')).toContainText('Carregamento cancelado.');
  });

  test('troca de lista pelo menu e pelo teclado', async ({ app, page }) => {
    await app.open({ storage: { pls: [M3U_PLAYLIST, XTREAM_PLAYLIST], active: M3U_PLAYLIST.id } });
    await expect(page.locator('#plSelTxt')).toHaveText('Lista de Teste');
    await page.locator('#plSel').click();
    await page.locator('#plMenu [data-id="xt"]').click();
    await expect(page.locator('.acct')).toBeVisible();
    await expect(page.locator('#plSelTxt')).toHaveText('Xtream de Teste');
    await page.locator('#plSel').focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await expect(page.locator('#plSelTxt')).toHaveText('Lista de Teste');
  });

  test('o menu fecha com Esc e ao clicar fora', async ({ app, page }) => {
    await app.openWithList();
    await page.locator('#plSel').click();
    await expect(page.locator('#plMenu')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.locator('#plSel').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#plMenu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#plMenu')).toBeHidden();
    await page.locator('#plSel').click();
    await page.locator('#home').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#plMenu')).toBeHidden();
  });

  test('remove uma lista com confirmação', async ({ app, page }) => {
    await app.open({ storage: { pls: [M3U_PLAYLIST, XTREAM_PLAYLIST], active: M3U_PLAYLIST.id } });
    await page.locator('#openSettings').click();
    const removeButton = page.locator('[data-del="xt"]');
    await removeButton.click();
    await expect(removeButton).toHaveText('Confirmar');
    await removeButton.click();
    await expect(page.locator('#plList')).not.toContainText('Xtream de Teste');
    expect(await app.stored('pls')).toHaveLength(1);
  });

  test('atualizar baixa a lista de novo', async ({ app, page }) => {
    await app.openWithList();
    await expect(page.locator('[data-sec="live"]')).toContainText('3 canais');
    const download = page.waitForRequest(`${MOCK_ORIGIN}/lista.m3u`);
    await page.locator('#openSettings').click();
    await page.locator('[data-reload="e2e"]').click();
    await download;
    await expect(page.locator('#dSettings')).toBeHidden();
  });

  test('reabrir usa a cópia salva, sem baixar', async ({ app, page }) => {
    await app.openWithList();
    await expect(page.locator('[data-sec="live"]')).toContainText('3 canais');
    let downloaded = false;
    page.on('request', request => {
      if (request.url().endsWith('/lista.m3u')) downloaded = true;
    });
    await page.reload();
    await expect(page.locator('[data-sec="live"]')).toContainText('3 canais');
    expect(downloaded).toBe(false);
  });
});
