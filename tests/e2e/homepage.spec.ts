import { expect, test } from '@playwright/test';

test.describe('Página Inicial (Homepage)', () => {
  test('renderiza proposta de valor, hero e links essenciais', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Histórias ganham vida');
    await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Explorar.*livros/i }).first()).toBeVisible();
    await expect(page.locator('footer')).toBeVisible();
  });

  test('permite alternar tema claro e escuro sem regressão', async ({ page }) => {
    await page.goto('/');
    const themeButton = page.getByRole('button', { name: /Alternar tema|Mudar tema|Tema escuro|Tema claro/i });
    if (await themeButton.isVisible()) {
      const initialTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      await themeButton.click();
      const updatedTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      expect(updatedTheme).not.toBe(initialTheme);
    }
  });

  test('skip-link navega diretamente para o conteúdo principal', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skipLink = page.getByRole('link', { name: 'Pular para o conteúdo' });
    await expect(skipLink).toBeFocused();
  });
});
