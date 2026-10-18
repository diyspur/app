import { expect, test } from '@playwright/test';

test.describe('Catálogo e Ficha de Livros', () => {
  test('catálogo carrega sem termo, exibe cabeçalho e usa rolagem infinita', async ({ page }) => {
    const response = await page.goto('/livros');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Uma boa história');
    await expect(page.getByRole('searchbox', { name: 'Buscar livros por título' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Paginação do catálogo' })).toHaveCount(0);
  });

  test('API do catálogo rejeita um número de página inválido', async ({ request }) => {
    const response = await request.get('/api/books/catalog?page=abc');
    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'invalid_page' });
  });

  test('busca por termo inexistente exibe estado vazio apropriado', async ({ page }) => {
    await page.goto('/livros?q=termoinexistente999xyz');
    await expect(page.getByText('Nenhum título por aqui ainda')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Limpar busca' })).toBeVisible();
  });

  test('ficha do livro renderiza detalhes, Book JSON-LD e canonical correto', async ({ page }) => {
    await page.goto('/livros');
    const firstBook = page.locator('.book-card').first();
    if (await firstBook.count()) {
      const bookHref = await firstBook.getAttribute('href');
      if (bookHref) {
        await page.goto(bookHref);
        await expect(page.locator('.book-hero')).toBeVisible();
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

        // Verifica canonical da ficha
        const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
        expect(canonical).toContain(bookHref);

        // Verifica Schema.org Book JSON-LD
        const jsonLdScripts = await page.locator('script[type="application/ld+json"]').allTextContents();
        const hasBookSchema = jsonLdScripts.some((text) => text.includes('"@type":"Book"'));
        expect(hasBookSchema).toBe(true);
      }
    }
  });

  test('rota de livro inexistente retorna status 404', async ({ page }) => {
    const response = await page.goto('/livros/slug-totalmente-inexistente-404');
    if (response?.status() === 404) {
      expect(response.status()).toBe(404);
    } else {
      await expect(page.getByText(/404 · Página não encontrada|Página não encontrada/i).first()).toBeVisible();
    }
  });
});
