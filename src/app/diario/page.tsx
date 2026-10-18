import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth/session';
import { JournalEntryForm } from '@/components/journal/journal-entry-form';
import { JournalEntryItem } from '@/components/journal/journal-entry-item';
import { getJournalEntries } from '@/features/journal/queries';

type BookOption = { id: string; title: string };

export const metadata: Metadata = {
  title: 'Diário de leitura',
  description: 'Suas anotações privadas de leitura.',
  robots: { index: false, follow: false },
};

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; tab?: string }>;
}) {
  const session = await requireSession();
  if (!session) {
    redirect('/entrar?redirect=%2Fdiario&reason=login-required');
  }

  const { cursor, tab } = await searchParams;
  const isArchivedTab = tab === 'arquivados';

  const [{ data: rawBooks }, journal] = await Promise.all([
    session.client.from('books').select('id,title').order('title').limit(100),
    getJournalEntries(session.userId, cursor, 20, isArchivedTab),
  ]);

  const books = (rawBooks ?? []) as BookOption[];
  const entries = journal.data ?? [];
  const bookMap = new Map<string, string>(books.map((book) => [book.id, book.title]));

  return (
    <section className="container">
      <header className="page-intro">
        <span className="eyebrow">Seu espaço</span>
        <h1>
          O que a leitura<br />
          <em>deixou.</em>
        </h1>
        <p>Um diário privado para guardar ideias, ritmo e pequenas descobertas. Seu diário é privado.</p>
      </header>

      {!isArchivedTab && <JournalEntryForm books={books} />}

      <section className="section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Memória</span>
            <h2>{isArchivedTab ? 'Registros arquivados' : 'Registros recentes'}</h2>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <Link
              className={`button button-small ${!isArchivedTab ? 'button-dark' : 'button-quiet'}`}
              href="/diario"
            >
              Ativos
            </Link>
            <Link
              className={`button button-small ${isArchivedTab ? 'button-dark' : 'button-quiet'}`}
              href="/diario?tab=arquivados"
            >
              Arquivados
            </Link>
            <Link className="text-link" href="/livros" style={{ marginLeft: '8px' }}>
              Explorar livros →
            </Link>
          </div>
        </div>

        {journal.error ? (
          <div className="empty-state">
            <h2>Não foi possível carregar seu diário agora.</h2>
            <p>Tente atualizar a página em alguns instantes.</p>
          </div>
        ) : entries.length ? (
          <>
            <div className="timeline">
              {entries.map((entry) => (
                <JournalEntryItem
                  key={entry.id}
                  entry={entry}
                  bookTitle={bookMap.get(entry.book_id) ?? 'Livro'}
                />
              ))}
            </div>
            {journal.nextCursor && (
              <div className="hero-actions">
                <Link
                  className="button button-quiet button-small"
                  href={{
                    pathname: '/diario',
                    query: {
                      cursor: journal.nextCursor,
                      ...(isArchivedTab ? { tab: 'arquivados' } : {}),
                    },
                  }}
                >
                  Carregar registros anteriores
                </Link>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-state-mark" aria-hidden="true">✎</div>
            <h2>{isArchivedTab ? 'Nenhum registro arquivado' : 'Seu diário começa aqui'}</h2>
            <p>
              {isArchivedTab
                ? 'Quando arquivar um registro de leitura, ele ficará guardado aqui para consulta ou restauração.'
                : 'Registre uma impressão depois do próximo capítulo.'}
            </p>
          </div>
        )}
      </section>
    </section>
  );
}
