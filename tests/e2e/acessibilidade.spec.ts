import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { expect, M3U_PLAYLIST, test } from './support/app';

/** Regras do WCAG 2.2 AA e boas práticas do axe. */
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

/** Resumo de uma violação do axe, legível na saída do teste. */
interface ViolationSummary {
  regra: string;
  impacto: string | null | undefined;
  elementos: string[];
}

/**
 * Roda o axe na página (ou numa parte dela) e resume o que encontrou.
 * @param page Página.
 * @param scope Seletor de onde auditar; sem ele, a página inteira.
 * @returns Violações encontradas.
 */
async function audit(page: Page, scope?: string): Promise<ViolationSummary[]> {
  const builder = new AxeBuilder({ page }).withTags(AXE_TAGS);
  if (scope) builder.include(scope);
  const { violations } = await builder.analyze();
  return violations.map(violation => ({
    regra: violation.id,
    impacto: violation.impact,
    elementos: violation.nodes
      .slice(0, 4)
      .map(node => node.target.join(' ') + ' → ' + (node.failureSummary ?? '').split('\n').slice(1, 3).join(' | ')),
  }));
}

/** Temas auditados: cada tela precisa passar nos dois, e no automático do sistema. */
const THEMES = [
  { nome: 'escuro', storage: { theme: 'dark' }, colorScheme: 'dark' },
  { nome: 'claro', storage: { theme: 'light' }, colorScheme: 'light' },
] as const;

for (const theme of THEMES)
  test.describe(`acessibilidade (axe), tema ${theme.nome}`, () => {
    test.use({ colorScheme: theme.colorScheme });

    test('tela inicial sem dados', async ({ app, page }) => {
      await app.openWithList({ ...theme.storage });
      expect(await audit(page)).toEqual([]);
    });

    test('tela inicial com histórico, favoritos, recomendações e Top 10', async ({ app, page }) => {
      const finished = { kind: 'vod', ref: 'vod:x', title: 'Filme Antigo', url: 'http://mock.test/filmes/antigo.mp4' };
      await app.openWithList({
        ...theme.storage,
        ux_e2e: {
          hist: [{ ...finished, desc: finished, pos: 60, dur: 120, t: Date.now() }],
          recentLive: ['x'],
          fav: { live: ['x'], vod: [], series: [] },
        },
      });
      expect(await audit(page)).toEqual([]);
    });

    test('sem listas', async ({ app, page }) => {
      await app.open({ storage: { pls: [], ...theme.storage } });
      expect(await audit(page)).toEqual([]);
    });

    test('lista de canais', async ({ app, page }) => {
      await app.openWithList({ ...theme.storage });
      await app.openSection('live');
      expect(await audit(page)).toEqual([]);
    });

    test('grade de filmes e de séries', async ({ app, page }) => {
      await app.openWithList({ ...theme.storage });
      await app.openSection('vod');
      expect(await audit(page)).toEqual([]);
      await page.locator('#goHome').click();
      await app.openSection('series');
      expect(await audit(page)).toEqual([]);
    });

    test('detalhes de filme e de série', async ({ app, page }) => {
      await app.openWithList({ ...theme.storage });
      await app.openSection('vod');
      await page.locator('#items .card').first().click();
      await expect(page.locator('#dDetail')).toBeVisible();
      expect(await audit(page)).toEqual([]);
      await page.keyboard.press('Escape');
      await page.locator('#goHome').click();
      await app.openSection('series');
      await page.locator('#items .card').first().click();
      await expect(page.locator('.eps li').first()).toBeVisible();
      expect(await audit(page)).toEqual([]);
    });

    test('configurações, em cada tipo de lista', async ({ app, page }) => {
      await app.openWithList({ ...theme.storage });
      await page.locator('#openSettings').click();
      expect(await audit(page)).toEqual([]);
      await page.locator('#addSeg [data-t="m3u"]').click();
      expect(await audit(page)).toEqual([]);
      await page.locator('#addSeg [data-t="file"]').click();
      expect(await audit(page)).toEqual([]);
    });

    test('menu de listas aberto', async ({ app, page }) => {
      await app.openWithList({ ...theme.storage });
      await page.locator('#plSel').click();
      await expect(page.locator('#plMenu')).toBeVisible();
      expect(await audit(page)).toEqual([]);
    });

    test('PIN, com erro', async ({ app, page }) => {
      await app.openWithList({ ...theme.storage, ux_e2e: { locked: ['live:Notícias'] } });
      await app.openSection('live');
      await page.locator('#cats li', { hasText: 'Notícias' }).click();
      await expect(page.locator('#dPin')).toBeVisible();
      expect(await audit(page)).toEqual([]);
      await app.enterPin('1111');
      await expect(page.locator('#pinError')).toBeVisible();
      expect(await audit(page)).toEqual([]);
    });

    test('perfis: seletor e editor', async ({ app, page }) => {
      await app.openWithList({
        ...theme.storage,
        users: [
          { id: 'main', name: 'Principal' },
          { id: 'u1', name: 'Ana', icon: 'star', color: 2 },
        ],
      });
      await expect(page.locator('#dProfiles')).toBeVisible();
      expect(await audit(page)).toEqual([]);
      await page.locator('[data-add-profile]').click();
      await app.enterPin('0000');
      await expect(page.locator('#dProfileEdit')).toBeVisible();
      expect(await audit(page)).toEqual([]);
    });

    test('tela de carregamento', async ({ app, page }) => {
      await app.open({ storage: { pls: [{ ...M3U_PLAYLIST, url: 'http://mock.test/lenta.m3u' }], active: 'e2e', ...theme.storage } });
      await expect(page.locator('#loading')).toBeVisible();
      expect(await audit(page)).toEqual([]);
    });

    test('player com os controles de um filme', async ({ app, page }) => {
      await app.openWithList({ ...theme.storage });
      await app.openSection('vod');
      await page.locator('#items .card').first().click();
      await page.locator('#mPlay').click();
      await app.waitForPlayback();
      expect(await audit(page)).toEqual([]);
    });

    test('player ao vivo com guia, lista lateral e mensagem de falha', async ({ app, page }) => {
      await app.openWithList({ ...theme.storage });
      await app.openSection('live');
      await page.locator('#items li', { hasText: 'Canal Dois' }).click();
      await expect(page.locator('#epgT')).toHaveText('Programa Atual');
      await expect(page.locator('#plMsg h2')).toBeVisible({ timeout: 30000 });
      expect(await audit(page)).toEqual([]);
      await page.locator('#player').hover();
      await page.locator('#cEpg').click();
      await expect(page.locator('#sideList li').first()).toBeVisible();
      expect(await audit(page)).toEqual([]);
      await page.locator('#cList').focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('#sideTitle')).toHaveText('Canais');
      expect(await audit(page)).toEqual([]);
    });
  });

test.describe('acessibilidade pelo teclado', () => {
  test('o link de pular vai para o conteúdo principal', async ({ app, page }) => {
    await app.openWithList();
    await page.keyboard.press('Tab');
    await expect(page.locator('.skip-link')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#app')).toBeFocused();
  });

  test('Tab alcança categorias e canais, e Enter abre o canal', async ({ app, page }) => {
    await app.openWithList();
    await app.openSection('live');
    await page.locator('#cats .cat-btn').first().focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('#cats .cat-btn').nth(1)).toBeFocused();
    await page.locator('#items .row-main').first().focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#player')).toBeVisible();
    await expect(page.locator('#player')).toBeFocused();
  });

  test('o player prende o foco, deixa o fundo inerte e devolve o foco ao fechar', async ({ app, page }) => {
    await app.openWithList();
    await app.openSection('live');
    const opener = page.locator('#items .row-main').first();
    await opener.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#app')).toHaveAttribute('inert', '');
    await expect(page.locator('body > header')).toHaveAttribute('inert', '');
    for (let presses = 0; presses < 40; presses++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.getElementById('app')?.contains(document.activeElement))).toBe(false);
    }
    await page.keyboard.press('Escape');
    await expect(page.locator('#player')).toBeHidden();
    await expect(page.locator('#app')).not.toHaveAttribute('inert', '');
    await expect(opener).toBeFocused();
  });

  test('o erro do formulário é anunciado e liga ao campo', async ({ app, page }) => {
    await app.open({ storage: { pls: [] } });
    await page.locator('#wAdd').click();
    await page.locator('#addBtn').click();
    await expect(page.locator('#addError')).toHaveAttribute('role', 'alert');
    await expect(page.locator('#aServer')).toHaveAttribute('aria-invalid', 'true');
    await page.locator('#aServer').fill('servidor.test');
    await expect(page.locator('#addError')).toBeHidden();
  });

  test('sem rolagem horizontal em 320px de largura', async ({ app, page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await app.openWithList();
    await app.openSection('live');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('com movimento reduzido, as animações ficam praticamente instantâneas', async ({ app, page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await app.openWithList();
    const duration = await page.evaluate(
      () => getComputedStyle(document.querySelector('.card, .tile, button') ?? document.body).transitionDuration,
    );
    expect(parseFloat(duration)).toBeLessThanOrEqual(0.01);
  });
});
