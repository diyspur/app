import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getBook } from '@/features/catalog/queries';
import { BookCover } from '@/components/books/book-cover';
import { ShareBookButton } from '@/components/books/share-book-button';
import { AddQueueButton } from '@/components/up-next/add-queue-button';
import { AddBookToList } from '@/components/lists/add-book-to-list';
import { BookReadingControl } from '@/components/books/book-reading-control';
import { BookReadingStats } from '@/components/books/book-reading-stats';
import { DiscussionEntryButton } from '@/components/discussions/discussion-entry-button';
import { getBookReadingStats, getMyBookReadingState } from '@/features/reading/queries';
import { isBookInUserUpNext } from '@/features/up-next/queries';
import { getUserEditableLists } from '@/features/lists/queries';
import { requireSession } from '@/lib/auth/session';
import { JsonLd } from '@/components/json-ld';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const book = await getBook(slug);
  const authorName = book?.authors?.name ? ` por ${book.authors.name}` : '';
  const title = book ? `${book.title} — Clube de Leitura e Discussão` : 'Livro não encontrado';
  const description = book?.synopsis
    ? `Participe do clube de leitura de ${book.title}${authorName}. Cronograma de capítulos, avisos de conteúdo e debates ao vivo sem spoilers no DIYSPUR.`
    : (book ? `Conheça ${book.title} no clube de leitura DIYSPUR.` : undefined);

  return book
    ? {
        title,
        description,
        alternates: { canonical: `/livros/${encodeURIComponent(book.slug)}` },
        openGraph: {
          title,
          description,
          images: book.cover_url ? [book.cover_url] : undefined,
        },
      }
    : { title: 'Livro não encontrado' };
}

export default async function BookDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const book = await getBook(slug);
  if (!book) notFound();

  const session = await requireSession();
  const [readingState, readingStats, inUpNext, userLists] = await Promise.all([
    getMyBookReadingState(book.id),
    getBookReadingStats(book.id),
    session ? isBookInUserUpNext(session.userId, book.id) : Promise.resolve(false),
    session ? getUserEditableLists(session.userId) : Promise.resolve([]),
  ]);

  const safeExternal = book.amazon_url && /^https:\/\//i.test(book.amazon_url);
  const editionDetails = [
    book.edition_number ? { label: 'Edição', value: `${book.edition_number}ª` } : null,
    book.format ? { label: 'Formato', value: book.format } : null,
    book.publisher ? { label: 'Editora', value: book.publisher } : null,
    book.language ? { label: 'Idioma', value: book.language } : null,
    book.isbn13 ? { label: 'ISBN-13', value: book.isbn13 } : null,
    book.publication_year ? { label: 'Ano', value: String(book.publication_year) } : null,
    book.translator ? { label: 'Tradução', value: book.translator } : null,
  ].filter((item): item is { label: string; value: string } => item !== null);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://diyspur.vercel.app';
  const bookCanonicalUrl = `${siteUrl}/livros/${encodeURIComponent(book.slug)}`;

  const jsonLdData = {
    '@context': 'https://schema.org',
    '@type': 'Book',
    '@id': `${bookCanonicalUrl}#book`,
    name: book.title,
    url: bookCanonicalUrl,
    author: book.authors?.name ? { '@type': 'Person', name: book.authors.name } : undefined,
    isbn: book.isbn13 ?? undefined,
    numberOfPages: book.total_pages ?? undefined,
    inLanguage: book.language ?? 'pt-BR',
    publisher: book.publisher ? { '@type': 'Organization', name: book.publisher } : undefined,
    description: book.synopsis ?? undefined,
    image: book.cover_url ?? undefined,
    subjectOf: {
      '@type': 'DiscussionForumPosting',
      headline: `Clube de Leitura e Discussão Sem Spoilers: ${book.title}`,
      url: bookCanonicalUrl,
      publisher: {
        '@type': 'Organization',
        name: 'DIYSPUR',
        url: siteUrl,
      },
    },
  };

  return (
    <div className="container">
      <JsonLd data={jsonLdData} />
      <header className="book-hero">
        <div className="book-hero-grid">
          <div className="book-cover-wrap">
            <BookCover
              src={book.cover_url}
              title={book.title}
              width={320}
              height={480}
              className="book-cover-image"
              priority
            />
          </div>
          <div className="book-hero-content">
            <span className="eyebrow">Clube de Leitura</span>
            <h1>{book.title}</h1>
            {book.authors?.name ? (
              <p className="book-author">
                por <strong>{book.authors.name}</strong>
              </p>
            ) : null}
            {book.synopsis ? <p className="book-synopsis">{book.synopsis}</p> : null}
            <div className="book-meta-tags">
              {book.content_rating ? <span className="tag tag-accent">{book.content_rating}</span> : null}
              {book.tags?.map((tag) => (
                <span className="tag" key={tag}>{tag}</span>
              ))}
              {book.total_pages ? <span className="tag">{book.total_pages} páginas</span> : null}
              {book.total_chapters ? <span className="tag">{book.total_chapters} capítulos</span> : null}
            </div>
            {editionDetails.length ? (
              <dl className="book-edition-details" aria-label={`Dados editoriais de ${book.title}`}>
                {editionDetails.map(({ label, value }) => (
                  <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
                ))}
              </dl>
            ) : null}
            {book.warnings?.length ? (
              <section className="book-warnings" aria-labelledby="content-warnings-title">
                <h2 id="content-warnings-title">Avisos de conteúdo</h2>
                <ul>
                  {book.warnings.map((warning) => (
                    <li key={`${warning.label}-${warning.severity}`}>
                      <strong>{warning.label}</strong>
                      <span>
                        {warning.severity === 'graphic'
                          ? 'Intenso'
                          : warning.severity === 'moderate'
                            ? 'Moderado'
                            : 'Leve'}
                        {warning.is_community
                          ? ' · sinalizado pela comunidade'
                          : ' · revisão editorial'}
                      </span>
                      {warning.description && <p>{warning.description}</p>}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {/* Seção Onde Comprar & Compartilhar Leitura */}
            <div className="book-purchasing-panel">
              <span className="eyebrow">Acompanhe a leitura</span>
              <p className="book-purchasing-hint">
                Tenha seu exemplar físico ou digital (Kindle/e-Reader) para participar das conversas capítulo a capítulo.
              </p>
              <div className="book-purchasing-actions">
                {safeExternal ? (
                  <a
                    className="btn btn-primary btn-sm"
                    href={`/api/affiliate/${encodeURIComponent(book.slug)}`}
                    target="_blank"
                    rel="sponsored noopener noreferrer"
                  >
                    Comprar exemplar na Amazon <span aria-hidden="true">↗</span>
                  </a>
                ) : null}
                <ShareBookButton bookTitle={book.title} bookSlug={book.slug} />
                <AddQueueButton bookId={book.id} initialInQueue={inUpNext} signedIn={Boolean(session)} />
                <AddBookToList bookId={book.id} userLists={userLists} signedIn={Boolean(session)} />
                <Link
                  className="btn btn-secondary btn-sm"
                  href={`/leituras-compartilhadas?livro=${encodeURIComponent(book.id)}`}
                >
                  Convidar amigo por e-mail
                </Link>
                {safeExternal ? (
                  <p className="book-affiliate-disclaimer">
                    * Como participante do Programa de Associados da Amazon, o DIYSPUR pode receber uma comissão por compras qualificadas, sem nenhum custo extra para você.
                  </p>
                ) : null}
              </div>
            </div>

            {/* Controle Canônico de Leitura */}
            <div style={{ marginTop: '20px' }}>
              <BookReadingControl
                bookId={book.id}
                bookSlug={book.slug}
                initialState={readingState}
                signedIn={Boolean(book.signedIn)}
              />
            </div>

            {readingStats && (
              <div style={{ marginTop: '16px' }}>
                <BookReadingStats stats={readingStats} />
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Seção da Comunidade Canônica do Livro */}
      <section className="section" aria-labelledby="book-group-title">
        <div className="section-head">
          <div>
            <span className="eyebrow">Comunidade oficial</span>
            <h2 id="book-group-title">Leia e converse em comunidade</h2>
          </div>
        </div>
        <p>Um clube exclusivo para este livro, com conversas sem spoilers e debates aprofundados por capítulo.</p>
        <div style={{ marginTop: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <DiscussionEntryButton
            mode="book"
            bookId={book.id}
            bookSlug={book.slug}
            label="Grupo do livro"
            className="btn btn-primary"
          />
          <Link href="/desafios" className="btn btn-secondary">
            Ver desafios de leitura
          </Link>
          <Link href="/clubes" className="btn btn-ghost">
            Explorar todos os clubes
          </Link>
        </div>
      </section>

      {/* Temporadas e Capítulos */}
      <section className="section">
        <div className="section-head">
          <div>
            <span className="eyebrow">No seu ritmo</span>
            <h2>Temporadas e capítulos</h2>
          </div>
        </div>
        {book.seasons.length ? (
          <div className="season-list">
            {book.seasons.map((season) => (
              <Link
                className="season-row"
                href={`/temporadas/${encodeURIComponent(season.slug)}`}
                key={season.id}
              >
                <div>
                  <h3>{season.title}</h3>
                  <p>
                    {season.description ?? `Temporada ${season.number}`} ·{' '}
                    {season.starts_at
                      ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(
                          new Date(`${season.starts_at}T00:00:00`)
                        )
                      : 'Acompanhe a programação'}
                  </p>
                </div>
                <span className={`status-pill ${season.status === 'active' ? '' : 'neutral'}`}>
                  {season.status === 'active'
                    ? 'Em andamento'
                    : season.status === 'finished'
                      ? 'Concluída'
                      : 'Em breve'}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3>Esta leitura ainda não tem temporada aberta</h3>
            <p>Volte em breve para acompanhar capítulos e encontros do clube.</p>
          </div>
        )}
      </section>
    </div>
  );
}
