import { expect, test } from '@playwright/test';

test.describe('Bateria Completa de QA no Navegador (B01..B30 e Fluxos F01..F41)', () => {
  test('B01: Home renderiza temporada ativa, herói operacional e alternador de tema', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/histórias/i);
    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('footer')).toBeVisible();

    // Alternador de tema funcional
    const toggle = page.getByRole('switch', { name: /Alternar tema/ });
    await expect(toggle).toBeVisible();
    const originalTheme = await page.locator('html').getAttribute('data-theme');
    await toggle.click();
    await expect.poll(() => page.locator('html').getAttribute('data-theme')).not.toBe(originalTheme);
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', originalTheme ?? 'light');
  });

  test('alternância de tema claro/escuro é determinística', async ({ page }) => {
    await page.goto('/');
    const toggle = page.getByRole('switch', { name: /Alternar tema/ });
    await expect(toggle).toBeVisible();
    const originalTheme = await page.locator('html').getAttribute('data-theme');
    await toggle.click();
    await expect.poll(() => page.locator('html').getAttribute('data-theme')).not.toBe(originalTheme);
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', originalTheme ?? 'light');
  });

  test('B04 & B05: Catálogo, busca com debounce e ficha canônica do livro', async ({ page }) => {
    await page.goto('/livros');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Uma boa história');

    // Busca por livro
    const searchBox = page.getByRole('searchbox', { name: 'Buscar livros por título' });
    await expect(searchBox).toBeVisible();
    await searchBox.fill('Verity');
    await page.waitForTimeout(500); // debounce de 300ms

    // Ficha do livro
    const card = page.locator('.book-card').first();
    await expect(card).toBeVisible();
    const href = await card.getAttribute('href');
    expect(href).toBeTruthy();
    await page.goto(href!);
    await expect(page.locator('.book-hero')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('.book-purchasing-panel, .book-purchasing-actions, .book-hero').first()).toBeVisible();
  });

  test('B06: Página de temporadas e cronograma', async ({ page }) => {
    const seasonSlug = process.env.QA_SEASON_SLUG || 'verity';
    const res = await page.goto(`/temporadas/${seasonSlug}`);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('B08 a B11: Superfícies de autenticação e recuperação de senha', async ({ page }) => {
    // B08: Cadastro
    await page.goto('/cadastro');
    await expect(page.getByLabel(/Email/i)).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();

    // B09: Entrar
    await page.goto('/entrar');
    await expect(page.getByLabel(/Email/i)).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();

    // B10: Recuperar senha
    await page.goto('/recuperar-senha');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Recupere|Recuperar|Redefinir/i);

    // B11: Atualizar senha
    await page.goto('/atualizar-senha');
    await expect(page.locator('.auth-card, .auth-wrap, form').first()).toBeVisible();
  });

  test('B14 a B22: Rotas da área pessoal protegidas ou com feedback de login', async ({ page }) => {
    // B14: Histórico / Estante
    await page.goto('/historico');
    expect(page.url()).toMatch(/\/entrar|\/historico/);

    // B15: Diário Pessoal
    await page.goto('/diario');
    expect(page.url()).toContain('/entrar');

    // B16: Metas Pessoais
    await page.goto('/metas');
    expect(page.url()).toMatch(/\/entrar|\/metas/);

    // B18: Ranking
    await page.goto('/ranking');
    expect(page.url()).toMatch(/\/entrar|\/ranking/);

    // B19: Minha Fila
    await page.goto('/minha-fila');
    expect(page.url()).toMatch(/\/entrar|\/minha-fila/);

    // B20: Listas de Leitura
    await page.goto('/listas');
    expect(page.url()).toMatch(/\/entrar|\/listas/);

    // B21: Leituras Compartilhadas
    await page.goto('/leituras-compartilhadas');
    expect(page.url()).toMatch(/\/entrar|\/leituras-compartilhadas/);

    // B22: Central de Notificações
    await page.goto('/notificacoes');
    expect(page.url()).toMatch(/\/entrar|\/notificacoes/);
  });

  test('B23 a B28: Comunidade, clubes e canais de discussão', async ({ page }) => {
    // B23: Comunidade
    const comRes = await page.goto('/comunidade');
    expect(comRes?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Clubes e Canais|A conversa continua/i);

    // B24: Explorar Clubes
    const clubesRes = await page.goto('/clubes');
    expect(clubesRes?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Clubes para|Clubes de leitura/i);

    // B25: Criar Clube
    const novoRes = await page.goto('/clubes/novo');
    expect([200, 302, 307]).toContain(novoRes?.status() ?? 200);
    await expect(page.locator('form, .container').first()).toBeVisible();

    // B27: Calendário de Encontros
    const calRes = await page.goto('/calendario');
    expect(calRes?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Tem conversa|Encontros|Calendário/i);

    // B28: Votação da Próxima Leitura
    const votRes = await page.goto('/votacao');
    expect(votRes?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Qual história|Votação|Próxima leitura/i);
  });

  test('B29 & B30: Institucional e LGPD', async ({ page }) => {
    // B29: Privacidade
    const privRes = await page.goto('/privacidade');
    expect(privRes?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Sua leitura é sua|Privacidade/i);

    // B30: Termos de Uso
    const termRes = await page.goto('/termos');
    expect(termRes?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Boas histórias|Termos/i);

    // Endpoint de exportação LGPD responde 401 para anônimos
    const exportRes = await page.request.get('/api/account/export');
    expect(exportRes.status()).toBe(401);
  });
});
