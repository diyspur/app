'use client';

import { useEffect, useState, useTransition, type FormEvent } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type BookSearchProps = { initialQuery: string };

export function BookSearch({ initialQuery }: BookSearchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized === initialQuery.trim()) return;
    const timeoutId = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams ? searchParams.toString() : '');
      params.delete('page');
      if (normalized) {
        params.set('q', normalized);
      } else {
        params.delete('q');
      }
      const suffix = params.toString();
      startTransition(() => {
        router.replace(suffix ? `${pathname}?${suffix}` : pathname, { scroll: false });
      });
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [query, initialQuery, pathname, router, searchParams]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams(searchParams ? searchParams.toString() : '');
    params.delete('page');
    const normalized = query.trim();
    if (normalized) {
      params.set('q', normalized);
    } else {
      params.delete('q');
    }
    const suffix = params.toString();
    router.push(suffix ? `${pathname}?${suffix}` : pathname, { scroll: false });
  }

  return (
    <form className="search-form" action="/livros" method="get" onSubmit={submit}>
      <label className="sr-only" htmlFor="book-query">Buscar livros por título</label>
      <input
        className="field"
        id="book-query"
        type="search"
        name="q"
        value={query}
        maxLength={120}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar por título…"
        aria-describedby="book-search-status"
      />
      <button className="button button-small" type="submit">Buscar</button>
      <span className="sr-only" id="book-search-status" role="status" aria-live="polite">
        {isPending ? 'Atualizando resultados…' : ''}
      </span>
    </form>
  );
}
