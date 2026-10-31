import { expect, test } from './support/app';

const TWO_PROFILES = [
  { id: 'main', name: 'Principal' },
  { id: 'u1', name: 'Ana', icon: 'star', color: 2 },
];

test.describe('perfis', () => {
  test('com um perfil só não pergunta quem está assistindo', async ({ app, page }) => {
    await app.openWithList();
    await expect(page.locator('#dProfiles')).toBeHidden();
    await expect(page.locator('#profileBtn')).toHaveAttribute('title', 'Usuário: Principal');
  });

  test('com vários perfis pergunta na abertura e troca', async ({ app, page }) => {
    await app.openWithList({ users: TWO_PROFILES });
    await expect(page.locator('#dProfiles')).toBeVisible();
    await page.locator('[data-profile="u1"]').click();
    await expect(page.locator('#dProfiles')).toBeHidden();
    await expect(app.toast).toHaveText('Olá, Ana!');
    await expect(page.locator('#profileBtn')).toHaveAttribute('title', 'Usuário: Ana');
    expect(await app.stored('user')).toBe('u1');
  });

  test('cria um usuário com ícone e cor, depois do PIN do Principal', async ({ app, page }) => {
    await app.openWithList();
    await page.locator('#profileBtn').click();
    await page.locator('[data-add-profile]').click();
    await expect(page.locator('#pinTitle')).toHaveText('Criar usuário');
    await app.enterPin('0000');
    await page.locator('#profileEditName').fill('Bia');
    await page.locator('[data-icon="avCat"]').click();
    await page.locator('[data-color="3"]').click();
    await expect(page.locator('#profileEditPreview .avatar')).toHaveClass(/avatar-c3/);
    await page.locator('#profileEditSave').click();
    await expect(app.toast).toHaveText('Usuário Bia criado.');
    await expect(page.locator('#profileCards')).toContainText('Bia');
    expect(await app.stored('users')).toEqual([expect.anything(), expect.objectContaining({ name: 'Bia', icon: 'avCat', color: 3 })]);
  });

  test('exige o nome', async ({ app, page }) => {
    await app.openWithList();
    await page.locator('#openSettings').click();
    await page.locator('#profileAdd').click();
    await app.enterPin('0000');
    await page.locator('#profileEditSave').click();
    await expect(page.locator('#profileEditError')).toHaveText('Digite o nome do usuário.');
    await page.locator('#profileEditCancel').click();
    await expect(page.locator('#dSettings')).toBeVisible();
  });

  test('edita um usuário', async ({ app, page }) => {
    await app.openWithList({ users: TWO_PROFILES });
    await page.locator('#profilesClose').click();
    await page.locator('#openSettings').click();
    await page.locator('[data-edit-profile="u1"]').click();
    await expect(page.locator('#profileEditTitle')).toHaveText('Editar usuário');
    await page.locator('#profileEditName').fill('Ana Maria');
    await page.keyboard.press('Enter');
    await expect(app.toast).toHaveText('Usuário salvo.');
    await expect(page.locator('#profileList')).toContainText('Ana Maria');
  });

  test('cada usuário tem seu histórico, favoritos e tema', async ({ app, page }) => {
    await app.openWithList({ users: TWO_PROFILES });
    await page.locator('#profilesClose').click();
    await app.openSection('live');
    await page.locator('#items .star').first().click();
    await page.locator('#themeBtn').click();
    await page.locator('#goHome').click();
    await expect(page.locator('.shelf-fav .card')).toHaveCount(1);
    await page.locator('#profileBtn').click();
    await page.locator('[data-profile="u1"]').click();
    await expect(page.locator('.shelf-fav .card')).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveAttribute('data-theme');
    await page.locator('#profileBtn').click();
    await page.locator('[data-profile="main"]').click();
    await expect(page.locator('.shelf-fav .card')).toHaveCount(1);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('perfil protegido pede o PIN dele', async ({ app, page }) => {
    await app.openWithList({
      users: [
        { id: 'main', name: 'Principal' },
        { id: 'u1', name: 'Ana', askPin: true },
      ],
      'opts@u1': { pin: '4321' },
    });
    await page.locator('[data-profile="u1"]').click();
    await expect(page.locator('#pinHint')).toHaveText('Digite o PIN de Ana.');
    await app.enterPin('0000');
    await expect(page.locator('#pinError')).toBeVisible();
    await app.enterPin('4321');
    await expect(app.toast).toHaveText('Olá, Ana!');
  });

  test('o último perfil protegido trava o seletor na abertura', async ({ app, page }) => {
    await app.openWithList({
      users: [
        { id: 'main', name: 'Principal', askPin: true },
        { id: 'u1', name: 'Ana' },
      ],
    });
    await expect(page.locator('#profilesClose')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(page.locator('#dProfiles')).toBeVisible();
    await page.locator('[data-profile="main"]').click();
    await app.enterPin('0000');
    await expect(page.locator('#dProfiles')).toBeHidden();
  });

  test('liga o Pedir PIN e avisa do PIN padrão', async ({ app, page }) => {
    await app.openWithList();
    await page.locator('#openSettings').click();
    await page.locator('[data-askpin="main"]').check();
    await expect(app.toast).toContainText('ainda é o padrão 0000');
    await expect(page.locator('[data-askpin="main"]')).toBeChecked();
  });

  test('remove um usuário com confirmação', async ({ app, page }) => {
    await app.openWithList({ users: TWO_PROFILES, 'opts@u1': { pin: '1234' } });
    await page.locator('#profilesManage').click();
    await expect(page.locator('#dSettings')).toBeVisible();
    await expect(page.locator('[data-del-profile="main"]')).toHaveCount(0);
    const removeButton = page.locator('[data-del-profile="u1"]');
    await removeButton.click();
    await expect(removeButton).toHaveText('Confirmar');
    await removeButton.click();
    await expect(app.toast).toHaveText('Usuário Ana removido.');
    expect(await app.stored('opts@u1')).toBeNull();
  });
});
