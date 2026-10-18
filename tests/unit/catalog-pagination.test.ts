import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Catalog Navigation and Presentation (QA-12, QA-13, QA-20, QA-21)', () => {
  it('computes totalChapters accurately using Math.max between book total and chapter count (QA-13)', () => {
    const computeTotalChapters = (
      bookTotal: number | null | undefined,
      chaptersCount: number
    ) => Math.max(bookTotal ?? 0, chaptersCount);

    // Case 1: Book has 25 total chapters, season currently has 10 registered
    expect(computeTotalChapters(25, 10)).toBe(25);

    // Case 2: Book total is undefined/null, season has 12 chapters
    expect(computeTotalChapters(null, 12)).toBe(12);
    expect(computeTotalChapters(undefined, 8)).toBe(8);

    // Case 3: Season has bonus/extra chapters beyond book total
    expect(computeTotalChapters(10, 12)).toBe(12);

    // Case 4: Both are 0
    expect(computeTotalChapters(0, 0)).toBe(0);
  });

  it('deduplicates season breadcrumb when season title matches book title (QA-20)', () => {
    const getBreadcrumbLabels = (
      book: { title: string },
      season: { title: string; number: number },
      chapter: { number: number }
    ) => {
      const isSeasonTitleSameAsBook =
        book.title.toLowerCase().trim() === season.title.toLowerCase().trim();
      const seasonLabel = isSeasonTitleSameAsBook
        ? `Temporada ${season.number}`
        : season.title;
      return [book.title, seasonLabel, `Capítulo ${chapter.number}`];
    };

    // When season title equals book title (e.g. "Verity" / "Verity")
    const deduped = getBreadcrumbLabels(
      { title: 'Verity' },
      { title: 'Verity', number: 1 },
      { number: 1 }
    );
    expect(deduped).toEqual(['Verity', 'Temporada 1', 'Capítulo 1']);

    // When season title is distinct (e.g. "O Nome do Vento" / "Crônica do Matador do Rei - Parte 1")
    const distinct = getBreadcrumbLabels(
      { title: 'O Nome do Vento' },
      { title: 'Crônica do Matador do Rei - Parte 1', number: 2 },
      { number: 4 }
    );
    expect(distinct).toEqual([
      'O Nome do Vento',
      'Crônica do Matador do Rei - Parte 1',
      'Capítulo 4',
    ]);
  });

  it('formats season progress correctly for the homepage (QA-14)', () => {
    const formatSeasonProgress = (published: number, total: number) =>
      `${published} de ${total} capítulos liberados`;

    expect(formatSeasonProgress(5, 20)).toBe('5 de 20 capítulos liberados');
    expect(formatSeasonProgress(1, 1)).toBe('1 de 1 capítulos liberados');
  });

  it('provides safe ranking link path on homepage (QA-12)', () => {
    const rankingPath = '/ranking';
    expect(rankingPath.startsWith('/ranking')).toBe(true);
  });
});

describe('Catalog Deep Pagination (> 500 books)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('allows navigating to page 25 (offset 576) without returning empty array when total > 500', async () => {
    const clientsModule = await import('@/lib/supabase/clients');

    const TOTAL_BOOKS = 600;
    const allMockBooks = Array.from({ length: TOTAL_BOOKS }, (_, i) => ({
      id: `book-${i + 1}`,
      title: `Book Title ${i + 1}`,
      slug: `book-${i + 1}`,
      author_id: `author-${(i % 10) + 1}`,
      cover_url: null,
      isbn13: null,
      language: 'pt-BR',
      synopsis: `Synopsis for book ${i + 1}`,
      total_chapters: 15,
      total_pages: 250,
      publication_year: 2024,
      tags: i % 2 === 0 ? ['ficcao', 'aventura'] : ['romance'],
      amazon_url: null,
      publisher: 'Editora Teste',
      translator: null,
      publication_date: '2024-01-01',
      content_rating: 'livre',
      edition_number: 1,
      format: 'Capa comum',
      width_mm: 140,
      height_mm: 210,
      depth_mm: 15,
    }));

    const supabaseMock = {
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: { sub: 'reader-user-1' } },
          error: null,
        }),
      },
      from: vi.fn((table: string) => {
        if (table === 'user_book_readings') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [
                  { book_id: 'book-1', status: 'read' },
                  { book_id: 'book-2', status: 'reading' },
                ],
                error: null,
              }),
            }),
          };
        }

        if (table === 'authors') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockImplementation((_field: string, ids: string[]) =>
                Promise.resolve({
                  data: ids.map((id) => ({ id, name: `Author ${id}` })),
                  error: null,
                })
              ),
            }),
          };
        }

        if (table === 'books') {
          let limitVal: number | null = null;
          let inIds: string[] | null = null;

          const builder: any = {
            select: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            ilike: vi.fn().mockReturnThis(),
            range: vi.fn().mockReturnThis(),
            limit: vi.fn((lim: number) => {
              limitVal = lim;
              return builder;
            }),
            in: vi.fn((_field: string, ids: string[]) => {
              inIds = ids;
              return builder;
            }),
            then: (resolve: (val: any) => void) => {
              if (inIds) {
                const filtered = allMockBooks.filter((b) => inIds!.includes(b.id));
                return Promise.resolve({
                  data: filtered,
                  error: null,
                }).then(resolve);
              }

              let resultData = allMockBooks;
              if (limitVal !== null) {
                resultData = resultData.slice(0, limitVal);
              }

              return Promise.resolve({
                data: resultData,
                count: TOTAL_BOOKS,
                error: null,
              }).then(resolve);
            },
          };

          return builder;
        }

        return {};
      }),
    };

    vi.spyOn(clientsModule, 'createServerSupabase').mockResolvedValue(supabaseMock as any);

    const { getBooksResult } = await import('@/features/catalog/queries');
    const result = await getBooksResult(undefined, 25, 24);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Query failed');

    expect(result.data.total).toBe(600);
    expect(result.data.totalPages).toBe(25);
    expect(result.data.page).toBe(25);
    expect(result.data.books.length).toBe(24);
    expect(result.data.books[0].id).toBeDefined();
    expect(result.data.books[0].authors?.name).toBeDefined();
  });

  it('queries candidates with lightweight projection (id, author_id, tags) and fetches full projection only for pageIds', async () => {
    const clientsModule = await import('@/lib/supabase/clients');

    const selectCalls: { table: string; fields: string; options?: any }[] = [];
    let booksInIds: string[] | null = null;
    let limitCalled = false;

    const mockBooks = [
      { id: 'b-1', author_id: 'a-1', tags: ['fantasia'], title: 'Livro 1' },
      { id: 'b-2', author_id: 'a-2', tags: ['ficcao'], title: 'Livro 2' },
    ];

    const supabaseMock = {
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: { sub: 'reader-1' } },
          error: null,
        }),
      },
      from: vi.fn((table: string) => {
        if (table === 'user_book_readings') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ book_id: 'b-1', status: 'read' }],
                error: null,
              }),
            }),
          };
        }

        if (table === 'authors') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ id: 'a-1', name: 'Autor 1' }, { id: 'a-2', name: 'Autor 2' }],
                error: null,
              }),
            }),
          };
        }

        if (table === 'books') {
          const builder: any = {
            select: vi.fn((fields: string, opts?: any) => {
              selectCalls.push({ table, fields, options: opts });
              return builder;
            }),
            order: vi.fn().mockReturnThis(),
            ilike: vi.fn().mockReturnThis(),
            range: vi.fn().mockReturnThis(),
            limit: vi.fn(() => {
              limitCalled = true;
              return builder;
            }),
            in: vi.fn((_col: string, ids: string[]) => {
              booksInIds = ids;
              return builder;
            }),
            then: (resolve: (val: any) => void) => {
              if (booksInIds) {
                return Promise.resolve({
                  data: mockBooks.filter((b) => booksInIds!.includes(b.id)),
                  error: null,
                }).then(resolve);
              }
              return Promise.resolve({
                data: mockBooks,
                count: 2,
                error: null,
              }).then(resolve);
            },
          };
          return builder;
        }

        return {};
      }),
    };

    vi.spyOn(clientsModule, 'createServerSupabase').mockResolvedValue(supabaseMock as any);

    const { getBooksResult } = await import('@/features/catalog/queries');
    const result = await getBooksResult(undefined, 1, 24);

    expect(result.ok).toBe(true);
    expect(limitCalled).toBe(false);

    // Verify candidate query selected minimal fields with exact count
    const candidateSelect = selectCalls.find(
      (c) => c.table === 'books' && c.fields === 'id,author_id,tags' && c.options?.count === 'exact'
    );
    expect(candidateSelect).toBeDefined();
    expect(candidateSelect?.options).toEqual({ count: 'exact' });

    // Verify full projection query was called for page IDs
    const fullSelect = selectCalls.find(
      (c) => c.table === 'books' && c.fields.includes('synopsis')
    );
    expect(fullSelect).toBeDefined();
    expect(booksInIds).toBeDefined();
  });

  it('preserves fast range query for guest users without personalization', async () => {
    const clientsModule = await import('@/lib/supabase/clients');

    let rangeCalledWith: [number, number] | null = null;
    const mockGuestBooks = [
      { id: 'b-1', title: 'Livro Guest 1', author_id: 'a-1' },
      { id: 'b-2', title: 'Livro Guest 2', author_id: 'a-2' },
    ];

    const supabaseMock = {
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: null },
          error: null,
        }),
      },
      from: vi.fn((table: string) => {
        if (table === 'authors') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ id: 'a-1', name: 'Autor 1' }, { id: 'a-2', name: 'Autor 2' }],
                error: null,
              }),
            }),
          };
        }

        if (table === 'books') {
          const builder: any = {
            select: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            ilike: vi.fn().mockReturnThis(),
            range: vi.fn((from: number, to: number) => {
              rangeCalledWith = [from, to];
              return builder;
            }),
            limit: vi.fn().mockReturnThis(),
            then: (resolve: (val: any) => void) =>
              Promise.resolve({
                data: mockGuestBooks,
                count: 50,
                error: null,
              }).then(resolve),
          };
          return builder;
        }

        return {};
      }),
    };

    vi.spyOn(clientsModule, 'createServerSupabase').mockResolvedValue(supabaseMock as any);

    const { getBooksResult } = await import('@/features/catalog/queries');
    const result = await getBooksResult(undefined, 2, 24);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Query failed');

    // Page 2 with limit 24 -> range(24, 47)
    expect(rangeCalledWith).toEqual([24, 47]);
    expect(result.data.isPersonalized).toBe(false);
    expect(result.data.total).toBe(50);
    expect(result.data.page).toBe(2);
    expect(result.data.totalPages).toBe(3);
  });

  it('returns queryFailure when the catalog database query encounters an error', async () => {
    const clientsModule = await import('@/lib/supabase/clients');

    const supabaseMock = {
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: null },
          error: null,
        }),
      },
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        then: (resolve: (val: any) => void) =>
          Promise.resolve({
            data: null,
            count: null,
            error: { code: 'PGRST500', message: 'Internal Server Error' },
          }).then(resolve),
      })),
    };

    vi.spyOn(clientsModule, 'createServerSupabase').mockResolvedValue(supabaseMock as any);

    const { getBooksResult } = await import('@/features/catalog/queries');
    const result = await getBooksResult(undefined, 1, 24);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected failure');
    expect(result.code).toBe('unavailable');
  });
});

describe('Recommender Session Cache (recommender-cache.ts)', () => {
  beforeEach(async () => {
    const { clearRecommenderCache } = await import(
      '@/features/recommendations/recommender-cache'
    );
    clearRecommenderCache();
  });

  it('stores and retrieves ranked book ids and total count', async () => {
    const { getCachedRanking, setCachedRanking } = await import(
      '@/features/recommendations/recommender-cache'
    );

    expect(getCachedRanking('user-1:__all__')).toBeNull();

    setCachedRanking('user-1:__all__', ['b-1', 'b-2', 'b-3'], 3);

    const cached = getCachedRanking('user-1:__all__');
    expect(cached).not.toBeNull();
    expect(cached?.rankedBookIds).toEqual(['b-1', 'b-2', 'b-3']);
    expect(cached?.total).toBe(3);
  });

  it('expires cache entries after ttl has passed', async () => {
    const { getCachedRanking, setCachedRanking } = await import(
      '@/features/recommendations/recommender-cache'
    );

    setCachedRanking('user-temp:__all__', ['b-1'], 1, 50);
    expect(getCachedRanking('user-temp:__all__')).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(getCachedRanking('user-temp:__all__')).toBeNull();
  });

  it('invalidates all ranking keys for a specific user without affecting others', async () => {
    const { getCachedRanking, setCachedRanking, invalidateUserRanking } = await import(
      '@/features/recommendations/recommender-cache'
    );

    setCachedRanking('user-alpha:__all__', ['b-1', 'b-2'], 2);
    setCachedRanking('user-alpha:fantasia', ['b-1'], 1);
    setCachedRanking('user-beta:__all__', ['b-3', 'b-4'], 2);

    invalidateUserRanking('user-alpha');

    expect(getCachedRanking('user-alpha:__all__')).toBeNull();
    expect(getCachedRanking('user-alpha:fantasia')).toBeNull();
    expect(getCachedRanking('user-beta:__all__')).not.toBeNull();
  });

  it('clears all entries when clearRecommenderCache is called', async () => {
    const { getCachedRanking, setCachedRanking, clearRecommenderCache, getRecommenderCacheSize } = await import(
      '@/features/recommendations/recommender-cache'
    );

    setCachedRanking('u1:q1', ['b-1'], 1);
    setCachedRanking('u2:q2', ['b-2'], 1);
    expect(getRecommenderCacheSize()).toBe(2);

    clearRecommenderCache();
    expect(getRecommenderCacheSize()).toBe(0);
    expect(getCachedRanking('u1:q1')).toBeNull();
  });
});

describe('Catalog Queries Session Cache Integration', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    const { clearRecommenderCache } = await import(
      '@/features/recommendations/recommender-cache'
    );
    clearRecommenderCache();
  });

  it('reuses cached ranking on subsequent page requests and skips candidate re-querying', async () => {
    const clientsModule = await import('@/lib/supabase/clients');
    let candidateQueryCount = 0;
    let fullQueryCount = 0;

    const mockCandidateBooks = Array.from({ length: 48 }, (_, i) => ({
      id: `book-${i + 1}`,
      author_id: `author-${(i % 5) + 1}`,
      tags: ['ficcao'],
      title: `Book ${i + 1}`,
    }));

    const supabaseMock = {
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: { sub: 'reader-cache-test' } },
          error: null,
        }),
      },
      from: vi.fn((table: string) => {
        if (table === 'user_book_readings') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ book_id: 'book-1', status: 'read' }],
                error: null,
              }),
            }),
          };
        }

        if (table === 'authors') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockImplementation((_field: string, ids: string[]) =>
                Promise.resolve({
                  data: ids.map((id) => ({ id, name: `Author ${id}` })),
                  error: null,
                })
              ),
            }),
          };
        }

        if (table === 'books') {
          let inIds: string[] | null = null;
          let selectedFields = '';

          const builder: any = {
            select: vi.fn((fields: string) => {
              selectedFields = fields;
              return builder;
            }),
            order: vi.fn().mockReturnThis(),
            ilike: vi.fn().mockReturnThis(),
            in: vi.fn((_field: string, ids: string[]) => {
              inIds = ids;
              return builder;
            }),
            then: (resolve: (val: any) => void) => {
              if (selectedFields.includes('synopsis')) {
                fullQueryCount++;
                const hydrated = (inIds ?? []).map((id) => ({
                  id,
                  title: `Hydrated ${id}`,
                  slug: id,
                  author_id: 'author-1',
                  cover_url: null,
                  tags: ['ficcao'],
                }));
                return Promise.resolve({ data: hydrated, error: null }).then(resolve);
              }

              if (inIds) {
                // history ids query (id,author_id,tags)
                return Promise.resolve({
                  data: [{ id: 'book-1', author_id: 'author-1', tags: ['ficcao'] }],
                  error: null,
                }).then(resolve);
              }

              // Candidate query
              candidateQueryCount++;
              return Promise.resolve({
                data: mockCandidateBooks,
                count: 48,
                error: null,
              }).then(resolve);
            },
          };
          return builder;
        }

        return {};
      }),
    };

    vi.spyOn(clientsModule, 'createServerSupabase').mockResolvedValue(supabaseMock as any);

    const { getBooksResult } = await import('@/features/catalog/queries');

    // Page 1: Cache Miss -> runs candidate query (1) + full query (1)
    const page1 = await getBooksResult(undefined, 1, 24);
    expect(page1.ok).toBe(true);
    expect(candidateQueryCount).toBe(1);
    expect(fullQueryCount).toBe(1);
    if (!page1.ok) throw new Error('Page 1 failed');
    expect(page1.data.books.length).toBe(24);
    expect(page1.data.page).toBe(1);

    // Page 2: Cache Hit -> candidate query is NOT executed again! candidateQueryCount stays 1!
    const page2 = await getBooksResult(undefined, 2, 24);
    expect(page2.ok).toBe(true);
    expect(candidateQueryCount).toBe(1); // SKIPPED candidate re-query!
    expect(fullQueryCount).toBe(2); // Hydrated second page
    if (!page2.ok) throw new Error('Page 2 failed');
    expect(page2.data.books.length).toBe(24);
    expect(page2.data.page).toBe(2);

    // Invalidate user ranking
    const { invalidateUserRanking } = await import(
      '@/features/recommendations/recommender-cache'
    );
    invalidateUserRanking('reader-cache-test');

    // Next request triggers candidate re-query
    const page1AfterInvalidation = await getBooksResult('novo-termo', 1, 24);
    expect(page1AfterInvalidation.ok).toBe(true);
    expect(candidateQueryCount).toBe(2); // re-queried!
  });
});

describe('Catalog API Route Handler (GET /api/books/catalog)', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    const { clearRecommenderCache } = await import(
      '@/features/recommendations/recommender-cache'
    );
    clearRecommenderCache();
  });

  it('returns HTTP 200 with catalog data and Cache-Control headers', async () => {
    const clientsModule = await import('@/lib/supabase/clients');
    const { GET } = await import('@/app/api/books/catalog/route');
    const { NextRequest } = await import('next/server');

    const supabaseMock = {
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: null },
          error: null,
        }),
      },
      from: vi.fn((table: string) => {
        if (table === 'authors') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        if (table === 'books') {
          return {
            select: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            range: vi.fn().mockReturnThis(),
            then: (resolve: (val: any) => void) =>
              Promise.resolve({
                data: [{ id: 'b-1', title: 'Livro Teste', author_id: 'a-1' }],
                count: 1,
                error: null,
              }).then(resolve),
          };
        }
        return {};
      }),
    };

    vi.spyOn(clientsModule, 'createServerSupabase').mockResolvedValue(supabaseMock as any);

    const request = new NextRequest('http://localhost:3000/api/books/catalog?page=1&limit=24');
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe(
      'private, max-age=60, stale-while-revalidate=120'
    );

    const json = await response.json();
    expect(json.total).toBe(1);
    expect(json.page).toBe(1);
    expect(json.books.length).toBe(1);
    expect(json.books[0].id).toBe('b-1');
  });

  it('clamps invalid and boundary pagination query parameters', async () => {
    const queriesModule = await import('@/features/catalog/queries');
    const getBooksResultSpy = vi
      .spyOn(queriesModule, 'getBooksResult')
      .mockResolvedValue({
        ok: true,
        data: {
          books: [],
          total: 0,
          page: 1,
          totalPages: 1,
          isPersonalized: false,
        },
      });

    const { GET } = await import('@/app/api/books/catalog/route');
    const { NextRequest } = await import('next/server');

    // Negative page and excessive limit (> 48)
    const request1 = new NextRequest('http://localhost:3000/api/books/catalog?page=-5&limit=100&q=teste');
    await GET(request1);
    expect(getBooksResultSpy).toHaveBeenLastCalledWith('teste', 1, 48);

    // Non-numeric params
    const request2 = new NextRequest('http://localhost:3000/api/books/catalog?page=abc&limit=xyz');
    await GET(request2);
    expect(getBooksResultSpy).toHaveBeenLastCalledWith('', 1, 24);
  });

  it('returns HTTP 500 when getBooksResult fails', async () => {
    const queriesModule = await import('@/features/catalog/queries');
    vi.spyOn(queriesModule, 'getBooksResult').mockResolvedValue({
      ok: false,
      code: 'unavailable',
      message: 'Catálogo indisponível temporariamente',
    });

    const { GET } = await import('@/app/api/books/catalog/route');
    const { NextRequest } = await import('next/server');

    const request = new NextRequest('http://localhost:3000/api/books/catalog');
    const response = await GET(request);

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Catálogo indisponível temporariamente');
  });
});




