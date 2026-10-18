import type { Metadata } from 'next';
import Link from 'next/link';

import { createServerSupabase } from '@/lib/supabase/clients';
import { CreateListForm } from '@/components/lists/create-list-form';
import { ListManagement, RemoveListItemButton } from '@/components/lists/list-management';

export const metadata: Metadata = {
  title: 'Listas de leitura',
  description: 'Suas listas de leitura e listas compartilhadas com você.',
  robots: { index: false, follow: false },
};

type ListVisibility = 'private' | 'unlisted' | 'public';
type ListItemKind = 'book' | 'chapter' | 'quote' | 'external';

type ReadingList = {
  id: string;
  owner_id: string;
  slug: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  visibility: ListVisibility;
  is_collaborative: boolean;
  theme: string | null;
  tags: string[] | null;
  items_count: number;
  created_at: string;
  updated_at: string;
  version: number;
};

type Collaborator = {
  list_id: string;
  can_edit: boolean;
  added_at: string;
};

type ReadingListItem = {
  id: string;
  list_id: string;
  kind: ListItemKind;
  book_id: string | null;
  chapter_id: string | null;
  external_url: string | null;
  quote_text: string | null;
  note: string | null;
  position: number;
  created_at: string;
};

type Book = { id: string; slug: string; title: string; cover_url: string | null };
type Chapter = { id: string; title: string; number: number };

type ListView = ReadingList & {
  isOwned: boolean;
  collaboration: Collaborator | null;
  items: ReadingListItem[];
};

type ListsPageData = {
  userId: string | null;
  lists: ListView[];
  books: Map<string, Book>;
  chapters: Map<string, Chapter>;
  error: string | null;
};

const emptyData = (error: string | null = null): ListsPageData => ({
  userId: null,
  lists: [],
  books: new Map(),
  chapters: new Map(),
  error,
});

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(date);
}

function visibilityLabel(visibility: ListVisibility): string {
  if (visibility === 'public') return 'Pública';
  if (visibility === 'unlisted') return 'Por link';
  return 'Privada';
}

function kindLabel(kind: ListItemKind): string {
  if (kind === 'book') return 'Livro';
  if (kind === 'chapter') return 'Capítulo';
  if (kind === 'quote') return 'Citação';
  return 'Referência';
}

function safeExternalUrl(value: string | null): string | null {
  return value && /^https:\/\//i.test(value) ? value : null;
}

async function loadListsPage(): Promise<ListsPageData> {
  let client: Awaited<ReturnType<typeof createServerSupabase>>;
  try {
    client = await createServerSupabase();
  } catch {
    return emptyData('Não foi possível conectar ao serviço de leitura agora.');
  }

  const { data: claimsData, error: claimsError } = await client.auth.getClaims();
  if (claimsError) return emptyData('Não foi possível verificar sua sessão. Tente entrar novamente.');

  const userId = typeof claimsData?.claims?.sub === 'string' ? claimsData.claims.sub : null;
  if (!userId) return { ...emptyData(), userId: null };

  const [ownedResult, collaboratorResult] = await Promise.all([
    client
      .from('reading_lists')
      .select('id,owner_id,slug,title,description,cover_url,visibility,is_collaborative,theme,tags,items_count,created_at,updated_at,version')
      .eq('owner_id', userId)
      .order('updated_at', { ascending: false }),
    client
      .from('reading_list_collaborators')
      .select('list_id,can_edit,added_at')
      .eq('user_id', userId),
  ]);

  if (ownedResult.error || collaboratorResult.error) {
    return { ...emptyData('Não foi possível carregar suas listas. Tente novamente em instantes.'), userId };
  }

  const ownedLists = (ownedResult.data ?? []) as ReadingList[];
  const collaborators = (collaboratorResult.data ?? []) as Collaborator[];
  const collaboratorByList = new Map(collaborators.map((row) => [row.list_id, row]));
  const collaboratorIds = collaborators.map((row) => row.list_id).filter((id) => !ownedLists.some((list) => list.id === id));

  let sharedLists: ReadingList[] = [];
  if (collaboratorIds.length) {
    const sharedResult = await client
      .from('reading_lists')
      .select('id,owner_id,slug,title,description,cover_url,visibility,is_collaborative,theme,tags,items_count,created_at,updated_at,version')
      .in('id', collaboratorIds)
      .order('updated_at', { ascending: false });
    if (sharedResult.error) return { ...emptyData('Não foi possível carregar as listas compartilhadas. Tente novamente em instantes.'), userId };
    sharedLists = (sharedResult.data ?? []) as ReadingList[];
  }

  const lists = [...ownedLists, ...sharedLists]
    .map((list) => ({
      ...list,
      isOwned: list.owner_id === userId,
      collaboration: collaboratorByList.get(list.id) ?? null,
      items: [],
    }))
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  const listIds = lists.map((list) => list.id);
  if (!listIds.length) return { userId, lists, books: new Map(), chapters: new Map(), error: null };

  const itemsResult = await client
    .from('reading_list_items')
    .select('id,list_id,kind,book_id,chapter_id,external_url,quote_text,note,position,created_at,archived_at')
    .in('list_id', listIds)
    .is('archived_at', null).order('position', { ascending: true });
  if (itemsResult.error) return { ...emptyData('Suas listas carregaram, mas os itens não puderam ser consultados agora.'), userId };

  const items = (itemsResult.data ?? []) as ReadingListItem[];
  const itemsByList = new Map<string, ReadingListItem[]>();
  for (const item of items) {
    const current = itemsByList.get(item.list_id) ?? [];
    current.push(item);
    itemsByList.set(item.list_id, current);
  }
  const listsWithItems = lists.map((list) => ({ ...list, items: itemsByList.get(list.id) ?? [] }));

  const bookIds = [...new Set(items.map((item) => item.book_id).filter((id): id is string => Boolean(id)))];
  const chapterIds = [...new Set(items.map((item) => item.chapter_id).filter((id): id is string => Boolean(id)))];
  const [booksResult, chaptersResult] = await Promise.all([
    bookIds.length
      ? client.from('books').select('id,slug,title,cover_url').in('id', bookIds)
      : Promise.resolve({ data: [], error: null }),
    chapterIds.length
      ? client.from('chapters').select('id,title,number').in('id', chapterIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const detailsError = booksResult.error || chaptersResult.error
    ? 'Alguns títulos não estão disponíveis para sua sessão.'
    : null;
  return {
    userId,
    lists: listsWithItems,
    books: new Map(((booksResult.data ?? []) as Book[]).map((book) => [book.id, book])),
    chapters: new Map(((chaptersResult.data ?? []) as Chapter[]).map((chapter) => [chapter.id, chapter])),
    error: detailsError,
  };
}

function ListItemRow({ item, books, chapters, canEdit }: { item: ReadingListItem; books: Map<string, Book>; chapters: Map<string, Chapter>; canEdit: boolean }) {
  const book = item.book_id ? books.get(item.book_id) : undefined;
  const chapter = item.chapter_id ? chapters.get(item.chapter_id) : undefined;
  const externalUrl = safeExternalUrl(item.external_url);
  const name = book?.title ?? chapter?.title ?? (item.kind === 'quote' ? 'Citação salva' : item.kind === 'external' ? 'Referência externa' : 'Item de leitura');
  const date = formatDate(item.created_at);

  return (
    <li className="timeline-row" style={{ alignItems: 'flex-start' }}>
      <div>
        <span className="eyebrow">{kindLabel(item.kind)}</span>
        <h3>
          {book ? <Link href={`/livros/${encodeURIComponent(book.slug)}`}>{book.title}</Link> : chapter ? <Link href={`/capitulos/${chapter.id}`}>{chapter.title}</Link> : name}
        </h3>
        {chapter && <p>Capítulo {chapter.number}</p>}
        {item.quote_text && <blockquote style={{ margin: '10px 0 0', color: 'var(--color-muted)' }}>“{item.quote_text}”</blockquote>}
        {item.note && <p>{item.note}</p>}
        {externalUrl && <p><a className="text-link" href={externalUrl} target="_blank" rel="noopener noreferrer">Abrir referência ↗</a></p>}
        {date && <p><time dateTime={item.created_at}>Adicionado em {date}</time></p>}
      </div>
      {canEdit && <RemoveListItemButton listId={item.list_id} itemId={item.id} />}
    </li>
  );
}

function ListCard({ list, books, chapters }: { list: ListView; books: Map<string, Book>; chapters: Map<string, Chapter> }) {
  const updated = formatDate(list.updated_at);
  const headingId = `list-${list.id}`;
  const relation = list.isOwned ? 'Sua lista' : 'Compartilhada com você';
  const itemCount = list.items.length;

  return (
    <article className="member-card" aria-labelledby={headingId}>
      <div className="section-head" style={{ alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <span className="eyebrow">{relation}</span>
          <h2 id={headingId}>{list.title}</h2>
        </div>
        <span className="status-pill neutral">{visibilityLabel(list.visibility)}</span>
      </div>
      {list.description && <p>{list.description}</p>}
      <p className="field-hint">
        {list.is_collaborative ? 'Lista colaborativa' : 'Lista pessoal'}
        {list.theme ? ` · ${list.theme}` : ''}
        {updated ? ` · Atualizada em ${updated}` : ''}
      </p>
      {list.tags && list.tags.length > 0 && <div className="detail-pills" aria-label="Temas da lista">{list.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div>}
      {list.collaboration && !list.collaboration.can_edit && <p className="notice" style={{ marginTop: 14 }}>Você tem acesso por colaboração. Esta visualização é somente leitura.</p>}
      {(list.isOwned || list.collaboration?.can_edit) && (
        <ListManagement
          listId={list.id}
          version={list.version}
          title={list.title}
          description={list.description}
          visibility={list.visibility}
          isCollaborative={list.is_collaborative}
          isOwned={list.isOwned}
          items={list.items.map((item) => ({ id: item.id, position: item.position }))}
        />
      )}
      <section aria-labelledby={`${headingId}-items`} style={{ marginTop: 22 }}>
        <div className="section-head" style={{ marginBottom: 12 }}>
          <h3 id={`${headingId}-items`} style={{ font: '500 17px var(--font-serif)' }}>Itens da lista</h3>
          <span className="field-hint">{itemCount} {itemCount === 1 ? 'item' : 'itens'}</span>
        </div>
        {list.items.length ? <ul className="timeline" style={{ listStyle: 'none', padding: 0, margin: 0 }}>{list.items.map((item) => <ListItemRow key={item.id} item={item} books={books} chapters={chapters} canEdit={list.isOwned || Boolean(list.collaboration?.can_edit)} />)}</ul> : <div className="notice">Ainda não há itens de leitura acessíveis nesta lista.</div>}
      </section>
    </article>
  );
}

export default async function ListsPage() {
  const data = await loadListsPage();
  const redirect = encodeURIComponent('/listas');

  return (
    <section className="container">
      <header className="page-intro">
        <span className="eyebrow">Seu acervo de leitura</span>
        <h1>Listas para<br /><em style={{ color: 'var(--color-primary)' }}>voltar.</em></h1>
        <p>Organize o que quer descobrir e veja as listas que leitores compartilharam com você.</p>
      </header>

      {data.userId && <CreateListForm />}

      {!data.userId ? (
        <div className="member-card" role={data.error ? 'alert' : undefined}>
          <h2>{data.error ? 'Não foi possível carregar suas listas' : 'Entre para ver suas listas'}</h2>
          <p>{data.error ?? 'Este espaço é pessoal. Faça login para consultar apenas suas listas e os acessos concedidos a você.'}</p>
          <div className="empty-actions"><Link className="button button-dark button-small" href={`/entrar?redirect=${redirect}`}>Entrar na comunidade</Link></div>
        </div>
      ) : data.error && !data.lists.length ? (
        <div className="member-card" role="alert">
          <h2>Não foi possível carregar suas listas</h2>
          <p>{data.error}</p>
          <div className="empty-actions"><Link className="button button-dark button-small" href="/listas">Tentar novamente</Link></div>
        </div>
      ) : data.lists.length ? (
        <section aria-labelledby="lists-heading" className="section" style={{ paddingTop: 10 }}>
          <div className="section-head">
            <div><span className="eyebrow">Acesso autorizado</span><h2 id="lists-heading">Suas listas</h2></div>
          </div>
          {data.error && <p className="notice" role="status" style={{ marginBottom: 16 }}>{data.error}</p>}
          <div className="timeline">{data.lists.map((list) => <ListCard key={list.id} list={list} books={data.books} chapters={data.chapters} />)}</div>
        </section>
      ) : (
        <div className="empty-state">
          <div className="empty-state-mark" aria-hidden="true">⌁</div>
          <h2>Nenhuma lista por aqui ainda</h2>
          <p>Quando uma lista sua ou compartilhada com você estiver disponível, ela aparecerá neste espaço.</p>
          <div className="empty-actions"><Link className="button button-dark button-small" href="/livros">Explorar livros</Link></div>
        </div>
      )}
    </section>
  );
}
