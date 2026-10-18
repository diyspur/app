import { createServerSupabase } from '@/lib/supabase/clients';

export type UpNextItem = {
  book_id: string;
  position: number;
  added_at: string;
  book: {
    id: string;
    title: string;
    slug: string;
    cover_url: string | null;
    total_pages: number | null;
    synopsis: string | null;
  } | null;
};

export async function getUserUpNext(userId: string): Promise<UpNextItem[]> {
  const client = await createServerSupabase();
  const { data, error } = await client
    .from('user_up_next')
    .select('book_id,position,added_at,book:books(id,title,slug,cover_url,total_pages,synopsis)')
    .eq('user_id', userId)
    .order('position', { ascending: true });

  if (error || !data) return [];
  return (data as unknown as Array<{
    book_id: string;
    position: number;
    added_at: string;
    book: UpNextItem['book'] | UpNextItem['book'][];
  }>).map((item) => ({
    book_id: item.book_id,
    position: item.position,
    added_at: item.added_at,
    book: Array.isArray(item.book) ? (item.book[0] ?? null) : (item.book ?? null),
  }));
}

export async function isBookInUserUpNext(userId: string, bookId: string): Promise<boolean> {
  const client = await createServerSupabase();
  const { data, error } = await client
    .from('user_up_next')
    .select('book_id')
    .eq('user_id', userId)
    .eq('book_id', bookId)
    .maybeSingle();

  return !error && Boolean(data);
}
