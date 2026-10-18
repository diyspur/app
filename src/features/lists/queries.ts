import { createServerSupabase } from '@/lib/supabase/clients';

export type UserEditableList = {
  id: string;
  slug: string;
  title: string;
};

export async function getUserEditableLists(userId: string): Promise<UserEditableList[]> {
  const client = await createServerSupabase();

  const { data, error } = await client
    .from('reading_lists')
    .select('id,slug,title')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !data) return [];
  return data as UserEditableList[];
}

export async function getReadingListBySlug(slug: string) {
  const client = await createServerSupabase();
  const { data: list, error } = await client
    .from('reading_lists')
    .select('id,slug,title,description,visibility,is_collaborative,owner_id,created_at')
    .eq('slug', slug)
    .maybeSingle();

  if (error || !list) return null;

  const { data: items } = await client
    .from('reading_list_items')
    .select('id,position,book_id,book:books(id,title,slug,cover_url,total_pages)')
    .eq('list_id', list.id)
    .is('deleted_at', null)
    .order('position', { ascending: true });

  return {
    ...list,
    items: (items ?? []).map((it) => ({
      id: it.id,
      position: it.position,
      book_id: it.book_id,
      book: Array.isArray(it.book) ? it.book[0] : it.book,
    })),
  };
}
