import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryState } from '@/components/query-state';
import { EmptyState } from '@/components/empty-state';
import { querySuccess, queryFailure } from '@/lib/queries/result';

describe('QueryState component (QA-14)', () => {
  describe('Error handling and retry button', () => {
    it('renders error notice and retry button when result.ok is false and onRetry is provided', () => {
      const onRetry = vi.fn();
      const result = queryFailure('unavailable', 'Falha de conexão com o servidor');

      const html = renderToStaticMarkup(
        <QueryState result={result} onRetry={onRetry}>
          {(data: string[]) => <div>Dados: {data.join(', ')}</div>}
        </QueryState>
      );

      expect(html).toContain('role="alert"');
      expect(html).toContain('Falha de conexão com o servidor');
      expect(html).toContain('Tentar novamente');
      expect(html).not.toContain('Dados:');
    });

    it('renders default error message when result.message is not provided', () => {
      const result = queryFailure('unavailable');

      const html = renderToStaticMarkup(
        <QueryState result={result}>
          {(data: string[]) => <div>Dados: {data.join(', ')}</div>}
        </QueryState>
      );

      expect(html).toContain('role="alert"');
      expect(html).toContain('Não foi possível carregar as informações');
      expect(html).toContain('Ocorreu uma instabilidade na consulta. Seus dados estão seguros.');
      expect(html).not.toContain('Tentar novamente');
    });

    it('attaches onRetry handler to the button when provided', () => {
      const onRetry = vi.fn();
      const result = queryFailure('unavailable', 'Erro temporário');

      const element = QueryState({
        result,
        onRetry,
        children: () => null,
      });

      // QueryState returns a ReactElement with button child containing onRetry
      expect(element).toBeDefined();
      expect(React.isValidElement(element)).toBe(true);

      // Verify button has onRetry handler
      const childrenArray = React.Children.toArray((element as React.ReactElement<{ children: React.ReactNode }>).props.children);
      const button = childrenArray.find(
        (child) => React.isValidElement(child) && child.type === 'button'
      ) as React.ReactElement<{ onClick?: () => void }> | undefined;

      expect(button).toBeDefined();
      expect(button?.props.onClick).toBe(onRetry);
      button?.props.onClick?.();
      expect(onRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('Visual and semantic differentiation by error code', () => {
    it('differentiates unauthenticated error from service unavailability', () => {
      const unauthResult = queryFailure('unauthenticated');
      const unauthHtml = renderToStaticMarkup(
        <QueryState result={unauthResult}>
          {() => <div>Conteúdo seguro</div>}
        </QueryState>
      );

      expect(unauthHtml).toContain('data-error-code="unauthenticated"');
      expect(unauthHtml).toContain('notice-unauthenticated');
      expect(unauthHtml).toContain('Sessão necessária');
      expect(unauthHtml).not.toContain('Conteúdo seguro');

      const unavailResult = queryFailure('unavailable');
      const unavailHtml = renderToStaticMarkup(
        <QueryState result={unavailResult}>
          {() => <div>Conteúdo seguro</div>}
        </QueryState>
      );

      expect(unavailHtml).toContain('data-error-code="unavailable"');
      expect(unavailHtml).toContain('notice-unavailable');
      expect(unavailHtml).toContain('Não foi possível carregar as informações');
      expect(unavailHtml).not.toContain('notice-unauthenticated');
    });

    it('handles forbidden error code distinctly', () => {
      const forbiddenResult = queryFailure('forbidden');
      const forbiddenHtml = renderToStaticMarkup(
        <QueryState result={forbiddenResult}>
          {() => <div>Conteúdo restrito</div>}
        </QueryState>
      );

      expect(forbiddenHtml).toContain('data-error-code="forbidden"');
      expect(forbiddenHtml).toContain('notice-forbidden');
      expect(forbiddenHtml).toContain('Acesso restrito');
    });
  });

  describe('Empty state handling and success rendering', () => {
    it('renders EmptyState fallback ONLY when result.ok is true and data is empty', () => {
      const emptyResult = querySuccess<string[]>([]);
      const emptyFallback = (
        <EmptyState
          title="Sua fila está vazia"
          description="Nenhum livro adicionado ainda."
        />
      );

      const html = renderToStaticMarkup(
        <QueryState
          result={emptyResult}
          emptyPredicate={(data) => data.length === 0}
          emptyFallback={emptyFallback}
        >
          {(data) => <div>Livros: {data.join(', ')}</div>}
        </QueryState>
      );

      expect(html).toContain('Sua fila está vazia');
      expect(html).toContain('Nenhum livro adicionado ainda.');
      expect(html).not.toContain('role="alert"');
      expect(html).not.toContain('Livros:');
    });

    it('NEVER renders EmptyState fallback on query failure (fails closed)', () => {
      const failedResult = queryFailure<string[]>('unavailable', 'Falha no banco');
      const emptyFallback = (
        <EmptyState
          title="Sua fila está vazia"
          description="Nenhum livro adicionado ainda."
        />
      );

      const html = renderToStaticMarkup(
        <QueryState
          result={failedResult}
          emptyPredicate={(data) => data.length === 0}
          emptyFallback={emptyFallback}
        >
          {(data) => <div>Livros: {data.join(', ')}</div>}
        </QueryState>
      );

      // Must show error, NEVER masquerade as empty
      expect(html).toContain('role="alert"');
      expect(html).toContain('Falha no banco');
      expect(html).not.toContain('Sua fila está vazia');
      expect(html).not.toContain('Nenhum livro adicionado ainda.');
    });

    it('renders children with data when result.ok is true and data is present', () => {
      const successResult = querySuccess<string[]>(['Dom Casmurro', 'Memórias Póstumas']);

      const html = renderToStaticMarkup(
        <QueryState result={successResult}>
          {(books) => (
            <ul data-testid="book-list">
              {books.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
        </QueryState>
      );

      expect(html).toContain('data-testid="book-list"');
      expect(html).toContain('Dom Casmurro');
      expect(html).toContain('Memórias Póstumas');
      expect(html).not.toContain('role="alert"');
    });
  });

  describe('Up-Next query failure contract (QA-14)', () => {
    it('returns unauthenticated failure when userId is missing', async () => {
      const { getUserUpNextResult } = await import('@/features/up-next/queries');
      const res = await getUserUpNextResult('');
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe('unauthenticated');
      }
    });

    it('returns unavailable failure when database query errors rather than empty array', async () => {
      const clientsModule = await import('@/lib/supabase/clients');
      const supabaseMock = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST500', message: 'Database connection failed' },
          }),
        })),
      };
      vi.spyOn(clientsModule, 'createServerSupabase').mockResolvedValue(supabaseMock as any);

      const { getUserUpNextResult, getUserUpNext } = await import('@/features/up-next/queries');
      const res = await getUserUpNextResult('user-fail');

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe('unavailable');
        expect(res.message).toContain('Não foi possível carregar sua fila');
      }

      // Legacy fallback returns empty array without crashing
      const fallbackItems = await getUserUpNext('user-fail');
      expect(fallbackItems).toEqual([]);
    });

    it('returns mapped items on successful query', async () => {
      const clientsModule = await import('@/lib/supabase/clients');
      const supabaseMock = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [
              {
                book_id: 'b-1',
                position: 1,
                added_at: '2026-01-01',
                book: {
                  id: 'b-1',
                  title: 'Livro 1',
                  slug: 'livro-1',
                  cover_url: null,
                  total_pages: 100,
                  synopsis: 'Sinopse',
                },
              },
            ],
            error: null,
          }),
        })),
      };
      vi.spyOn(clientsModule, 'createServerSupabase').mockResolvedValue(supabaseMock as any);

      const { getUserUpNextResult } = await import('@/features/up-next/queries');
      const res = await getUserUpNextResult('user-1');

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.length).toBe(1);
        expect(res.data[0].book?.title).toBe('Livro 1');
      }
    });
  });

  describe('Catalog getSeason fail-closed contract (QA-14)', () => {
    it('sets can_open: false and reason: access_check_unavailable when chapter access RPC fails', async () => {
      const clientsModule = await import('@/lib/supabase/clients');
      const supabaseMock = {
        auth: {
          getClaims: vi.fn().mockResolvedValue({ data: { claims: null } }),
        },
        from: vi.fn((table: string) => {
          if (table === 'seasons') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'season-1',
                  number: 1,
                  title: 'Temporada 1',
                  slug: 'temp-1',
                  book_id: 'book-1',
                  status: 'active',
                  description: null,
                  starts_at: null,
                  ends_at: null,
                  cover_url: null,
                },
                error: null,
              }),
            };
          }
          if (table === 'books') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'book-1', title: 'Livro 1', slug: 'livro-1', cover_url: null, author_id: 'a-1' },
                error: null,
              }),
            };
          }
          if (table === 'chapters') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              or: vi.fn().mockReturnThis(),
              order: vi.fn().mockResolvedValue({
                data: [
                  { id: 'ch-1', season_id: 'season-1', number: 1, title: 'Capítulo 1', reading_range: null, youtube_url: null, summary: null, published_at: null },
                  { id: 'ch-2', season_id: 'season-1', number: 2, title: 'Capítulo 2', reading_range: null, youtube_url: null, summary: null, published_at: null },
                ],
                error: null,
              }),
            };
          }
          if (table === 'milestones') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            };
          }
          return {};
        }),
        rpc: vi.fn((proc: string) => {
          if (proc === 'get_season_chapter_access') {
            // RPC fails (network or permissions)
            return Promise.resolve({
              data: null,
              error: { code: 'PGRST500', message: 'RPC failure' },
            });
          }
          return Promise.resolve({ data: [], error: null });
        }),
      };

      vi.spyOn(clientsModule, 'createServerSupabase').mockResolvedValue(supabaseMock as any);

      const { getSeason } = await import('@/features/catalog/queries');
      const seasonData = await getSeason('temp-1');

      expect(seasonData).not.toBeNull();
      expect(seasonData?.chapters.length).toBe(2);
      expect(seasonData?.chapterAccess.length).toBe(2);

      // Verify fail-closed security: NEVER allow can_open: true when access RPC fails
      expect(seasonData?.chapterAccess[0].can_open).toBe(false);
      expect(seasonData?.chapterAccess[0].reason).toBe('access_check_unavailable');
      expect(seasonData?.chapterAccess[1].can_open).toBe(false);
      expect(seasonData?.chapterAccess[1].reason).toBe('access_check_unavailable');
    });
  });
});

