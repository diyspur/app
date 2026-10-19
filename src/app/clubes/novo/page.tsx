import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DiscussionEntryButton } from '@/components/discussions/discussion-entry-button';
import { createServerSupabase } from '@/lib/supabase/clients';
import { groupEntryContextSchema } from '@/lib/group-entry-context';
import { chapterLabel } from '@/lib/chapter-label';

export const metadata: Metadata = {
  title: 'Criar ou Entrar no Clube de Leitura | DIYSPUR',
  robots: { index: false, follow: false },
};

export default async function NewClubPage({
  searchParams,
}: {
  searchParams: Promise<{ livro?: string; capitulo?: string }>;
}) {
  const query = await searchParams;

  if (!query.livro) {
    return (
      <section className="container">
        <header className="page-intro">
          <span className="eyebrow">Clube oficial</span>
          <h1>Escolha o livro do grupo</h1>
          <p>
            No DIYSPUR, cada livro tem um clube oficial exclusivo com canais <em>sem-spoilers</em>, 
            <em>com-spoilers</em> e conversas específicas para cada capítulo.
          </p>
        </header>
        <div className="empty-state">
          <h2>Selecione uma história para começar</h2>
          <p>Navegue pelo catálogo e entre no grupo oficial de leitura da obra.</p>
          <div style={{ marginTop: '16px' }}>
            <Link className="button button-dark" href="/livros">
              Ver catálogo de livros →
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const parsed = groupEntryContextSchema.safeParse(query);
  if (!parsed.success) notFound();

  const client = await createServerSupabase();
  const { data: book, error: bookError } = await client
    .from('books')
    .select('id,slug,title')
    .eq('id', parsed.data.livro)
    .maybeSingle();

  if (bookError || !book) notFound();

  let chapterTitle: string | null = null;
  if (parsed.data.capitulo) {
    const { data: chapter } = await client
      .from('chapters')
      .select('id,number,title,seasons!inner(book_id)')
      .eq('id', parsed.data.capitulo)
      .eq('seasons.book_id', book.id)
      .maybeSingle();

    if (chapter) {
      chapterTitle = chapterLabel(chapter.title, chapter.number);
    }
  }

  return (
    <section className="container">
      <header className="page-intro">
        <span className="eyebrow">Grupo do livro</span>
        <h1>{book.title}</h1>
        <p>
          Se o grupo oficial deste livro já existir, você será direcionado para a conversa. Caso
          contrário, o clube será criado instantaneamente com os canais padrão.
        </p>
        {chapterTitle && (
          <p className="field-hint" style={{ marginTop: '8px' }}>
            Contexto selecionado: <strong>{chapterTitle}</strong>
          </p>
        )}
      </header>

      <div style={{ marginTop: '24px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        {parsed.data.capitulo ? (
          <DiscussionEntryButton
            mode="chapter"
            chapterId={parsed.data.capitulo}
            label="Abrir conversa do capítulo"
          />
        ) : (
          <DiscussionEntryButton
            mode="book"
            bookId={book.id}
            bookSlug={book.slug}
            label="Entrar ou criar grupo do livro"
          />
        )}
        <Link className="button button-quiet" href={`/livros/${book.slug}`}>
          Voltar para a ficha do livro
        </Link>
      </div>
    </section>
  );
}
