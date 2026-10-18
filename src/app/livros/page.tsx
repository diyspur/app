import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { getBooksResult } from '@/features/catalog/queries';
import { PersonalizedCatalog } from '@/components/catalog/personalized-catalog';
import { BookSearch } from '@/components/catalog/book-search';
import { JsonLd } from '@/components/json-ld';

export const metadata: Metadata = {
  title: 'Livros',
  description: 'Explore histórias e leituras compartilhadas pela comunidade DIYSPUR.',
  alternates: { canonical: '/livros' },
};

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Como funciona o clube de leitura DIYSPUR?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'O DIYSPUR organiza leituras em temporadas, com capítulos liberados progressivamente, quizzes e discussões em comunidade.',
      },
    },
  ],
};

export default async function BooksPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q = '', page = '1' } = await searchParams;
  const currentPage = Math.max(1, parseInt(page, 10) || 1);
  const result = await getBooksResult(q, currentPage, 24);

  if (!result.ok) {
    return (
      <section className="container">
        <header className="page-intro">
          <span className="eyebrow">A biblioteca do clube</span>
          <h1>Catálogo de Livros</h1>
        </header>
        <div className="notice" role="alert" style={{ marginTop: '24px' }}>
          Não foi possível carregar o catálogo de livros no momento.
          <div style={{ marginTop: '12px' }}>
            <Link href="/livros" className="button button-small">
              Tentar novamente
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const { books, total, totalPages, isPersonalized } = result.data;

  return (
    <section className="container">
      <JsonLd data={faqSchema} />
      <header className="page-intro">
        <span className="eyebrow">A biblioteca do clube</span>
        <h1>
          Uma boa história<br />
          <em>chama outra.</em>
        </h1>
        <p>Descubra a seleção de leituras DIYSPUR e encontre sua próxima conversa favorita.</p>
        {isPersonalized && !q && (
          <p className="field-hint" style={{ marginTop: '8px' }}>
            ✦ Lista personalizada com base nas suas leituras: recomendações no início e livros já lidos/em andamento ao final.
          </p>
        )}
        <Suspense
          fallback={
            <form className="search-form" action="/livros" method="get">
              <label className="sr-only" htmlFor="book-query-fallback">
                Buscar livros por título
              </label>
              <input
                className="field"
                id="book-query-fallback"
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Buscar por título…"
              />
              <button className="button button-small" type="submit">
                Buscar
              </button>
            </form>
          }
        >
          <BookSearch initialQuery={q} />
        </Suspense>
        {q && (
          <p className="field-hint">
            Resultados para “{q}” ({total} {total === 1 ? 'obra' : 'obras'}) ·{' '}
            <Link className="text-link" href="/livros">
              Limpar busca
            </Link>
          </p>
        )}
      </header>

      {books.length ? (
        <>
          <PersonalizedCatalog
            initialBooks={books}
            isServerPersonalized={Boolean(isPersonalized)}
          />

          {totalPages > 1 && (
            <nav aria-label="Paginação do catálogo" style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '32px' }}>
              {currentPage > 1 ? (
                <Link
                  href={`/livros?page=${currentPage - 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                  className="button button-small button-quiet"
                >
                  ← Página anterior
                </Link>
              ) : null}
              <span style={{ alignSelf: 'center', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                Página {currentPage} de {totalPages}
              </span>
              {currentPage < totalPages ? (
                <Link
                  href={`/livros?page=${currentPage + 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                  className="button button-small"
                >
                  Próxima página →
                </Link>
              ) : null}
            </nav>
          )}
        </>
      ) : (
        <div className="empty-state">
          <div className="empty-state-mark" aria-hidden="true">
            ⌕
          </div>
          <h2>{q ? 'Nenhum título por aqui ainda' : 'A próxima leitura está sendo escolhida'}</h2>
          <p>
            {q
              ? 'Tente outra busca ou confira novamente mais tarde.'
              : 'O catálogo do clube será atualizado em breve. Descubra enquanto isso as conversas da comunidade.'}
          </p>
          <div className="empty-actions">
            <Link className="button button-small" href={q ? '/livros' : '/comunidade'}>
              {q ? 'Ver catálogo completo' : 'Ir para a comunidade'}
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
