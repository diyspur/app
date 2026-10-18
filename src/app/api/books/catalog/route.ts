import { NextResponse } from 'next/server';
import { getBooksResult } from '@/features/catalog/queries';

const PAGE_SIZE = 24;
const MAX_QUERY_LENGTH = 120;

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const rawPage = params.get('page') ?? '2';
    const page = Number(rawPage);
    const query = (params.get('q') ?? '').trim();

    if (!Number.isSafeInteger(page) || page < 1 || page > 10_000) {
      return NextResponse.json({ error: 'invalid_page' }, { status: 400 });
    }

    if (query.length > MAX_QUERY_LENGTH) {
      return NextResponse.json({ error: 'query_too_long' }, { status: 400 });
    }

    const result = await getBooksResult(query, page, PAGE_SIZE);
    if (!result.ok) {
      return NextResponse.json(
        { error: 'catalog_unavailable' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const { books, total, isPersonalized } = result.data;
    return NextResponse.json(
      {
        books,
        total,
        page,
        hasMore: books.length === PAGE_SIZE && page * PAGE_SIZE < total,
        isPersonalized: Boolean(isPersonalized),
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'private, no-store' },
      },
    );
  } catch {
    return NextResponse.json(
      { error: 'catalog_unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
