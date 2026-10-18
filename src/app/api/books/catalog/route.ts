import { NextRequest, NextResponse } from 'next/server';
import { getBooksResult } from '@/features/catalog/queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawPage = parseInt(searchParams.get('page') || '1', 10);
  const page = Number.isNaN(rawPage) ? 1 : Math.max(1, rawPage);
  const rawLimit = parseInt(searchParams.get('limit') || '24', 10);
  const limit = Number.isNaN(rawLimit) ? 24 : Math.min(48, Math.max(1, rawLimit));
  const q = searchParams.get('q') || '';

  const result = await getBooksResult(q, page, limit);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.message ?? 'Falha ao carregar catálogo' },
      { status: 500 },
    );
  }

  return NextResponse.json(result.data, {
    headers: {
      'Cache-Control': 'private, max-age=60, stale-while-revalidate=120',
    },
  });
}
