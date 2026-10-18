'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Book } from '@/features/catalog/queries';
import { BookCard } from '@/components/book-card';
import { getStoredInteractions } from '@/features/recommendations/browser-storage';
import { rankCatalogBooks } from '@/features/recommendations/tensorflow-recommender';

interface PersonalizedCatalogProps {
  initialBooks: Book[];
  initialQuery?: string;
  totalBooks: number;
  isServerPersonalized?: boolean;
}

type CatalogApiResponse = {
  books?: Book[];
  hasMore?: boolean;
};

const PAGE_SIZE = 24;

export function PersonalizedCatalog({
  initialBooks,
  initialQuery = '',
  totalBooks,
  isServerPersonalized = false,
}: PersonalizedCatalogProps) {
  const [books, setBooks] = useState<Book[]>(initialBooks);
  const [hasClientBoost, setHasClientBoost] = useState(false);
  const [nextPage, setNextPage] = useState(2);
  const [hasMore, setHasMore] = useState(initialBooks.length < totalBooks);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const activeRequestRef = useRef<AbortController | null>(null);
  const loadedIdsRef = useRef(new Set(initialBooks.map((book) => book.id)));

  useEffect(() => {
    // Keep the server ranking unless the browser has recent interactions to add.
    const interactions = getStoredInteractions();
    if (!interactions.length) return;

    try {
      const ranked = rankCatalogBooks(initialBooks, null, { interactions });
      if (ranked.some((book) => book.isRecommended)) {
        setBooks((current) => {
          // Re-rank only the server-provided batch; never discard pages already appended.
          const appended = current.filter((book) => !initialBooks.some((item) => item.id === book.id));
          return [...ranked, ...appended];
        });
        setHasClientBoost(true);
      }
    } catch (error) {
      console.warn('[PersonalizedCatalog] Fallback to initial order:', error);
    }
  }, [initialBooks]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingRef.current) return;

    loadingRef.current = true;
    setIsLoading(true);
    setLoadError(false);

    const controller = new AbortController();
    activeRequestRef.current = controller;

    try {
      const params = new URLSearchParams({ page: String(nextPage) });
      if (initialQuery.trim()) params.set('q', initialQuery.trim());

      const response = await fetch(`/api/books/catalog?${params.toString()}`, {
        method: 'GET',
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) throw new Error('catalog_request_failed');

      const payload = (await response.json()) as CatalogApiResponse;
      if (!Array.isArray(payload.books) || typeof payload.hasMore !== 'boolean') {
        throw new Error('invalid_catalog_response');
      }

      const newBooks = payload.books.filter(
        (book): book is Book =>
          Boolean(book && typeof book.id === 'string' && !loadedIdsRef.current.has(book.id)),
      );

      for (const book of newBooks) loadedIdsRef.current.add(book.id);
      if (newBooks.length) setBooks((current) => [...current, ...newBooks]);

      setNextPage((page) => page + 1);
      // Stop if the server has no more results or a changed catalog returned only duplicates.
      setHasMore(payload.hasMore && newBooks.length > 0);
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) {
        console.error('[PersonalizedCatalog] Failed to load next page');
        setLoadError(true);
      }
    } finally {
      loadingRef.current = false;
      setIsLoading(false);
      if (activeRequestRef.current === controller) activeRequestRef.current = null;
    }
  }, [hasMore, initialQuery, nextPage]);

  useEffect(() => () => activeRequestRef.current?.abort(), []);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || isLoading || loadError) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { rootMargin: '500px 0px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoading, loadError, loadMore]);

  return (
    <>
      {hasClientBoost && !isServerPersonalized && (
        <p className="field-hint" style={{ marginTop: '8px' }} role="status">
          ✦ Recomendações atualizadas com base nos livros que você visualizou recentemente no clube.
        </p>
      )}
      <div className="book-grid section" aria-label="Catálogo de livros">
        {books.map((book) => (
          <BookCard key={book.id} book={book} />
        ))}
      </div>

      <div
        ref={sentinelRef}
        aria-hidden="true"
        style={{ height: '1px', width: '100%' }}
      />

      <div
        className="catalog-load-more"
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', margin: '32px 0' }}
      >
        <p className="field-hint" role="status" aria-live="polite">
          {isLoading
            ? 'Carregando mais livros…'
            : hasMore
              ? `Exibindo ${books.length} de ${totalBooks} livros`
              : `Você chegou ao fim do catálogo · ${books.length} livros exibidos`}
        </p>

        {loadError ? (
          <div role="alert" style={{ textAlign: 'center' }}>
            <p className="field-hint">Não foi possível carregar mais livros.</p>
            <button className="button button-small" type="button" onClick={() => void loadMore()}>
              Tentar novamente
            </button>
          </div>
        ) : hasMore ? (
          <button
            className="button button-small button-quiet"
            type="button"
            onClick={() => void loadMore()}
            disabled={isLoading}
          >
            {isLoading ? 'Carregando…' : 'Carregar mais livros'}
          </button>
        ) : null}
      </div>
    </>
  );
}
