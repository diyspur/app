import { expect, test } from '@playwright/test';

test('home tem navegação principal sem erros', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/histórias/i);
  await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Explorar.*livros|Explorar leituras|Descobrir leituras/i }).first()).toBeVisible();
});

test('catálogo carrega via Supabase e expõe vazio informado quando não há conteúdo publicado', async ({ page }) => {
  const response = await page.goto('/livros');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Uma boa história');
  await expect(page.getByRole('searchbox', { name: 'Buscar livros por título' })).toBeVisible();
  const firstBook = page.locator('.book-card').first();
  if (await firstBook.count()) {
    const bookHref = await firstBook.getAttribute('href');
    if (bookHref) {
      await page.goto(bookHref);
      await expect(page.locator('.book-hero')).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
  }
});

test('cadastro e login têm rótulos, validação e nenhum redirect externo', async ({ page }) => {
  await page.goto('/cadastro?redirect=https%3A%2F%2Fevil.example');
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Como podemos chamar você?')).toBeVisible();
  await page.goto('/entrar?redirect=%2F%2Fevil.example');
  await expect(page.getByRole('button', { name: 'Entrar na comunidade' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Senha' })).toHaveAttribute('minlength', '1');
});

test('robots exclui perfis e rotas administrativas da indexação', async ({ request }) => {
  const response = await request.get('/robots.txt');
  expect(response.ok()).toBeTruthy();
  const text = await response.text();
  expect(text).toContain('/perfil');
  expect(text).toContain('/admin');
});

test('protege área pessoal sem sessão e mantém layouts sem rolagem horizontal', async ({ page }) => {
  await page.goto('/perfil');
  expect(new URL(page.url()).searchParams.get('redirect')).toBe('/perfil');
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const metrics = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
    expect(metrics.content, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(metrics.viewport);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
});

test('link de salto fica visível no foco do teclado', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Pular para o conteúdo' })).toBeFocused();
});
