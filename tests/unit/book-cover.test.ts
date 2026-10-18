import { describe, it, expect } from 'vitest';
// @ts-expect-error nextConfig is an untyped mjs module
import nextConfig from '../../next.config.mjs';

describe('Book Cover Configuration & Patterns (QA-05)', () => {
  it('includes covers.openlibrary.org in remotePatterns', () => {
    const patterns = nextConfig.images?.remotePatterns || [];
    const hasOpenLibrary = patterns.some(
      (p: { hostname: string }) => p.hostname === 'covers.openlibrary.org',
    );
    expect(hasOpenLibrary).toBe(true);
  });

  it('includes covers.openlibrary.org in Content-Security-Policy img-src header', async () => {
    const headersConfig = await nextConfig.headers?.();
    const globalHeaderRule = headersConfig?.find((r: { source: string }) => r.source === '/(.*)');
    const csp = globalHeaderRule?.headers?.find(
      (h: { key: string }) => h.key === 'Content-Security-Policy-Report-Only' || h.key === 'Content-Security-Policy',
    )?.value;

    expect(csp).toBeDefined();
    expect(csp).toContain('https://covers.openlibrary.org');
  });
});
