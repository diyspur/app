import { test, expect, type Page } from '@playwright/test';

/**
 * Suite E2E de Telemetria e Validação de Conformidade (Task 10 / OBS-01).
 *
 * Valida os 6 cenários centrais de observabilidade, privacidade (LGPD/GDPR),
 * Google Consent Mode v2, adaptadores de analytics, métricas Prometheus e health check.
 */

const ANALYTICS_REGEX =
  /(posthog\.com|google-analytics\.com|analytics\.google\.com|googletagmanager\.com|clarity\.ms|grafana\.net)/i;

/**
 * Utilitário de captura e mock defensivo para domínios de telemetria externos.
 * Intercepta chamadas de rede para PostHog, GA4, Clarity e Grafana Faro,
 * evitando dependência de conectividade externa e garantindo gravação precisa.
 */
function attachAnalyticsInterceptor(page: Page) {
  const requests: string[] = [];

  // Mock e captura das rotas de telemetria
  page.route(ANALYTICS_REGEX, (route) => {
    requests.push(route.request().url());
    const resourceType = route.request().resourceType();
    const url = route.request().url();

    if (
      resourceType === 'script' ||
      url.endsWith('.js') ||
      url.includes('/tag/') ||
      url.includes('/gtag/')
    ) {
      route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: '/* mocked analytics script */',
      });
    } else {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', mocked: true }),
      });
    }
  });

  // Listener para capturar requisições mesmo se tratadas via beacon ou ping
  page.on('request', (request) => {
    const url = request.url();
    if (ANALYTICS_REGEX.test(url) && !requests.includes(url)) {
      requests.push(url);
    }
  });

  return {
    getRequests: () => requests,
    clear: () => {
      requests.length = 0;
    },
  };
}

test.describe('E2E Telemetria & Conformidade de Privacidade (Task 10)', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('Cenário 1 (Sem Decisão): Política estrita fail-closed bloqueia 100% de conexões analíticas', async ({
    page,
  }) => {
    const interceptor = attachAnalyticsInterceptor(page);

    await page.goto('/livros');
    await page.waitForLoadState('domcontentloaded');

    // 1. O banner de consentimento deve estar visível para o usuário sem escolha prévia
    const banner = page.locator('.analytics-consent');
    await expect(banner).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /Privacidade e preferências de telemetria/i })
    ).toBeVisible();

    // 2. Prova de conformidade estrita: 0 requisições enviadas para domínios analíticos
    await page.waitForTimeout(500);
    expect(interceptor.getRequests().length).toBe(0);

    // 3. Prova no localStorage e Window: nenhum consentimento concedido
    const storedConsent = await page.evaluate(() =>
      window.localStorage.getItem('diyspur.analytics-consent.v1')
    );
    expect(storedConsent).toBeNull();

    const dataLayer = await page.evaluate(
      () => (window as unknown as { dataLayer?: unknown[] }).dataLayer
    );
    expect(dataLayer).toBeUndefined();
  });

  test('Cenário 2 (Consentimento Recusado): Clicar em "Recusar" bloqueia requisições mesmo após navegação', async ({
    page,
  }) => {
    const interceptor = attachAnalyticsInterceptor(page);

    await page.goto('/livros');
    const banner = page.locator('.analytics-consent');
    await expect(banner).toBeVisible();

    // 1. Usuário clica em 'Recusar'
    const rejectBtn = page.locator('.analytics-consent-btn-reject');
    await rejectBtn.click();

    // 2. Banner é ocultado imediatamente
    await expect(banner).not.toBeVisible();

    // 3. Preferência 'denied' é persistida no localStorage
    const storedConsent = await page.evaluate(() =>
      window.localStorage.getItem('diyspur.analytics-consent.v1')
    );
    expect(storedConsent).toBe('denied');

    // 4. Navega para a ficha de um livro (/livros/dom-casmurro)
    interceptor.clear();
    await page.goto('/livros/dom-casmurro');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    // 5. Nenhuma requisição analítica é disparada durante ou após a navegação
    expect(interceptor.getRequests().length).toBe(0);

    // 6. Confirma que nenhum evento de produto foi enfileirado
    const dataLayer = await page.evaluate(
      () => (window as unknown as { dataLayer?: unknown[][] }).dataLayer || []
    );
    const trackingEvents = dataLayer.filter(
      (entry) => Array.isArray(entry) && entry[0] === 'event'
    );
    expect(trackingEvents.length).toBe(0);
  });

  test('Cenário 3 (Consentimento Aceito): "Aceitar" inicializa adaptadores e dispara page_viewed, book_detail_viewed e cta_clicked', async ({
    page,
  }) => {
    const interceptor = attachAnalyticsInterceptor(page);

    await page.goto('/livros');
    const banner = page.locator('.analytics-consent');
    await expect(banner).toBeVisible();

    // 1. Usuário clica em 'Aceitar'
    const acceptBtn = page.locator('.analytics-consent-btn-accept');
    await acceptBtn.click();

    // 2. Banner fecha
    await expect(banner).not.toBeVisible();

    // 3. Preferência é salva como 'granted'
    const storedConsent = await page.evaluate(() =>
      window.localStorage.getItem('diyspur.analytics-consent.v1')
    );
    expect(storedConsent).toBe('granted');

    // 4. Verifica inicialização do Google Analytics 4 (Consent Mode v2)
    const isGtagDefined = await page.evaluate(
      () => typeof (window as unknown as { gtag?: unknown }).gtag === 'function'
    );
    expect(isGtagDefined).toBe(true);

    const dataLayer = await page.evaluate(
      () => (window as unknown as { dataLayer?: unknown[][] }).dataLayer || []
    );
    const hasGrantedConsentUpdate = dataLayer.some(
      (entry) =>
        entry[0] === 'consent' &&
        entry[1] === 'update' &&
        (entry[2] as Record<string, string>)?.analytics_storage === 'granted'
    );
    expect(hasGrantedConsentUpdate).toBe(true);

    // 5. Verifica disparo canônico de 'page_viewed' para o catálogo
    const pageViewEvents = dataLayer.filter(
      (entry) => entry[0] === 'event' && entry[1] === 'page_viewed'
    );
    expect(pageViewEvents.length).toBeGreaterThanOrEqual(1);

    // 6. Abre um livro: se houver card no catálogo clica nele para navegação SPA, senão navega via URL
    const bookCard = page.locator('.book-card').first();
    let expectedSlug = 'verity';

    if (await bookCard.count()) {
      const bookHref = await bookCard.getAttribute('href');
      if (bookHref) {
        expectedSlug = bookHref.replace(/^\/livros\//, '').split('?')[0];
      }
      await bookCard.click();
    } else {
      await page.goto(`/livros/${expectedSlug}`);
    }

    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(800);

    // 7. Valida disparo de 'book_detail_viewed' com metadados do livro
    const dataLayerAfterBook = await page.evaluate(
      () => (window as unknown as { dataLayer?: unknown[][] }).dataLayer || []
    );
    const bookDetailEvents = dataLayerAfterBook.filter(
      (entry) => entry[0] === 'event' && entry[1] === 'book_detail_viewed'
    );
    expect(bookDetailEvents.length).toBeGreaterThanOrEqual(1);

    const bookDetailProps = bookDetailEvents[0][2] as Record<string, unknown>;
    expect(bookDetailProps.book_slug).toBe(expectedSlug);
    expect(bookDetailProps.page_type).toBe('book_detail');

    // 8. Testa observador declarativo de cliques (cta_clicked) ao interagir com a UI
    const clickable = page.locator('header a.logo, header a, nav a').first();
    await expect(clickable).toBeVisible();
    await clickable.click();
    await page.waitForTimeout(400);

    const dataLayerAfterClick = await page.evaluate(
      () => (window as unknown as { dataLayer?: unknown[][] }).dataLayer || []
    );
    const ctaEvents = dataLayerAfterClick.filter(
      (entry) =>
        entry[0] === 'event' &&
        (entry[1] === 'cta_clicked' || String(entry[1]).includes('clicked'))
    );
    expect(ctaEvents.length).toBeGreaterThanOrEqual(1);

    // 9. Confirma que requisições de rede aos provedores de telemetria foram despachadas
    expect(interceptor.getRequests().length).toBeGreaterThanOrEqual(1);
  });

  test('Cenário 4 (Revogação de Preferência): Revogação em /privacidade cessa imediatamente transmissões futuras', async ({
    page,
  }) => {
    const interceptor = attachAnalyticsInterceptor(page);

    // 1. Acessa /privacidade e concede analytics pelo painel
    await page.goto('/privacidade');
    await page.waitForLoadState('domcontentloaded');

    const badge = page.locator('.privacy-consent-badge');
    await expect(badge).toBeVisible();

    // Concede consentimento pelo painel de privacidade
    const grantBtn = page.getByRole('button', { name: 'Aceitar analytics' });
    await grantBtn.click();
    await expect(badge).toContainText(/Concedido/i);

    const storedGranted = await page.evaluate(() =>
      window.localStorage.getItem('diyspur.analytics-consent.v1')
    );
    expect(storedGranted).toBe('granted');

    // 2. Usuário aciona 'Redefinir preferência'
    const resetBtn = page.getByRole('button', { name: 'Redefinir preferência' });
    await resetBtn.click();

    // 3. Mensagem informativa de redefinição para padrão estrito é exibida
    await expect(page.getByRole('status')).toContainText(
      /Consentimento redefinido para o padrão estrito/i
    );
    await expect(badge).toContainText(/Padrão Estrito/i);

    // 4. O localStorage foi limpo (chave removida)
    const storedConsent = await page.evaluate(() =>
      window.localStorage.getItem('diyspur.analytics-consent.v1')
    );
    expect(storedConsent).toBeNull();

    // Espera qualquer requisição pendente terminar antes de testar a cessação
    await page.waitForTimeout(500);
    interceptor.clear();

    // 5. Navega para outra rota
    await page.goto('/livros');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // 6. Confirma cessação imediata de transmissões analíticas
    expect(interceptor.getRequests().length).toBe(0);

    // 7. Como o status foi redefinido para default, o banner volta a ser exibido
    await expect(page.locator('.analytics-consent')).toBeVisible();

    // 8. Testa também botão 'Recusar analytics' no painel de privacidade
    await page.goto('/privacidade');
    const rejectBtn = page.getByRole('button', { name: 'Recusar analytics' });
    await rejectBtn.click();
    await expect(badge).toContainText(/Recusado/i);

    const storedDenied = await page.evaluate(() =>
      window.localStorage.getItem('diyspur.analytics-consent.v1')
    );
    expect(storedDenied).toBe('denied');
  });

  test('Cenário 5 (Endpoint de Métricas Prometheus): Validação de autenticação Bearer e formato oficial Prometheus', async ({
    request,
  }) => {
    // 1. GET sem cabeçalho Authorization -> 401 Unauthorized
    const resNoAuth = await request.get('/api/metrics');
    expect(resNoAuth.status()).toBe(401);
    const jsonNoAuth = await resNoAuth.json();
    expect(jsonNoAuth.error).toContain('Unauthorized');

    // 2. GET com cabeçalho com token inválido -> 401 Unauthorized
    const resInvalid = await request.get('/api/metrics', {
      headers: { Authorization: 'Bearer token_invalido_teste_999' },
    });
    expect(resInvalid.status()).toBe(401);

    // 3. GET com token correto -> 200 OK com métricas Prometheus
    const scrapeToken =
      process.env.PROMETHEUS_SCRAPE_TOKEN || 'diyspur_prometheus_secret_token_change_me';
    const resValid = await request.get('/api/metrics', {
      headers: { Authorization: `Bearer ${scrapeToken}` },
    });
    expect(resValid.status()).toBe(200);

    // Valida cabeçalhos obrigatórios da especificação Prometheus
    const contentType = resValid.headers()['content-type'] || '';
    expect(contentType).toContain('text/plain');
    expect(contentType).toContain('version=0.0.4');

    const cacheControl = resValid.headers()['cache-control'] || '';
    expect(cacheControl).toContain('no-store');

    // Valida métricas do sistema com prefixo diyspur_
    const body = await resValid.text();
    expect(body).toContain('diyspur_http_requests_total');
    expect(body).toContain('diyspur_http_request_duration_seconds');
    expect(body).toContain('diyspur_server_actions_total');
    expect(body).toContain('diyspur_active_users');
  });

  test('Cenário 6 (Health Check): GET /api/health retorna 200 com diagnóstico estruturado e sem segredos vazados', async ({
    request,
  }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);

    const cacheControl = res.headers()['cache-control'] || '';
    expect(cacheControl).toContain('no-store');

    const data = await res.json();

    // Valida estrutura canônica da resposta
    expect(data.status).toBe('ok');
    expect(data.service).toBe('diyspur-web');
    expect(typeof data.uptime).toBe('number');
    expect(data.uptime).toBeGreaterThanOrEqual(0);

    expect(data.memory).toBeDefined();
    expect(typeof data.memory.rss).toBe('number');
    expect(typeof data.memory.heapTotal).toBe('number');
    expect(typeof data.memory.heapUsed).toBe('number');

    expect(typeof data.latency_ms).toBe('number');
    expect(data.latency_ms).toBeGreaterThanOrEqual(0);

    expect(typeof data.timestamp).toBe('string');
    expect(new Date(data.timestamp).toISOString()).toBe(data.timestamp);

    // Validação estrita de segurança: nenhum segredo ou credencial no payload
    const rawPayload = JSON.stringify(data).toLowerCase();
    const sensitiveTokens = [
      'diyspur_prometheus_secret_token_change_me',
      'sb_publishable_',
      'service_role',
      'password',
      'secret',
      'faro_api_key',
      'sentry_auth_token',
      'clarity_data_export_token',
    ];

    for (const token of sensitiveTokens) {
      expect(rawPayload).not.toContain(token.toLowerCase());
    }
  });
});
