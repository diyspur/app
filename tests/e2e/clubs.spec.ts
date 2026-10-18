import { expect, test } from '@playwright/test';

test.describe('Higiene e Listagem de Clubes', () => {
  test('listagem pública de clubes carrega com sucesso', async ({ page }) => {
    const response = await page.goto('/clubes');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Clubes para|Clubes de leitura/i);
  });

  test('não exibe fixtures de teste residual como QA RETESTE 20261010', async ({ page }) => {
    await page.goto('/clubes');
    const content = await page.content();
    expect(content).not.toContain('QA RETESTE 20261010');
    expect(content).not.toContain('QA RETESTE');
  });

  test('clube arquivado não é retornado na listagem pública', async ({ page }) => {
    await page.goto('/clubes');
    const archivedBadges = page.locator('.member-card').filter({ hasText: 'arquivado' });
    expect(await archivedBadges.count()).toBe(0);
  });
});
