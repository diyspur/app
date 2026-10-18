import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error next.config.mjs is an untyped ESM configuration file
import defaultExport, { nextConfig, securityHeaders } from '../../next.config.mjs';

describe('Next.js Telemetry & Webpack Configuration (Task 8)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('CSP & Security Headers Whitelists', () => {
    it('defines security headers on the catch-all route', async () => {
      const targetConfig = nextConfig ?? defaultExport;
      expect(targetConfig.headers).toBeTypeOf('function');
      const headersRules = await targetConfig.headers();
      const catchAllRule = headersRules.find((r: { source: string }) => r.source === '/(.*)');
      expect(catchAllRule).toBeDefined();

      const headers = catchAllRule.headers;
      const cspHeader = headers.find(
        (h: { key: string }) => h.key === 'Content-Security-Policy-Report-Only'
      );
      expect(cspHeader).toBeDefined();
    });

    it('contains all required script-src telemetry whitelists in CSP', () => {
      const cspHeader = securityHeaders.find(
        (h: { key: string }) => h.key === 'Content-Security-Policy-Report-Only'
      );
      expect(cspHeader).toBeDefined();
      const cspValue = cspHeader!.value;

      const scriptSrcDirective = cspValue
        .split(';')
        .map((s: string) => s.trim())
        .find((s: string) => s.startsWith('script-src'));

      expect(scriptSrcDirective).toBeDefined();
      expect(scriptSrcDirective).toContain("'self'");
      expect(scriptSrcDirective).toContain("'unsafe-inline'");
      expect(scriptSrcDirective).toContain("'unsafe-eval'");
      expect(scriptSrcDirective).toContain('https://www.googletagmanager.com');
      expect(scriptSrcDirective).toContain('https://www.google-analytics.com');
      expect(scriptSrcDirective).toContain('https://*.clarity.ms');
      expect(scriptSrcDirective).toContain('https://scripts.clarity.ms');
    });

    it('contains all required connect-src telemetry whitelists in CSP', () => {
      const cspHeader = securityHeaders.find(
        (h: { key: string }) => h.key === 'Content-Security-Policy-Report-Only'
      );
      expect(cspHeader).toBeDefined();
      const cspValue = cspHeader!.value;

      const connectSrcDirective = cspValue
        .split(';')
        .map((s: string) => s.trim())
        .find((s: string) => s.startsWith('connect-src'));

      expect(connectSrcDirective).toBeDefined();
      expect(connectSrcDirective).toContain("'self'");
      expect(connectSrcDirective).toContain('https://*.supabase.co');
      expect(connectSrcDirective).toContain('wss://*.supabase.co');
      expect(connectSrcDirective).toContain('https://*.posthog.com');
      expect(connectSrcDirective).toContain('https://*.sentry.io');
      expect(connectSrcDirective).toContain('https://*.ingest.sentry.io');
      expect(connectSrcDirective).toContain('https://*.ingest.us.sentry.io');
      expect(connectSrcDirective).toContain('https://www.google-analytics.com');
      expect(connectSrcDirective).toContain('https://*.analytics.google.com');
      expect(connectSrcDirective).toContain('https://*.googletagmanager.com');
      expect(connectSrcDirective).toContain('https://*.clarity.ms');
      expect(connectSrcDirective).toContain('https://faro-api-prod-sa-east-1.grafana.net');
    });

    it('contains all required img-src telemetry whitelists in CSP while preserving remote origins', () => {
      const cspHeader = securityHeaders.find(
        (h: { key: string }) => h.key === 'Content-Security-Policy-Report-Only'
      );
      expect(cspHeader).toBeDefined();
      const cspValue = cspHeader!.value;

      const imgSrcDirective = cspValue
        .split(';')
        .map((s: string) => s.trim())
        .find((s: string) => s.startsWith('img-src'));

      expect(imgSrcDirective).toBeDefined();
      expect(imgSrcDirective).toContain('https://*.google-analytics.com');
      expect(imgSrcDirective).toContain('https://*.clarity.ms');
      // Preserves existing image remote origins
      expect(imgSrcDirective).toContain('https://*.supabase.co');
      expect(imgSrcDirective).toContain('https://m.media-amazon.com');
      expect(imgSrcDirective).toContain('https://covers.openlibrary.org');
    });
  });

  describe('Webpack & Faro Source Map Uploader Plugin', () => {
    it('configures hidden-source-map and attaches FaroSourceMapUploaderPlugin when FARO_API_KEY is present on client build', () => {
      process.env.FARO_API_KEY = 'test-faro-secret-key';
      const fakeConfig: { devtool?: string; plugins?: unknown[] } = {
        plugins: [],
      };

      const result = nextConfig.webpack(fakeConfig, { isServer: false });

      expect(result.devtool).toBe('hidden-source-map');
      expect(result.plugins).toHaveLength(1);

      const plugin = result.plugins[0] as {
        appName?: string;
        endpoint?: string;
        appId?: string;
        stackId?: string;
        apiKey?: string;
        gzipContents?: boolean;
        verbose?: boolean;
        constructor: { name: string };
      };

      expect(plugin.constructor.name).toBe('FaroSourceMapUploaderPlugin');
      expect(plugin.appName).toBe('diyspur');
      expect(plugin.endpoint).toBe('https://faro-api-prod-sa-east-1.grafana.net/faro/api/v1/app/1656/sourcemaps/');
      expect(plugin.stackId).toBe('1880886');
      expect(plugin.apiKey).toBe('test-faro-secret-key');
      expect(plugin.gzipContents).toBe(true);
    });

    it('does NOT alter devtool or attach Faro plugin when FARO_API_KEY is not set', () => {
      delete process.env.FARO_API_KEY;
      const fakeConfig: { devtool?: string; plugins?: unknown[] } = {
        devtool: 'source-map',
        plugins: [],
      };

      const result = nextConfig.webpack(fakeConfig, { isServer: false });

      expect(result.devtool).toBe('source-map');
      expect(result.plugins).toHaveLength(0);
    });

    it('does NOT attach Faro plugin on server builds even if FARO_API_KEY is present', () => {
      process.env.FARO_API_KEY = 'test-faro-secret-key';
      const fakeConfig: { devtool?: string; plugins?: unknown[] } = {
        plugins: [],
      };

      const result = nextConfig.webpack(fakeConfig, { isServer: true });

      expect(result.devtool).toBeUndefined();
      expect(result.plugins).toHaveLength(0);
    });

    it('initializes plugins array if not present on input config', () => {
      process.env.FARO_API_KEY = 'test-faro-secret-key';
      const fakeConfig: { devtool?: string; plugins?: unknown[] } = {};

      const result = nextConfig.webpack(fakeConfig, { isServer: false });

      expect(result.plugins).toBeInstanceOf(Array);
      expect(result.plugins).toHaveLength(1);
    });
  });

  describe('Security & Environment Constraints', () => {
    it('does not leak FARO_API_KEY into public nextConfig.env or runtimeConfig', () => {
      expect(nextConfig.env?.FARO_API_KEY).toBeUndefined();
      expect(nextConfig.publicRuntimeConfig?.FARO_API_KEY).toBeUndefined();
    });

    it('keeps poweredByHeader disabled', () => {
      expect(nextConfig.poweredByHeader).toBe(false);
    });
  });
});
