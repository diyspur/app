import { expect, test } from '@playwright/test';

test.describe('Autenticação e Feedback Contextual', () => {
  test('visita anônima ao diário redireciona para entrar com reason=login-required', async ({ page }) => {
    await page.goto('/diario');
    const url = new URL(page.url());
    expect(url.pathname).toBe('/entrar');
    expect(url.searchParams.get('redirect')).toBe('/diario');
    expect(url.searchParams.get('reason')).toBe('login-required');

    const contextualNotice = page.locator('p.notice');
    await expect(contextualNotice).toBeVisible();
    await expect(contextualNotice).toContainText('Entre na sua conta para acessar este espaço');
  });

  test('botão de mostrar/ocultar senha alterna tipo do input', async ({ page }) => {
    await page.goto('/entrar');
    const passwordInput = page.locator('input[name="password"]');
    const toggleButton = page.locator('.password-toggle');

    await expect(passwordInput).toHaveAttribute('type', 'password');
    await toggleButton.click();
    await expect(passwordInput).toHaveAttribute('type', 'text');
    await toggleButton.click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('cadastro exige senha de pelo menos 10 caracteres', async ({ page }) => {
    await page.goto('/cadastro');
    const passwordInput = page.locator('input[name="password"]');
    await expect(passwordInput).toHaveAttribute('minlength', '10');
  });

  test('bloqueia open redirect malicioso para domínios externos', async ({ page }) => {
    await page.route('**/auth/v1/token*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'fake-access-token',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'fake-refresh-token',
          user: {
            id: 'qa-user-id',
            aud: 'authenticated',
            role: 'authenticated',
            email: 'qa@diyspur.com',
          },
        }),
      });
    });

    await page.route('**/perfil*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!DOCTYPE html><html><body><h1>Meu espaço</h1></body></html>',
      });
    });

    await page.goto('/entrar?redirect=https%3A%2F%2Fevil.example.com');
    const origin = new URL(page.url()).origin;
    await page.fill('input[name="email"]', 'qa@diyspur.com');
    await page.fill('input[name="password"]', 'senha123456');
    await page.getByRole('button', { name: 'Entrar na comunidade' }).click();

    await expect(page).toHaveURL(new RegExp(`^${origin}/perfil`));
  });

  test('tela de login exibe botão de esqueci minha senha e não possui magic link', async ({ page }) => {
    await page.goto('/entrar');
    const forgotPasswordLink = page.getByRole('link', { name: 'Esqueci minha senha' });
    await expect(forgotPasswordLink).toBeVisible();
    await expect(forgotPasswordLink).toHaveAttribute('href', /recuperar-senha/);
    await expect(page.getByText('Receber um link de acesso')).not.toBeVisible();
  });
});
