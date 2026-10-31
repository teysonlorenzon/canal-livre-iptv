import { expect, M3U_PLAYLIST, MOCK_ORIGIN, test } from './support/app';

test.describe('player', () => {
  test('toca um filme e mostra os controles de tempo', async ({ app, page }) => {
    await app.openWithList();
    await app.openSection('vod');
    await page.locator('#items .card', { hasText: 'O Chamado' }).click();
    await page.locator('#mPlay').click();
    await expect(page.locator('#player')).toBeVisible();
    await expect(page.locator('#plTitle')).toHaveText('O Chamado');
    await app.waitForPlayback();
    await expect(page.locator('#seekRow')).toBeVisible();
    await expect(page.locator('#tDur')).toHaveText('2:00');
    await expect(page.locator('#plMsg')).toBeEmpty();
    expect(app.pageErrors).toEqual([]);
  });

  test('pausa, retoma, pula 10 s e silencia', async ({ app, page }) => {
    await app.openWithList();
    await app.openSection('vod');
    await page.locator('#items .card').first().click();
    await page.locator('#mPlay').click();
    await app.waitForPlayback();
    await page.locator('#cPlay').click();
    await expect.poll(async () => (await app.videoState()).paused).toBe(true);
    await page.locator('#cPlay').click();
    await expect.poll(async () => (await app.videoState()).paused).toBe(false);
    const before = (await app.videoState()).currentTime;
    await page.locator('#cFwd10').click();
    await expect.poll(async () => (await app.videoState()).currentTime).toBeGreaterThan(before + 5);
    await page.locator('#cBack10').click();
    await page.locator('#cMute').click();
    await expect.poll(async () => (await app.videoState()).muted).toBe(true);
  });

  test('a proporção da tela é salva', async ({ app, page }) => {
    await app.openWithList();
    await app.openSection('vod');
    await page.locator('#items .card').first().click();
    await page.locator('#mPlay').click();
    await page.locator('#cRatio').selectOption('cover');
    await expect.poll(async () => (await app.videoState()).objectFit).toBe('cover');
    expect(await app.stored('ratio')).toBe('cover');
  });

  test('salva o progresso, aparece em Continuar assistindo e retoma', async ({ app, page }) => {
    await app.openWithList();
    await app.openSection('vod');
    await page.locator('#items .card', { hasText: 'O Chamado' }).click();
    await page.locator('#mPlay').click();
    await app.waitForPlayback();
    await page.locator('#seek').evaluate((seek: HTMLInputElement) => {
      seek.value = '500';
      seek.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect.poll(async () => (await app.videoState()).currentTime).toBeGreaterThan(50);
    await page.locator('#plBack').click();
    await expect(page.locator('#player')).toBeHidden();
    await page.locator('#goHome').click();
    await expect(page.locator('.shelf-cont')).toContainText('O Chamado');
    await page.reload();
    await page.locator('.shelf-cont .card').click();
    await expect(page.locator('#player')).toBeVisible();
    await expect.poll(async () => (await app.videoState()).currentTime).toBeGreaterThan(50);
  });

  test('canal fora do ar mostra o motivo e permite tentar de novo', async ({ app, page }) => {
    await app.openWithList();
    await app.openSection('live');
    await page.locator('#items li').first().click();
    await expect(page.locator('#plMsg h2')).toHaveText('Não foi possível tocar', { timeout: 30000 });
    await expect(page.locator('#plMsg a')).toHaveAttribute('href', `${MOCK_ORIGIN}/live/um.m3u8`);
    await page.locator('#fRetry').click();
    await expect(page.locator('#plMsg h2')).toHaveText('Não foi possível tocar', { timeout: 30000 });
    expect(app.pageErrors).toEqual([]);
  });

  test('copia o link do conteúdo que falhou', async ({ app, page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await app.openWithList();
    await app.openSection('live');
    await page.locator('#items li').first().click();
    await page.locator('#fCopy').click({ timeout: 30000 });
    await expect(app.toast).toContainText('Link copiado');
  });

  test('canal ao vivo mostra a programação', async ({ app, page }) => {
    await app.openWithList();
    await app.openSection('live');
    await page.locator('#items li', { hasText: 'Canal Dois' }).click();
    await expect(page.locator('#plTitle')).toHaveText('2  Canal Dois');
    await expect(page.locator('#epgT')).toHaveText('Programa Atual');
    await expect(page.locator('#epgN')).toContainText('Programa Futuro');
    await expect(page.locator('#epgLeft')).toContainText('falta');
  });

  test('canal sem guia avisa', async ({ app, page }) => {
    await app.openWithList();
    await app.openSection('live');
    await page.locator('#items li', { hasText: 'Canal Três' }).click();
    await expect(page.locator('#epgT')).toHaveText('Programação não disponível para este canal');
  });

  test('o guia lateral marca o programa atual e toca o catch-up', async ({ app, page }) => {
    await app.openWithList();
    await app.openSection('live');
    await page.locator('#items li', { hasText: 'Canal Dois' }).click();
    await page.locator('#player').hover();
    await page.locator('#cEpg').click();
    await expect(page.locator('#sideTitle')).toHaveText('Guia · Canal Dois');
    await expect(page.locator('#sideList li')).toHaveCount(3);
    await expect(page.locator('#sideList .cur')).toContainText('AGORA');
    await page.locator('#sideList li', { hasText: 'Programa Futuro' }).click();
    await expect(app.toast).toHaveText('Programa ainda não começou.');
    await page.locator('#sideList .past').click();
    await expect(page.locator('#plTitle')).toContainText('Canal Dois · Programa Passado');
  });

  test('a lista lateral troca de canal', async ({ app, page }) => {
    await app.openWithList();
    await app.openSection('live');
    await page.locator('#items li').first().click();
    await page.locator('#player').hover();
    await page.locator('#cList').click();
    await expect(page.locator('#sideList .on')).toContainText('Canal Um');
    await page.locator('#sideList li', { hasText: 'Canal Dois' }).click();
    await expect(page.locator('#plTitle')).toHaveText('2  Canal Dois');
    await page.locator('#sideClose').click();
    await expect(page.locator('#side')).toBeHidden();
  });

  test('atalhos: setas trocam de canal, L abre a lista e Esc fecha', async ({ app, page }) => {
    await app.openWithList();
    await app.openSection('live');
    await page.locator('#items li').first().click();
    await page.locator('#plTitle').click();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#plTitle')).toHaveText('2  Canal Dois');
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('#plTitle')).toHaveText('1  Canal Um');
    await page.keyboard.press('l');
    await expect(page.locator('#side')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#side')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(page.locator('#player')).toBeHidden();
  });

  test('digitar o número troca de canal', async ({ app, page }) => {
    await app.openWithList();
    await app.openSection('live');
    await page.locator('#items li').first().click();
    await page.locator('#plTitle').click();
    await page.keyboard.press('3');
    await expect(page.locator('#numpad')).toHaveText('3');
    await expect(page.locator('#plTitle')).toHaveText('3  Canal Três');
    await page.keyboard.press('9');
    await expect(app.toast).toHaveText('Canal 9 não existe.');
  });

  test('o favorito do canal funciona no player', async ({ app, page }) => {
    await app.openWithList();
    await app.openSection('live');
    await page.locator('#items li').first().click();
    await page.locator('#player').hover();
    await page.locator('#cFav').click();
    await expect(page.locator('#cFav svg')).toHaveClass(/on/);
  });

  test('recentes ficam guardados', async ({ app, page }) => {
    await app.openWithList();
    await app.openSection('live');
    await page.locator('#items li').first().click();
    await page.locator('#plBack').click();
    await page.locator('#goHome').click();
    await expect(page.locator('.shelf-recent')).toContainText('Canal Um');
  });

  test('o próximo episódio começa sozinho no fim', async ({ app, page }) => {
    const curto = `#EXTM3U\n#EXTINF:-1 group-title="Série Curta",Curta S01E01\n${MOCK_ORIGIN}/series/curto1.mp4\n#EXTINF:-1 group-title="Série Curta",Curta S01E02\n${MOCK_ORIGIN}/series/curto2.mp4`;
    await app.open({ storage: { pls: [{ ...M3U_PLAYLIST, url: undefined }], active: 'e2e', m3u_e2e: curto } });
    await app.openSection('series');
    await page.locator('#items .card').click();
    await page.locator('.eps li').first().click();
    await expect(page.locator('#plTitle')).toHaveText('Curta · T1E2', { timeout: 15000 });
  });

  test('com a opção desligada não avança', async ({ app, page }) => {
    const curto = `#EXTM3U\n#EXTINF:-1 group-title="Série Curta",Curta S01E01\n${MOCK_ORIGIN}/series/curto1.mp4\n#EXTINF:-1 group-title="Série Curta",Curta S01E02\n${MOCK_ORIGIN}/series/curto2.mp4`;
    await app.open({ storage: { pls: [{ ...M3U_PLAYLIST, url: undefined }], active: 'e2e', m3u_e2e: curto, opts: { auto: '0' } } });
    await app.openSection('series');
    await page.locator('#items .card').click();
    await page.locator('.eps li').first().click();
    await app.waitForPlayback();
    await expect.poll(async () => (await app.videoState()).currentTime, { timeout: 8000 }).toBeGreaterThan(1.5);
    await page.waitForTimeout(800);
    await expect(page.locator('#plTitle')).toHaveText('Curta · T1E1');
  });

  test('a barra lateral lista os episódios da série', async ({ app, page }) => {
    await app.openWithList();
    await app.openSection('series');
    await page.locator('#items .card').click();
    await page.locator('.eps li').first().click();
    await page.locator('#player').hover();
    await expect(page.locator('#cList')).toHaveText('Episódios');
    await page.locator('#cList').click();
    await expect(page.locator('#sideList li')).toHaveCount(3);
    await page.locator('#sideList li', { hasText: 'T2E1' }).click();
    await expect(page.locator('#plTitle')).toHaveText('Minha Série · T2E1');
  });

  test('avisa quando a internet cai no ao vivo e reconecta quando ela volta', async ({ app, page }) => {
    const list = `#EXTM3U\n#EXTINF:-1 group-title="G",Canal Som\n${MOCK_ORIGIN}/live/som.webm`;
    await app.open({ storage: { pls: [{ ...M3U_PLAYLIST, url: undefined }], active: 'e2e', m3u_e2e: list } });
    await app.openSection('live');
    await page.locator('#items li').click();
    await app.waitForPlayback();
    const announcements = await page.evaluate(() => {
      const readMessage = (): string => document.getElementById('plMsg')?.textContent ?? '';
      window.dispatchEvent(new Event('offline'));
      const afterOffline = readMessage();
      window.dispatchEvent(new Event('online'));
      return { afterOffline, afterOnline: readMessage() };
    });
    expect(announcements.afterOffline).toContain('Sem internet');
    expect(announcements.afterOnline).toContain('Conexão de volta, reconectando…');
    await expect(page.locator('#plMsg')).toBeEmpty();
    await app.waitForPlayback();
  });

  test('canal de vídeo direto toca pelo player nativo', async ({ app, page }) => {
    const list = `#EXTM3U\n#EXTINF:-1 group-title="G",Canal Som\n${MOCK_ORIGIN}/live/som.webm`;
    await app.open({ storage: { pls: [{ ...M3U_PLAYLIST, url: undefined }], active: 'e2e', m3u_e2e: list } });
    await app.openSection('live');
    await page.locator('#items li').click();
    await app.waitForPlayback();
    await expect(page.locator('#plMsg')).toBeEmpty();
    expect(app.pageErrors).toEqual([]);
  });

  test('o botão de transmitir para a TV é acessível e avisa quando o navegador não transmite', async ({ app, page }) => {
    await app.openWithList();
    await app.openSection('vod');
    await page.locator('#items .card').first().click();
    await page.locator('#mPlay').click();
    await app.waitForPlayback();
    const castButton = page.getByRole('button', { name: 'Transmitir para a TV' });
    await expect(castButton).toHaveAttribute('aria-pressed', 'false');
    await castButton.focus();
    await expect(castButton).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#toast, [role="status"]').first()).toBeAttached();
  });
});
