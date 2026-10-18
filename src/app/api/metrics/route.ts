import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { registry } from '@/lib/observability/metrics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Comparação em tempo constante para evitar ataques de temporização (timing attacks).
 * Aplica SHA-256 aos dois valores antes de comparar com crypto.timingSafeEqual,
 * garantindo tamanhos idênticos de buffer (32 bytes) sem lançar RangeError.
 */
export function timingSafeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length === 0 || b.length === 0) {
    return false;
  }
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

export async function GET(request: Request): Promise<Response> {
  const scrapeToken = process.env.PROMETHEUS_SCRAPE_TOKEN;
  const isEnabled = process.env.PROMETHEUS_METRICS_ENABLED !== 'false';

  // Se o token não estiver configurado ou se as métricas foram explicitamente desabilitadas: 404
  if (!scrapeToken || !isEnabled) {
    return NextResponse.json(
      { error: 'Metrics endpoint is disabled' },
      { status: 404 }
    );
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return NextResponse.json(
      { error: 'Unauthorized: missing or invalid authorization header' },
      { status: 401 }
    );
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) {
    return NextResponse.json(
      { error: 'Unauthorized: missing or invalid authorization header' },
      { status: 401 }
    );
  }

  const providedToken = match[1].trim();
  if (!timingSafeCompare(providedToken, scrapeToken)) {
    return NextResponse.json(
      { error: 'Unauthorized: missing or invalid authorization header' },
      { status: 401 }
    );
  }

  try {
    const metricsData = await registry.metrics();
    return new Response(metricsData, {
      status: 200,
      headers: {
        'Content-Type': registry.contentType || 'text/plain; version=0.0.4; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to collect metrics' },
      { status: 500 }
    );
  }
}
