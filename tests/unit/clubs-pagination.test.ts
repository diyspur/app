import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ClubSummary } from '@/features/clubs/queries';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/clubes',
  useSearchParams: () => new URLSearchParams(),
}));

describe('Clubs Discovery Pagination and Search (QA-11)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockClubs: ClubSummary[] = Array.from({ length: 30 }, (_, i) => {
    const num = i + 1;
    // Decreasing timestamps so club 1 is newest, club 30 is oldest
    const createdAt = new Date(Date.UTC(2026, 9, 20, 23 - Math.floor(i / 2), 59 - (i % 60))).toISOString();
    return {
      id: `club-${String(num).padStart(3, '0')}`,
      owner_id: `user-${(i % 5) + 1}`,
      name: i % 2 === 0 ? `Clube de Ficção Científica ${num}` : `Clube dos Clássicos ${num}`,
      slug: `clube-${num}`,
      description: `Descrição do clube ${num}`,
      is_private: false,
      kind: 'community',
      official_book_id: null,
      version: 1,
      archived_at: null,
      created_at: createdAt,
    };
  });

  it('enforces stable ordering by (created_at DESC, id DESC)', async () => {
    const clientsModule = await import('@/lib/supabase/clients');

    const orderCalls: [string, { ascending: boolean }][] = [];

    const supabaseMock = {
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: null },
          error: null,
        }),
      },
      from: vi.fn((table: string) => {
        if (table === 'user_clubs') {
          const builder: any = {
            select: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            order: vi.fn((col: string, opts: { ascending: boolean }) => {
              orderCalls.push([col, opts]);
              return builder;
            }),
            ilike: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            then: (resolve: (val: any) => void) =>
              Promise.resolve({
                data: mockClubs.slice(0, 24),
                error: null,
              }).then(resolve),
          };
          return builder;
        }
        return {};
      }),
    };

    vi.spyOn(clientsModule, 'createServerSupabase').mockResolvedValue(supabaseMock as any);

    const { getVisibleClubsPaginated } = await import('@/features/clubs/queries');
    const result = await getVisibleClubsPaginated();

    expect(orderCalls).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ]);
    expect(result.clubs).toHaveLength(24);
  });

  it('filters clubs case-insensitively by name', async () => {
    const clientsModule = await import('@/lib/supabase/clients');

    let ilikeCall: [string, string] | null = null;
    const searchTerm = 'ficção científica';

    const supabaseMock = {
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: null },
          error: null,
        }),
      },
      from: vi.fn((table: string) => {
        if (table === 'user_clubs') {
          const builder: any = {
            select: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            ilike: vi.fn((col: string, pattern: string) => {
              ilikeCall = [col, pattern];
              return builder;
            }),
            or: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            then: (resolve: (val: any) => void) => {
              const filtered = mockClubs.filter((c) =>
                c.name.toLowerCase().includes(searchTerm.toLowerCase()),
              );
              return Promise.resolve({
                data: filtered.slice(0, 25),
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

    const { getVisibleClubsPaginated } = await import('@/features/clubs/queries');
    const result = await getVisibleClubsPaginated({ search: 'Ficção Científica' });

    expect(ilikeCall).not.toBeNull();
    expect(ilikeCall?.[0]).toBe('name');
    expect(ilikeCall?.[1]).toBe('%Ficção Científica%');
    expect(result.clubs.length).toBeGreaterThan(0);
    expect(result.clubs.every((c) => c.name.includes('Ficção Científica'))).toBe(true);
  });

  it('supports cursor pagination ensuring the 25th club is returned on page 2', async () => {
    const clientsModule = await import('@/lib/supabase/clients');

    let orFilter: string | null = null;
    let requestedLimit: number | null = null;

    const supabaseMock = {
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: null },
          error: null,
        }),
      },
      from: vi.fn((table: string) => {
        if (table === 'user_clubs') {
          const builder: any = {
            select: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            ilike: vi.fn().mockReturnThis(),
            or: vi.fn((filter: string) => {
              orFilter = filter;
              return builder;
            }),
            limit: vi.fn((lim: number) => {
              requestedLimit = lim;
              return builder;
            }),
            then: (resolve: (val: any) => void) => {
              if (orFilter) {
                // Page 2: clubs 25 to 30 (6 clubs)
                const page2Data = mockClubs.slice(24, 30);
                return Promise.resolve({
                  data: page2Data,
                  error: null,
                }).then(resolve);
              }

              // Page 1: returns limit + 1 items (25 items) to signal hasMore
              const page1Data = mockClubs.slice(0, 25);
              return Promise.resolve({
                data: page1Data,
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

    const { getVisibleClubsPaginated } = await import('@/features/clubs/queries');

    // Page 1
    const page1 = await getVisibleClubsPaginated({ limit: 24 });
    expect(requestedLimit).toBe(25); // limit + 1
    expect(page1.clubs).toHaveLength(24);
    expect(page1.clubs[0].id).toBe('club-001');
    expect(page1.clubs[23].id).toBe('club-024');
    expect(page1.nextCursor).not.toBeNull();
    expect(typeof page1.nextCursor).toBe('string');

    // Page 2 using cursor from Page 1
    const page2 = await getVisibleClubsPaginated({
      cursor: page1.nextCursor!,
      limit: 24,
    });

    expect(orFilter).not.toBeNull();
    expect(orFilter).toContain(page1.clubs[23].created_at);
    expect(orFilter).toContain(page1.clubs[23].id);
    expect(page2.clubs).toHaveLength(6);
    // Crucial QA-11 check: 25th club is the first club on page 2!
    expect(page2.clubs[0].id).toBe('club-025');
    expect(page2.clubs[5].id).toBe('club-030');
    expect(page2.nextCursor).toBeNull();
  });

  it('handles database error gracefully by returning empty list and error message', async () => {
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
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        then: (resolve: (val: any) => void) =>
          Promise.resolve({
            data: null,
            error: { message: 'Database connection failed' },
          }).then(resolve),
      })),
    };

    vi.spyOn(clientsModule, 'createServerSupabase').mockResolvedValue(supabaseMock as any);

    const { getVisibleClubsPaginated } = await import('@/features/clubs/queries');
    const result = await getVisibleClubsPaginated();

    expect(result.clubs).toEqual([]);
    expect(result.nextCursor).toBeNull();
    expect(result.error).toBe('Database connection failed');
  });
});

describe('ClubSearch Component (QA-11)', () => {
  it('renders search field, timeline of clubs and load more button when cursor is present', async () => {
    const React = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { ClubSearch } = await import('@/components/clubs/club-search');

    const sampleClubs = [
      {
        id: 'c-1',
        owner_id: 'u-1',
        name: 'Clube Teste 1',
        slug: 'clube-1',
        description: 'Desc 1',
        is_private: false,
        version: 1,
        archived_at: null,
        created_at: new Date().toISOString(),
      },
    ];

    const html = renderToStaticMarkup(
      React.createElement(ClubSearch, {
        initialClubs: sampleClubs,
        initialCursor: 'token-cursor-123',
        initialQuery: '',
      }),
    );

    expect(html).toContain('Buscar clubes por nome');
    expect(html).toContain('Carregar mais clubes');
    expect(html).toContain('Clube Teste 1');
  });

  it('renders clear button and search term hint when active query is set', async () => {
    const React = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { ClubSearch } = await import('@/components/clubs/club-search');

    const sampleClubs = [
      {
        id: 'c-1',
        owner_id: 'u-1',
        name: 'Clube Ficção',
        slug: 'clube-ficcao',
        description: 'Desc Ficção',
        is_private: false,
        version: 1,
        archived_at: null,
        created_at: new Date().toISOString(),
      },
    ];

    const html = renderToStaticMarkup(
      React.createElement(ClubSearch, {
        initialClubs: sampleClubs,
        initialCursor: null,
        initialQuery: 'Ficção',
      }),
    );

    expect(html).toContain('Limpar busca');
    expect(html).toContain('Resultados para “Ficção”');
    expect(html).not.toContain('Carregar mais clubes');
  });

  it('renders empty state when no clubs match search', async () => {
    const React = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { ClubSearch } = await import('@/components/clubs/club-search');

    const html = renderToStaticMarkup(
      React.createElement(ClubSearch, {
        initialClubs: [],
        initialCursor: null,
        initialQuery: 'Inexistente',
      }),
    );

    expect(html).toContain('Nenhum clube encontrado');
    expect(html).toContain('Limpar busca');
  });
});

