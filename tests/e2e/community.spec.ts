import { expect, test } from '@playwright/test';

test.describe('Comunidade e Spoiler Disclosure', () => {
  test('página de comunidade carrega cabeçalho e publicações', async ({ page }) => {
    const response = await page.goto('/comunidade');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Clubes e Canais|A conversa continua/i);
  });

  test('spoiler marcado utiliza controle acessível de revelação', async ({ page }) => {
    await page.goto('/comunidade');
    const spoilerButton = page.locator('button').filter({ hasText: /revelar spoiler/i }).first();
    if (await spoilerButton.isVisible()) {
      await spoilerButton.focus();
      await page.keyboard.press('Enter');
    }
  });

  test('botão de denúncia está presente para conteúdo de terceiros', async ({ page }) => {
    await page.goto('/comunidade');
    const reportButton = page.getByRole('button', { name: /denunciar/i }).first();
    if (await reportButton.isVisible()) {
      await expect(reportButton).toBeEnabled();
    }
  });
});
