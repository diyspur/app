import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  registry,
  httpRequestsTotal,
  httpRequestDuration,
  serverActionsTotal,
  activeUsersGauge,
  recordHttpRequest,
  recordServerAction,
  initMetricsRegistry,
  resetMetricsForTesting,
  normalizeRoute,
} from '../../src/lib/observability/metrics';
import { GET as getMetricsRoute } from '../../src/app/api/metrics/route';
import { GET as getHealthRoute } from '../../src/app/api/health/route';
import * as instrumentation from '../../src/instrumentation';
import * as vercelOtel from '@vercel/otel';

vi.mock('@vercel/otel', () => ({
  registerOTel: vi.fn(),
}));

describe('OpenTelemetry and Prometheus Server-Side (Task 7)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    resetMetricsForTesting();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Prometheus Registry & Metrics Definition', () => {
    it('creates registry with default metrics prefixed with diyspur_', async () => {
      expect(registry).toBeDefined();
      const output = await registry.metrics();
      expect(output).toContain('diyspur_');
    });

    it('ensures singleton and idempotent registry initialization across reloads', () => {
      const reg1 = initMetricsRegistry();
      const reg2 = initMetricsRegistry();
      expect(reg1).toBe(reg2);
      expect(reg1).toBe(registry);
    });

    it('defines httpRequestsTotal counter with bounded labels [method, route, status]', async () => {
      expect(httpRequestsTotal).toBeDefined();
      // Record a request
      httpRequestsTotal.inc({ method: 'GET', route: '/livros', status: '200' }, 1);
      const output = await registry.metrics();
      expect(output).toContain('diyspur_http_requests_total{method="GET",route="/livros",status="200"} 1');
    });

    it('defines httpRequestDuration histogram with web-optimized buckets and bounded labels', async () => {
      expect(httpRequestDuration).toBeDefined();
      httpRequestDuration.observe({ method: 'POST', route: '/api/analytics', status: '200' }, 0.12);
      const output = await registry.metrics();
      expect(output).toContain('diyspur_http_request_duration_seconds');
      expect(output).toContain('le="0.25"');
    });

    it('defines serverActionsTotal counter with labels [action, status]', async () => {
      expect(serverActionsTotal).toBeDefined();
      serverActionsTotal.inc({ action: 'reading.updateStatus', status: 'success' }, 1);
      const output = await registry.metrics();
      expect(output).toContain('diyspur_server_actions_total{action="reading.updateStatus",status="success"} 1');
    });

    it('defines activeUsersGauge and allows setting, incrementing, and decrementing', async () => {
      expect(activeUsersGauge).toBeDefined();
      activeUsersGauge.set(42);
      let output = await registry.metrics();
      expect(output).toContain('diyspur_active_users 42');

      activeUsersGauge.inc(3);
      output = await registry.metrics();
      expect(output).toContain('diyspur_active_users 45');

      activeUsersGauge.dec(5);
      output = await registry.metrics();
      expect(output).toContain('diyspur_active_users 40');
    });

    it('recordHttpRequest helper normalizes parameters and updates both counter and histogram', async () => {
      recordHttpRequest('get', '/api/test', 200, 0.08);
      const output = await registry.metrics();
      expect(output).toContain('diyspur_http_requests_total{method="GET",route="/api/test",status="200"}');
      expect(output).toContain('diyspur_http_request_duration_seconds_bucket');
    });

    it('recordServerAction helper normalizes action name and increments counter', async () => {
      recordServerAction('clubs.join', 'success');
      const output = await registry.metrics();
      expect(output).toContain('diyspur_server_actions_total{action="clubs.join",status="success"} 1');
    });

    it('normalizeRoute normalizes dynamic slugs for livros, clubes, listas e temporadas', () => {
      expect(normalizeRoute('/livros/dom-casmurro')).toBe('/livros/:slug');
      expect(normalizeRoute('/clubes/leitura-sci-fi')).toBe('/clubes/:slug');
      expect(normalizeRoute('/listas/favoritos-2026')).toBe('/listas/:slug');
      expect(normalizeRoute('/temporadas/verao-2026')).toBe('/temporadas/:slug');
      expect(normalizeRoute('/livros/c19d4b4d-5829-4d69-a1d2-06927f8e3f81')).toBe('/livros/:slug');
      expect(normalizeRoute('/usuarios/12345')).toBe('/usuarios/:id');
    });
  });

  describe('GET /api/metrics Scrape Route', () => {
    it('returns 404 when PROMETHEUS_SCRAPE_TOKEN is not configured', async () => {
      delete process.env.PROMETHEUS_SCRAPE_TOKEN;
      const req = new Request('http://localhost:3000/api/metrics', {
        headers: { Authorization: 'Bearer some-token' },
      });
      const response = await getMetricsRoute(req);
      expect(response.status).toBe(404);
      const json = await response.json();
      expect(json).toEqual({ error: 'Metrics endpoint is disabled' });
    });

    it('returns 404 when PROMETHEUS_METRICS_ENABLED is false', async () => {
      process.env.PROMETHEUS_SCRAPE_TOKEN = 'test-scrape-token-123';
      process.env.PROMETHEUS_METRICS_ENABLED = 'false';
      const req = new Request('http://localhost:3000/api/metrics', {
        headers: { Authorization: 'Bearer test-scrape-token-123' },
      });
      const response = await getMetricsRoute(req);
      expect(response.status).toBe(404);
    });

    it('returns 401 when Authorization header is missing', async () => {
      process.env.PROMETHEUS_SCRAPE_TOKEN = 'valid-scrape-token-secret-999';
      const req = new Request('http://localhost:3000/api/metrics');
      const response = await getMetricsRoute(req);
      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json).toEqual({ error: 'Unauthorized: missing or invalid authorization header' });
    });

    it('returns 401 when Authorization scheme is not Bearer', async () => {
      process.env.PROMETHEUS_SCRAPE_TOKEN = 'valid-scrape-token-secret-999';
      const req = new Request('http://localhost:3000/api/metrics', {
        headers: { Authorization: 'Basic valid-scrape-token-secret-999' },
      });
      const response = await getMetricsRoute(req);
      expect(response.status).toBe(401);
    });

    it('returns 401 when Bearer token is empty or whitespace', async () => {
      process.env.PROMETHEUS_SCRAPE_TOKEN = 'valid-scrape-token-secret-999';
      const req = new Request('http://localhost:3000/api/metrics', {
        headers: { Authorization: 'Bearer ' },
      });
      const response = await getMetricsRoute(req);
      expect(response.status).toBe(401);
    });

    it('returns 401 when token is incorrect', async () => {
      process.env.PROMETHEUS_SCRAPE_TOKEN = 'valid-scrape-token-secret-999';
      const req = new Request('http://localhost:3000/api/metrics', {
        headers: { Authorization: 'Bearer wrong-token-value' },
      });
      const response = await getMetricsRoute(req);
      expect(response.status).toBe(401);
    });

    it('handles timing attacks safely with different token lengths without RangeError', async () => {
      process.env.PROMETHEUS_SCRAPE_TOKEN = 'valid-scrape-token-secret-999';

      // Test with token shorter than secret
      const reqShort = new Request('http://localhost:3000/api/metrics', {
        headers: { Authorization: 'Bearer x' },
      });
      const resShort = await getMetricsRoute(reqShort);
      expect(resShort.status).toBe(401);

      // Test with token much longer than secret
      const reqLong = new Request('http://localhost:3000/api/metrics', {
        headers: { Authorization: `Bearer ${'a'.repeat(512)}` },
      });
      const resLong = await getMetricsRoute(reqLong);
      expect(resLong.status).toBe(401);
    });

    it('returns 200 with Prometheus text format when token is valid', async () => {
      process.env.PROMETHEUS_SCRAPE_TOKEN = 'valid-scrape-token-secret-999';
      const req = new Request('http://localhost:3000/api/metrics', {
        headers: { Authorization: 'Bearer valid-scrape-token-secret-999' },
      });
      const response = await getMetricsRoute(req);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/plain');
      expect(response.headers.get('cache-control')).toContain('no-store');

      const body = await response.text();
      expect(body).toContain('diyspur_');
    });
  });

  describe('GET /api/health Enhanced Route', () => {
    it('returns complete health metadata including service, environment, uptime, memory, and latency', async () => {
      process.env.OTEL_SERVICE_NAME = 'diyspur-web-test';
      (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
      process.env.NEXT_PUBLIC_RELEASE = '1.0.0-test';

      const response = await getHealthRoute();
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toContain('no-store');

      const data = await response.json();
      expect(data).toMatchObject({
        status: 'ok',
        service: 'diyspur-web-test',
        environment: 'test',
        version: '1.0.0-test',
      });
      expect(typeof data.uptime).toBe('number');
      expect(data.uptime).toBeGreaterThanOrEqual(0);
      expect(data.memory).toBeDefined();
      expect(typeof data.memory.heapUsed).toBe('number');
      expect(typeof data.latency_ms).toBe('number');
      expect(data.latency_ms).toBeGreaterThanOrEqual(0);
      expect(data.timestamp).toBeDefined();
      expect(new Date(data.timestamp).toISOString()).toBe(data.timestamp);
    });
  });

  describe('OpenTelemetry Instrumentation', () => {
    it('registers OpenTelemetry with configured or default service name', async () => {
      delete process.env.OTEL_SERVICE_NAME;
      await instrumentation.register();
      expect(vercelOtel.registerOTel).toHaveBeenCalledWith({
        serviceName: 'diyspur-web',
      });

      process.env.OTEL_SERVICE_NAME = 'custom-diyspur-service';
      await instrumentation.register();
      expect(vercelOtel.registerOTel).toHaveBeenCalledWith({
        serviceName: 'custom-diyspur-service',
      });
    });
  });
});
