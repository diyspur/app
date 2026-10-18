import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const startTime = performance.now();

  const memUsage = process.memoryUsage();
  const latencyMs = Math.round((performance.now() - startTime) * 100) / 100;

  return NextResponse.json(
    {
      status: 'ok',
      service: process.env.OTEL_SERVICE_NAME ?? 'diyspur-web',
      environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV ?? 'development',
      version: process.env.NEXT_PUBLIC_RELEASE ?? process.env.npm_package_version ?? '0.1.0',
      uptime: process.uptime(),
      memory: {
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external,
      },
      latency_ms: latencyMs,
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    }
  );
}
