import { NextRequest, NextResponse } from 'next/server';
import { getVisibleClubsPaginated } from '@/features/clubs/queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest | Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('q') || searchParams.get('search') || '';
    const cursor = searchParams.get('cursor') || undefined;
    const rawLimit = parseInt(searchParams.get('limit') || '24', 10);
    const limit = Number.isNaN(rawLimit) ? 24 : Math.min(100, Math.max(1, rawLimit));

    const result = await getVisibleClubsPaginated({
      search,
      cursor,
      limit,
    });

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: 500, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return NextResponse.json(
      {
        clubs: result.clubs,
        nextCursor: result.nextCursor,
        hasMore: Boolean(result.nextCursor),
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: 'Falha ao carregar clubes' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
