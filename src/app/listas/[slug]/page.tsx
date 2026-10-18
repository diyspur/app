import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getReadingListBySlug } from '@/features/lists/queries';
import { BookCover } from '@/components/books/book-cover';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const list = await getReadingListBySlug(slug);
  if (!list) return { title: 'Lista não encontrada' };
  return {
    title: `${list.title} · Lista de Leitura DIYSPUR`,
    description: list.description || `Lista de leitura com ${list.items.length} obras.`,
  };
}

export default async function ReadingListPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const list = await getReadingListBySlug(slug);
  if (!list) notFound();

  return (
    <section className="container" style={{ marginTop: '32px' }}>
      <header className="page-intro">
        <span className="eyebrow">Lista de Leitura</span>
        <h1>{list.title}</h1>
        {list.description ? <p>{list.description}</p> : null}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
          <span className="tag">{list.items.length} {list.items.length === 1 ? 'livro' : 'livros'}</span>
          <span className="tag tag-accent">{list.visibility === 'public' ? 'Pública' : 'Privada'}</span>
        </div>
      </header>

      {list.items.length === 0 ? (
        <div className="notice" style={{ marginTop: '24px' }}>
          Esta lista ainda não possui livros adicionados. Explore o{' '}
          <Link href="/livros" className="text-link">catálogo</Link> para adicionar livros.
        </div>
      ) : (
        <div className="book-grid" style={{ marginTop: '32px' }}>
          {list.items.map((item) => (
            <article key={item.id} className="book-card">
              <Link href={`/livros/${encodeURIComponent(item.book?.slug || '')}`}>
                <div className="book-card-cover">
                  <BookCover
                    src={item.book?.cover_url ?? null}
                    title={item.book?.title || 'Livro'}
                    width={300}
                    height={450}
                  />
                </div>
                <h3>{item.book?.title}</h3>
                {item.book?.total_pages ? (
                  <p className="field-hint">{item.book.total_pages} páginas</p>
                ) : null}
              </Link>
            </article>
          ))}
        </div>
      )}

      <div style={{ marginTop: '40px' }}>
        <Link href="/listas" className="button button-small button-quiet">
          ← Voltar para Minhas Listas
        </Link>
      </div>
    </section>
  );
}
