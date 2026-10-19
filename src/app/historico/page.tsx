import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getReadingHistory, type ReadingHistoryItem } from '@/features/profile/queries';
import { memberLinks } from '@/lib/member-navigation';
import { cleanChapterTitle } from '@/lib/chapter-label';
import { createServerSupabase } from '@/lib/supabase/clients';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Minha leitura | DIYSPUR', robots: { index: false, follow: false } };

function formatDate(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(date);
}

function statusLabel(status: ReadingHistoryItem['status'] | string): string {
  const labels: Record<string, string> = {
    want_to_read: 'Quero ler',
    reading: 'Em andamento',
    read: 'Concluído',
    dnf: 'Abandonei/Não concluído',
  };
  return labels[status] ?? status;
}

function HistoryRow({ item }: { item: ReadingHistoryItem }) {
  const updatedDate = formatDate(item.updatedAt);
  const hasProgress = typeof item.percent === 'number';
  const seasonDisplay =
    item.season.title.trim().toLowerCase() === item.book.title.trim().toLowerCase()
      ? `Temporada ${item.season.number}`
      : item.season.title;

  return (
    <article className="timeline-row">
      <div>
        <h3>
          <Link href={`/capitulos/${item.chapter.id}`}>
            {cleanChapterTitle(item.chapter.title, item.chapter.number)}
          </Link>
        </h3>
        <p>
          <Link className="text-link" href={`/livros/${item.book.slug}`}>
            {item.book.title}
          </Link>
          {' · '}
          <Link className="text-link" href={`/temporadas/${item.season.slug}`}>
            {seasonDisplay}
          </Link>
          {' · capítulo '}
          {item.chapter.number}
        </p>
        <p>
          {hasProgress && `${item.percent}% lido`}
          {hasProgress && item.quiz ? ' · ' : ''}
          {item.quiz && `Quiz: ${item.quiz.score}/${item.quiz.total}`}
          {(hasProgress || item.quiz) && updatedDate ? ' · ' : ''}
          {updatedDate && <time dateTime={item.updatedAt}>Atualizado em {updatedDate}</time>}
        </p>
      </div>
      <span className={`status-pill${item.status === 'read' ? '' : ' neutral'}`}>
        {statusLabel(item.status)}
      </span>
    </article>
  );
}

function HistorySection({
  id,
  eyebrow,
  title,
  items,
}: {
  id: string;
  eyebrow: string;
  title: string;
  items: ReadingHistoryItem[];
}) {
  if (!items.length) return null;
  return (
    <section className="section" style={{ paddingBlock: 24 }} aria-labelledby={id}>
      <div className="section-head" style={{ marginBottom: 16 }}>
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2 id={id}>{title}</h2>
        </div>
      </div>
      <div className="timeline">
        {items.map((item) => (
          <HistoryRow item={item} key={item.id} />
        ))}
      </div>
    </section>
  );
}

export default async function HistoryPage() {
  const [history, bookReadingsResult] = await Promise.all([
    getReadingHistory(),
    (async () => {
      try {
        const supabase = await createServerSupabase();
        return await supabase
          .from('user_book_readings')
          .select('book_id, status, updated_at, books(id, title, slug, cover_url)')
          .order('updated_at', { ascending: false });
      } catch {
        return { data: null };
      }
    })(),
  ]);

  if (history === null) redirect('/entrar?redirect=/historico');

  const inProgress = history.filter((item) => item.status === 'reading');
  const completed = history.filter((item) => item.status === 'read');
  const other = history.filter((item) => item.status !== 'reading' && item.status !== 'read');

  type RawBookReadingRow = {
    book_id: string;
    status: string;
    updated_at: string;
    books:
      | { id: string; title: string; slug: string; cover_url: string | null }
      | { id: string; title: string; slug: string; cover_url: string | null }[]
      | null;
  };

  const bookReadings = (
    (bookReadingsResult.data ?? []) as unknown as RawBookReadingRow[]
  ).map((row) => {
    const rawBook = (Array.isArray(row.books) ? row.books[0] : row.books) as
      | { id: string; title: string; slug: string; cover_url: string | null }
      | null
      | undefined;
    return {
      bookId: row.book_id,
      status: row.status,
      updatedAt: row.updated_at,
      book: rawBook,
    };
  });

  return (
    <section className="container">
      <header className="page-intro">
        <span className="eyebrow">Histórico de leitura</span>
        <h1>O que você está lendo.</h1>
        <p>Seus livros e capítulos acompanhados, organizados no seu ritmo.</p>
      </header>
      <div className="member-grid">
        <nav className="member-nav" aria-label="Área pessoal">
          {memberLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={link.href === '/historico' ? 'page' : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="member-card">
          {bookReadings.length > 0 && (
            <section
              className="section"
              style={{ paddingBottom: '24px', borderBottom: '1px solid var(--border)' }}
              aria-labelledby="books-shelf-title"
            >
              <div className="section-head" style={{ marginBottom: 16 }}>
                <div>
                  <span className="eyebrow">Estante Pessoal</span>
                  <h2 id="books-shelf-title">Livros em Andamento & Marcados</h2>
                </div>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                  gap: '12px',
                }}
              >
                {bookReadings.map((br) => {
                  if (!br.book) return null;
                  return (
                    <Link
                      key={br.bookId}
                      href={`/livros/${br.book.slug}`}
                      style={{
                        padding: '12px',
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-md)',
                        display: 'block',
                        textDecoration: 'none',
                        color: 'inherit',
                      }}
                    >
                      <strong style={{ display: 'block', fontSize: 'var(--text-body-sm)' }}>
                        {br.book.title}
                      </strong>
                      <span
                        className="field-hint"
                        style={{ display: 'block', fontSize: 'var(--text-caption)', marginTop: '4px' }}
                      >
                        Status: <strong>{statusLabel(br.status)}</strong>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {history.length === 0 && bookReadings.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-mark" aria-hidden="true">
                ⌁
              </div>
              <h2>Nenhuma leitura registrada ainda</h2>
              <p>Quando você começar um capítulo ou marcar um livro, seu andamento aparecerá aqui.</p>
              <div className="empty-actions">
                <Link className="button button-dark button-small" href="/livros">
                  Explorar livros
                </Link>
              </div>
            </div>
          ) : (
            <>
              <HistorySection
                id="in-progress-title"
                eyebrow="Agora"
                title="Em andamento por capítulo"
                items={inProgress}
              />
              <HistorySection
                id="completed-title"
                eyebrow="Concluídos"
                title="Capítulos concluídos"
                items={completed}
              />
              <HistorySection
                id="other-reading-title"
                eyebrow="Outros registros"
                title="Outras marcações"
                items={other}
              />
            </>
          )}
        </div>
      </div>
    </section>
  );
}
