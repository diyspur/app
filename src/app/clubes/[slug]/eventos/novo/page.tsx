import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { MeetingForm } from '@/components/calendar/meeting-form';
import { buildClubHref } from '@/lib/community-navigation';
import { createServerSupabase } from '@/lib/supabase/clients';

export const dynamic = 'force-dynamic';

type Params = Promise<{ slug: string }>;

export const metadata: Metadata = {
  title: 'Agendar Encontro do Clube | DIYSPUR',
  robots: { index: false, follow: false },
};

export default async function NewClubMeetingPage({ params }: { params: Params }) {
  const { slug } = await params;
  const supabase = await createServerSupabase();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub ?? null;

  if (!userId) {
    redirect(`/entrar?redirect=${encodeURIComponent(`/clubes/${slug}/eventos/novo`)}`);
  }

  const { data: club } = await supabase
    .from('user_clubs')
    .select('id,slug,name,description,owner_id,official_book_id,current_book_id,current_season_id')
    .eq('slug', slug)
    .is('archived_at', null)
    .maybeSingle();

  if (!club) {
    notFound();
  }

  const [{ data: memberRow }, { data: isAdmin }] = await Promise.all([
    supabase
      .from('user_club_members')
      .select('role')
      .eq('club_id', club.id)
      .eq('user_id', userId)
      .maybeSingle(),
    supabase.rpc('is_admin'),
  ]);

  const canManage =
    Boolean(isAdmin) ||
    club.owner_id === userId ||
    memberRow?.role === 'owner' ||
    memberRow?.role === 'moderator';

  if (!canManage) {
    redirect(buildClubHref(club.slug));
  }

  let targetBookId = club.official_book_id ?? club.current_book_id;

  if (!targetBookId && club.current_season_id) {
    const { data: season } = await supabase
      .from('seasons')
      .select('book_id')
      .eq('id', club.current_season_id)
      .maybeSingle();
    if (season?.book_id) {
      targetBookId = season.book_id;
    }
  }

  // Se o clube ainda não possui livro vinculado, busca o livro mais recente do catálogo como padrão
  if (!targetBookId) {
    const { data: defaultBook } = await supabase
      .from('books')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    targetBookId = defaultBook?.id ?? null;
  }

  if (!targetBookId) {
    return (
      <section className="container page-stack">
        <div className="callout callout-warning">
          <p>Não há nenhum livro cadastrado na plataforma para associar ao encontro.</p>
        </div>
      </section>
    );
  }

  const [{ data: book }, { data: chaptersData }] = await Promise.all([
    supabase.from('books').select('id,slug,title').eq('id', targetBookId).maybeSingle(),
    supabase
      .from('chapters')
      .select('id,number,title,seasons!inner(book_id)')
      .eq('seasons.book_id', targetBookId)
      .order('number'),
  ]);

  const chapters = (chaptersData ?? []).map((ch) => ({
    id: ch.id,
    number: ch.number,
    title: ch.title,
  }));

  return (
    <section className="container page-stack" aria-labelledby="new-meeting-title">
      <nav aria-label="Navegação estrutural" className="breadcrumbs-nav" style={{ marginBottom: '1rem' }}>
        <Link href={buildClubHref(club.slug)} className="text-link">
          &larr; Voltar para {club.name}
        </Link>
      </nav>

      <header className="page-intro" style={{ marginBottom: '1.5rem' }}>
        <h1 id="new-meeting-title">Agendar Novo Encontro</h1>
        <p>
          Crie um encontro virtual ou presencial para os membros do clube <strong>{club.name}</strong>.
        </p>
      </header>

      <section className="member-card form-card">
        <MeetingForm
          mode="create"
          clubId={club.id}
          bookId={targetBookId}
          bookTitle={book?.title ?? 'Livro do Clube'}
          chapters={chapters}
          onSuccessRedirectHref={buildClubHref(club.slug)}
        />
      </section>
    </section>
  );
}
