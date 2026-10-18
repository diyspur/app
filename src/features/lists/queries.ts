import { createServerSupabase } from '@/lib/supabase/clients';

export type UserEditableList = {
  id: string;
  slug: string;
  title: string;
  isOwner?: boolean;
};

export type ListCollaborator = {
  userId: string;
  canEdit: boolean;
  addedAt: string;
  username: string | null;
  displayName: string | null;
};

export async function getUserEditableLists(userId: string): Promise<UserEditableList[]> {
  const client = await createServerSupabase();

  const [ownedResult, collabResult] = await Promise.all([
    client
      .from('reading_lists')
      .select('id,slug,title')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false })
      .limit(50),
    client
      .from('reading_list_collaborators')
      .select('list_id, can_edit')
      .eq('user_id', userId)
      .eq('can_edit', true),
  ]);

  const owned = (ownedResult.data ?? []).map((l) => ({ ...l, isOwner: true })) as UserEditableList[];
  const collabListIds = (collabResult.data ?? []).map((c) => c.list_id).filter((id) => !owned.some((l) => l.id === id));

  if (!collabListIds.length) return owned;

  const { data: sharedLists } = await client
    .from('reading_lists')
    .select('id,slug,title')
    .in('id', collabListIds)
    .order('created_at', { ascending: false });

  const shared = (sharedLists ?? []).map((l) => ({ ...l, isOwner: false })) as UserEditableList[];
  return [...owned, ...shared];
}

type CollaboratorDbRow = {
  user_id: string;
  can_edit: boolean;
  added_at: string;
  profiles: { id: string; username: string | null; display_name: string | null } | { id: string; username: string | null; display_name: string | null }[] | null;
};

type ListItemDbRow = {
  id: string;
  position: number;
  book_id: string | null;
  book: { id: string; title: string; slug: string; cover_url: string | null; total_pages: number | null } | { id: string; title: string; slug: string; cover_url: string | null; total_pages: number | null }[] | null;
};

export async function getListCollaborators(listId: string): Promise<ListCollaborator[]> {
  const client = await createServerSupabase();
  const { data, error } = await client
    .from('reading_list_collaborators')
    .select('user_id, can_edit, added_at, profiles(id, username, display_name)')
    .eq('list_id', listId)
    .order('added_at', { ascending: true });

  if (error || !data) return [];
  const rows = data as unknown as CollaboratorDbRow[];
  return rows.map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      userId: row.user_id,
      canEdit: row.can_edit,
      addedAt: row.added_at,
      username: profile?.username ?? null,
      displayName: profile?.display_name ?? null,
    };
  });
}

export async function getReadingListBySlug(slug: string) {
  const client = await createServerSupabase();
  const { data: list, error } = await client
    .from('reading_lists')
    .select('id,slug,title,description,visibility,is_collaborative,owner_id,version,created_at')
    .eq('slug', slug)
    .maybeSingle();

  if (error || !list) return null;

  const [itemsResult, collabs] = await Promise.all([
    client
      .from('reading_list_items')
      .select('id,position,book_id,book:books(id,title,slug,cover_url,total_pages)')
      .eq('list_id', list.id)
      .is('archived_at', null)
      .order('position', { ascending: true }),
    getListCollaborators(list.id),
  ]);

  const itemRows = (itemsResult.data ?? []) as unknown as ListItemDbRow[];

  return {
    ...list,
    collaborators: collabs,
    items: itemRows.map((it) => ({
      id: it.id,
      position: it.position,
      book_id: it.book_id,
      book: Array.isArray(it.book) ? it.book[0] : it.book,
    })),
  };
}
