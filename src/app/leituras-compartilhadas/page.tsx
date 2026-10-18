import type { Metadata } from 'next';
import Link from 'next/link';

import { createServerSupabase } from '@/lib/supabase/clients';
import { BookInviteForm } from '@/components/sharing/book-invite-form';

export const metadata: Metadata = {
  title: 'Leituras compartilhadas',
  description: 'Leituras em grupo, metas e checkpoints autorizados para sua conta.',
  robots: { index: false, follow: false },
};

type BuddyRead = {
  id: string;
  book_id: string;
  title: string | null;
  owner_id: string;
  is_private: boolean;
  max_members: number;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
};

type BuddyMember = { buddy_read_id: string; joined_at: string };
type Checkpoint = {
  id: string;
  buddy_read_id: string;
  position: number;
  title: string;
  page_from: number | null;
  page_to: number | null;
  percent_from: number | null;
  percent_to: number | null;
  target_date: string | null;
};
type Book = { id: string; slug: string; title: string };

type BuddyReadView = BuddyRead & {
  relation: 'owner' | 'member' | 'authorized';
  member: BuddyMember | null;
  checkpoints: Checkpoint[];
};

type SharedReadsPageData = {
  userId: string | null;
  reads: BuddyReadView[];
  books: Map<string, Book>;
  error: string | null;
};

const emptyData = (error: string | null = null): SharedReadsPageData => ({
  userId: null,
  reads: [],
  books: new Map(),
  error,
});

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value: string | null): string | null {
  const date = parseDate(value);
  return date ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(date) : null;
}

function dateRange(read: BuddyRead): string | null {
  const start = formatDate(read.start_date);
  const end = formatDate(read.end_date);
  if (start && end) return `${start} a ${end}`;
  if (start) return `A partir de ${start}`;
  if (end) return `Até ${end}`;
  return null;
}

async function loadSharedReadsPage(): Promise<SharedReadsPageData> {
  let client: Awaited<ReturnType<typeof createServerSupabase>>;
  try {
    client = await createServerSupabase();
  } catch {
    return emptyData('Não foi possível conectar ao serviço de leitura agora.');
  }

  const { data: claimsData, error: claimsError } = await client.auth.getClaims();
  if (claimsError) return emptyData('Não foi possível verificar sua sessão. Tente entrar novamente.');

  const userId = typeof claimsData?.claims?.sub === 'string' ? claimsData.claims.sub : null;
  if (!userId) return emptyData();

  const readColumns = 'id,book_id,title,owner_id,is_private,max_members,start_date,end_date,created_at';
  const [ownedResult, memberResult, privateVisibleResult] = await Promise.all([
    client.from('buddy_reads').select(readColumns).eq('owner_id', userId).order('created_at', { ascending: false }),
    // O filtro é sempre o titular; a policy decide quais relações de membership são visíveis.
    client.from('buddy_read_members').select('buddy_read_id,joined_at').eq('user_id', userId),
    // A policy corrigida de buddy_reads autoriza apenas dono ou membro em leituras privadas.
    client.from('buddy_reads').select(readColumns).eq('is_private', true).order('created_at', { ascending: false }),
  ]);

  if (ownedResult.error || memberResult.error || privateVisibleResult.error) {
    return { ...emptyData('Não foi possível carregar suas leituras compartilhadas. Tente novamente em instantes.'), userId };
  }

  const ownedReads = (ownedResult.data ?? []) as BuddyRead[];
  const members = (memberResult.data ?? []) as BuddyMember[];
  const memberByRead = new Map(members.map((member) => [member.buddy_read_id, member]));
  const memberReadIds = [...new Set(members.map((member) => member.buddy_read_id))];
  const privateVisibleReads = (privateVisibleResult.data ?? []) as BuddyRead[];

  let publicMemberReads: BuddyRead[] = [];
  if (memberReadIds.length) {
    const memberReadsResult = await client.from('buddy_reads').select(readColumns).in('id', memberReadIds).order('created_at', { ascending: false });
    if (memberReadsResult.error) return { ...emptyData('Não foi possível carregar os grupos dos quais você participa.'), userId };
    publicMemberReads = (memberReadsResult.data ?? []) as BuddyRead[];
  }

  const uniqueReads = new Map<string, BuddyRead>();
  for (const read of [...ownedReads, ...privateVisibleReads, ...publicMemberReads]) uniqueReads.set(read.id, read);
  const reads = [...uniqueReads.values()].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  if (!reads.length) return { userId, reads: [], books: new Map(), error: null };

  const readIds = reads.map((read) => read.id);
  const checkpointsResult = await client
    .from('buddy_read_checkpoints')
    .select('id,buddy_read_id,position,title,page_from,page_to,percent_from,percent_to,target_date')
    .in('buddy_read_id', readIds)
    .order('position', { ascending: true });
  if (checkpointsResult.error) return { ...emptyData('As leituras carregaram, mas suas metas não puderam ser consultadas agora.'), userId };

  const checkpoints = (checkpointsResult.data ?? []) as Checkpoint[];
  const checkpointsByRead = new Map<string, Checkpoint[]>();
  for (const checkpoint of checkpoints) {
    const current = checkpointsByRead.get(checkpoint.buddy_read_id) ?? [];
    current.push(checkpoint);
    checkpointsByRead.set(checkpoint.buddy_read_id, current);
  }

  const bookIds = [...new Set(reads.map((read) => read.book_id))];
  const booksResult = await client.from('books').select('id,slug,title').in('id', bookIds);
  if (booksResult.error) return { ...emptyData('Os grupos carregaram, mas os livros não puderam ser consultados agora.'), userId };

  const views = reads.map((read): BuddyReadView => ({
    ...read,
    relation: read.owner_id === userId ? 'owner' : memberByRead.has(read.id) ? 'member' : 'authorized',
    member: memberByRead.get(read.id) ?? null,
    checkpoints: checkpointsByRead.get(read.id) ?? [],
  }));

  return {
    userId,
    reads: views,
    books: new Map(((booksResult.data ?? []) as Book[]).map((book) => [book.id, book])),
    error: null,
  };
}

function checkpointTarget(checkpoint: Checkpoint): string[] {
  const target: string[] = [];
  if (checkpoint.page_from !== null || checkpoint.page_to !== null) {
    if (checkpoint.page_from !== null && checkpoint.page_to !== null) target.push(`páginas ${checkpoint.page_from}–${checkpoint.page_to}`);
    else if (checkpoint.page_from !== null) target.push(`a partir da página ${checkpoint.page_from}`);
    else if (checkpoint.page_to !== null) target.push(`até a página ${checkpoint.page_to}`);
  }
  if (checkpoint.percent_from !== null || checkpoint.percent_to !== null) {
    if (checkpoint.percent_from !== null && checkpoint.percent_to !== null) target.push(`${checkpoint.percent_from}%–${checkpoint.percent_to}% do livro`);
    else if (checkpoint.percent_from !== null) target.push(`a partir de ${checkpoint.percent_from}% do livro`);
    else if (checkpoint.percent_to !== null) target.push(`até ${checkpoint.percent_to}% do livro`);
  }
  const date = formatDate(checkpoint.target_date);
  if (date) target.push(`até ${date}`);
  return target;
}

function relationLabel(relation: BuddyReadView['relation']): string {
  if (relation === 'owner') return 'Você organiza';
  if (relation === 'member') return 'Você participa';
  return 'Acesso autorizado';
}

function SharedReadCard({ read, book }: { read: BuddyReadView; book: Book | undefined }) {
  const headingId = `buddy-read-${read.id}`;
  const range = dateRange(read);
  return (
    <article className="member-card" aria-labelledby={headingId}>
      <div className="section-head" style={{ alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <span className="eyebrow">{relationLabel(read.relation)}</span>
          <h2 id={headingId}>{read.title || book?.title || 'Leitura compartilhada'}</h2>
        </div>
        <span className="status-pill neutral">{read.is_private ? 'Privada' : 'Aberta'}</span>
      </div>
      {book ? <p><Link className="text-link" href={`/livros/${encodeURIComponent(book.slug)}`}>{book.title}</Link></p> : <p className="notice">O título do livro não está disponível para esta sessão.</p>}
      <p className="field-hint">
        Até {read.max_members} leitores
        {range ? ` · ${range}` : ''}
        {read.is_private ? ' · acesso protegido por autorização' : ''}
      </p>
      <section aria-labelledby={`${headingId}-checkpoints`} style={{ marginTop: 22 }}>
        <div className="section-head" style={{ marginBottom: 12 }}>
          <h3 id={`${headingId}-checkpoints`} style={{ font: '500 17px var(--font-serif)' }}>Metas de leitura</h3>
          <span className="field-hint">{read.checkpoints.length} {read.checkpoints.length === 1 ? 'checkpoint' : 'checkpoints'}</span>
        </div>
        {read.checkpoints.length ? (
          <ol className="timeline" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {read.checkpoints.map((checkpoint) => {
              const targets = checkpointTarget(checkpoint);
              return <li className="timeline-row" style={{ alignItems: 'flex-start' }} key={checkpoint.id}><div><span className="eyebrow">Etapa {checkpoint.position}</span><h3>{checkpoint.title}</h3>{targets.length ? <p>{targets.join(' · ')}</p> : <p>Meta definida pelo grupo.</p>}</div></li>;
            })}
          </ol>
        ) : <div className="notice">Este grupo ainda não tem checkpoints publicados.</div>}
      </section>
    </article>
  );
}

export default async function SharedReadsPage({
  searchParams,
}: {
  searchParams?: Promise<{ livro?: string }>;
}) {
  const query = searchParams ? await searchParams : {};
  const data = await loadSharedReadsPage();
  const rawLivro = query?.livro ? String(query.livro).trim() : null;
  const isUuid = Boolean(rawLivro && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawLivro));
  const targetBookId = isUuid ? rawLivro : null;

  const destination = targetBookId
    ? `/leituras-compartilhadas?livro=${encodeURIComponent(targetBookId)}`
    : '/leituras-compartilhadas';
  const redirect = encodeURIComponent(destination);

  let targetBook: { id: string; title: string; slug: string } | null = null;
  if (targetBookId) {
    try {
      const client = await createServerSupabase();
      const { data: b } = await client.from('books').select('id,title,slug').eq('id', targetBookId).maybeSingle();
      if (b) targetBook = b;
    } catch {
      // non-blocking
    }
  }

  return (
    <section className="container">
      <header className="page-intro">
        <span className="eyebrow">Leitura em companhia</span>
        <h1>Ler junto,<br /><em style={{ color: 'var(--color-primary)' }}>sem pressa.</em></h1>
        <p>Acompanhe grupos autorizados, metas e checkpoints sem perder o seu ritmo de leitura.</p>
        <div style={{ marginTop: '12px' }}>
          <Link href="/notificacoes" className="text-link">
            Ver notificações e convites recebidos →
          </Link>
        </div>
      </header>

      {targetBook && (
        <div className="member-card" style={{ marginBottom: '24px', background: 'var(--surface-2)' }}>
          <span className="eyebrow">Compartilhar leitura</span>
          <h2>Convidar amigo para ler {targetBook.title}</h2>
          <p>Convide outros leitores por e-mail para acompanhar o clube e os debates deste livro com você.</p>
          {data.userId ? (
            <BookInviteForm bookId={targetBook.id} bookTitle={targetBook.title} />
          ) : (
            <p className="field-hint" style={{ marginTop: '12px' }}>
              <Link href={`/entrar?redirect=${redirect}`} className="text-link">
                Faça login
              </Link>{' '}
              para enviar convites diretos por e-mail.
            </p>
          )}
          <div style={{ marginTop: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <Link className="button button-dark button-small" href={`/livros/${targetBook.slug}`}>
              Ver ficha do livro
            </Link>
            <Link className="button button-quiet button-small" href="/notificacoes">
              Acompanhar status de convites
            </Link>
          </div>
        </div>
      )}

      {!data.userId ? (
        <div className="member-card" role={data.error ? 'alert' : undefined}>
          <h2>{data.error ? 'Não foi possível carregar seus grupos' : 'Entre para ver suas leituras compartilhadas'}</h2>
          <p>{data.error ?? 'Faça login para consultar apenas os grupos próprios ou compartilhados com sua conta.'}</p>
          <div className="empty-actions"><Link className="button button-dark button-small" href={`/entrar?redirect=${redirect}`}>Entrar na comunidade</Link></div>
        </div>
      ) : data.error && !data.reads.length ? (
        <div className="member-card" role="alert">
          <h2>Não foi possível carregar suas leituras</h2>
          <p>{data.error}</p>
          <div className="empty-actions"><Link className="button button-dark button-small" href="/leituras-compartilhadas">Tentar novamente</Link></div>
        </div>
      ) : data.reads.length ? (
        <section aria-labelledby="shared-reads-heading" className="section" style={{ paddingTop: 10 }}>
          <div className="section-head"><div><span className="eyebrow">Acesso autorizado</span><h2 id="shared-reads-heading">Suas leituras em grupo</h2></div></div>
          <div className="timeline">{data.reads.map((read) => <SharedReadCard key={read.id} read={read} book={data.books.get(read.book_id)} />)}</div>
        </section>
      ) : (
        <div className="empty-state">
          <div className="empty-state-mark" aria-hidden="true">◎</div>
          <h2>Nenhuma leitura compartilhada ainda</h2>
          <p>Quando você organizar ou receber acesso a uma leitura em grupo, os checkpoints aparecerão aqui.</p>
          <div className="empty-actions">
            <Link className="button button-dark button-small" href="/livros">Explorar livros</Link>
            <Link className="button button-quiet button-small" href="/clubes">Conhecer clubes</Link>
          </div>
        </div>
      )}
    </section>
  );
}
