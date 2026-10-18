import { NextRequest, NextResponse } from 'next/server';
import { getBooksResult } from '@/features/catalog/queries';

const MAX_QUERY_LENGTH = 120;

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest | Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawPage = parseInt(searchParams.get('page') || '1', 10);
    const page = Number.isNaN(rawPage) ? 1 : Math.max(1, rawPage);
    const rawLimit = parseInt(searchParams.get('limit') || '24', 10);
    const limit = Number.isNaN(rawLimit) ? 24 : Math.min(48, Math.max(1, rawLimit));
    const rawQ = searchParams.get('q') || '';
    const q = rawQ.trim().slice(0, MAX_QUERY_LENGTH);

    const result = await getBooksResult(q, page, limit);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.message ?? 'Falha ao carregar catálogo' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const { books, total } = result.data;
    const hasMore = books.length === limit && page * limit < total;

    return NextResponse.json(
      {
        ...result.data,
        hasMore,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'private, max-age=60, stale-while-revalidate=120',
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: 'Falha ao carregar catálogo' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
