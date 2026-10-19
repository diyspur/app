'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ClubSummary } from '@/features/clubs/queries';
import { getVisibleClubsAction } from '@/features/clubs/actions';

export interface ClubSearchProps {
  initialClubs: ClubSummary[];
  initialCursor: string | null;
  initialQuery?: string;
}

export function ClubSearch({
  initialClubs,
  initialCursor,
  initialQuery = '',
}: ClubSearchProps) {
  const pathname = usePathname();

  const [query, setQuery] = useState(initialQuery);
  const [activeQuery, setActiveQuery] = useState(initialQuery);
  const [clubs, setClubs] = useState<ClubSummary[]>(initialClubs);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const loadedIdsRef = useRef(new Set(initialClubs.map((c) => c.id)));
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastCommittedQueryRef = useRef(initialQuery);

  // Abort any in-flight request when component unmounts
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Sync state if server props change from external navigation, avoiding clobbering active keystrokes
  useEffect(() => {
    if (initialQuery !== lastCommittedQueryRef.current) {
      lastCommittedQueryRef.current = initialQuery;
      setQuery(initialQuery);
      setActiveQuery(initialQuery);
      setClubs(initialClubs);
      setCursor(initialCursor);
      loadedIdsRef.current = new Set(initialClubs.map((c) => c.id));
    }
  }, [initialClubs, initialCursor, initialQuery]);

  const updateUrl = useCallback(
    (searchTerm: string) => {
      if (typeof window === 'undefined') return;
      try {
        const url = new URL(window.location.href);
        if (searchTerm) {
          url.searchParams.set('q', searchTerm);
        } else {
          url.searchParams.delete('q');
        }
        window.history.replaceState(null, '', `${pathname}${url.search}`);
      } catch {
        // Safe fallback in environments without full window.location
      }
    },
    [pathname],
  );

  const fetchClubs = useCallback(
    async (searchTerm: string, cursorVal?: string | null) => {
      const isPagination = Boolean(cursorVal);
      if (isPagination) {
        setIsLoadingMore(true);
      } else {
        setIsSearching(true);
      }
      setLoadError(false);

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const params = new URLSearchParams();
        if (searchTerm.trim()) params.set('q', searchTerm.trim());
        if (cursorVal) params.set('cursor', cursorVal);
        params.set('limit', '24');

        let data: { clubs: ClubSummary[]; nextCursor: string | null } | null = null;

        // Try API endpoint first, fallback to Server Action
        try {
          const res = await fetch(`/api/clubs?${params.toString()}`, {
            method: 'GET',
            signal: controller.signal,
            headers: { Accept: 'application/json' },
          });
          if (res.ok) {
            data = (await res.json()) as { clubs: ClubSummary[]; nextCursor: string | null };
          }
        } catch {
          // Fall back to direct server action call if API is unavailable
        }

        if (!data) {
          const actionRes = await getVisibleClubsAction({
            search: searchTerm.trim() || undefined,
            cursor: cursorVal || undefined,
            limit: 24,
          });
          data = actionRes;
        }

        if (controller.signal.aborted) return;

        const incoming = data.clubs ?? [];
        const next = data.nextCursor ?? null;

        if (isPagination) {
          const newClubs = incoming.filter((c) => !loadedIdsRef.current.has(c.id));
          for (const c of newClubs) loadedIdsRef.current.add(c.id);
          setClubs((prev) => [...prev, ...newClubs]);
          setCursor(next);
        } else {
          loadedIdsRef.current = new Set(incoming.map((c) => c.id));
          setClubs(incoming);
          setCursor(next);
          setActiveQuery(searchTerm.trim());
          lastCommittedQueryRef.current = searchTerm.trim();
        }
      } catch (err) {
        if (!(err instanceof Error && err.name === 'AbortError')) {
          setLoadError(true);
        }
      } finally {
        if (isPagination) {
          setIsLoadingMore(false);
        } else {
          setIsSearching(false);
        }
      }
    },
    [],
  );

  // Handle browser back/forward navigation (popstate)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    function handlePopState() {
      const url = new URL(window.location.href);
      const q = url.searchParams.get('q') || '';
      lastCommittedQueryRef.current = q;
      setQuery(q);
      void fetchClubs(q);
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [fetchClubs]);

  // Debounced search on typing without redundant duplicate fetch
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === activeQuery.trim()) return;

    const timer = window.setTimeout(() => {
      updateUrl(trimmed);
      void fetchClubs(trimmed);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [query, activeQuery, fetchClubs, updateUrl]);

  function handleSearchSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = query.trim();
    updateUrl(trimmed);
    void fetchClubs(trimmed);
  }

  function handleClear() {
    setQuery('');
    updateUrl('');
    void fetchClubs('');
  }

  function handleLoadMore() {
    if (!cursor || isLoadingMore) return;
    void fetchClubs(activeQuery, cursor);
  }

  return (
    <div className="club-search-container">
      <form
        className="search-form"
        role="search"
        action="/clubes"
        method="get"
        onSubmit={handleSearchSubmit}
        style={{ marginBottom: 20 }}
      >
        <label className="sr-only" htmlFor="club-search-input">
          Buscar clubes por nome
        </label>
        <input
          id="club-search-input"
          className="field"
          type="search"
          name="q"
          value={query}
          maxLength={100}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar clubes por nome…"
          aria-describedby="club-search-status"
        />
        {query.trim() ? (
          <button
            type="button"
            className="button button-small button-quiet"
            onClick={handleClear}
            aria-label="Limpar busca de clubes"
          >
            Limpar busca
          </button>
        ) : null}
        <button className="button button-small" type="submit">
          Buscar
        </button>
        <span className="sr-only" id="club-search-status" role="status" aria-live="polite">
          {isSearching ? 'Buscando clubes…' : ''}
        </span>
      </form>

      {activeQuery ? (
        <p className="field-hint" style={{ marginBottom: 16 }}>
          Resultados para “{activeQuery}” ({clubs.length}{' '}
          {clubs.length === 1 ? 'clube exibido' : 'clubes exibidos'}) ·{' '}
          <button
            type="button"
            className="text-link"
            onClick={handleClear}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              font: 'inherit',
              cursor: 'pointer',
            }}
          >
            Limpar busca
          </button>
        </p>
      ) : null}

      {clubs.length ? (
        <div className="section" style={{ paddingTop: 12 }}>
          <div className="timeline">
            {clubs.map((club) => (
              <Link className="member-card" href={`/clubes/${club.slug}`} key={club.id}>
                <div className="section-head" style={{ marginBottom: 8 }}>
                  <div>
                    <span className="eyebrow">{club.is_private ? 'Privado' : 'Público'}</span>
                    <h2>{club.name}</h2>
                  </div>
                  <span className="status-pill neutral">Abrir →</span>
                </div>
                {club.description && <p>{club.description}</p>}
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-mark" aria-hidden="true">
            ◌
          </div>
          <h2>{activeQuery ? 'Nenhum clube encontrado' : 'Nenhum clube público ainda'}</h2>
          <p>
            {activeQuery
              ? 'Tente buscar por outro termo ou limpe a busca.'
              : 'Você pode inaugurar a primeira conversa.'}
          </p>
          {activeQuery ? (
            <div className="empty-actions" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="button button-small"
                onClick={handleClear}
              >
                Limpar busca
              </button>
            </div>
          ) : null}
        </div>
      )}

      {cursor ? (
        <div
          className="clubs-load-more"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            margin: '32px 0',
          }}
        >
          {loadError ? (
            <div role="alert" style={{ textAlign: 'center' }}>
              <p className="field-hint">Não foi possível carregar mais clubes.</p>
              <button
                className="button button-small"
                type="button"
                onClick={handleLoadMore}
              >
                Tentar novamente
              </button>
            </div>
          ) : (
            <button
              className="button button-small button-quiet"
              type="button"
              onClick={handleLoadMore}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? 'Carregando…' : 'Carregar mais clubes'}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
