import { createServerSupabase } from '@/lib/supabase/clients';
import { type QueryResult, querySuccess, queryFailure } from '@/lib/queries/result';

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

export async function getUserUpNextResult(userId: string): Promise<QueryResult<UpNextItem[]>> {
  if (!userId) {
    return queryFailure('unauthenticated', 'Faça login para ver sua fila de leitura.');
  }

  try {
    const client = await createServerSupabase();
    const { data, error } = await client
      .from('user_up_next')
      .select('book_id,position,added_at,book:books(id,title,slug,cover_url,total_pages,synopsis)')
      .eq('user_id', userId)
      .order('position', { ascending: true });

    if (error) {
      console.error('Error fetching user up next items', error);
      return queryFailure('unavailable', 'Não foi possível carregar sua fila de leitura no momento.');
    }

    const items = ((data as unknown as Array<{
      book_id: string;
      position: number;
      added_at: string;
      book: UpNextItem['book'] | UpNextItem['book'][];
    }>) ?? []).map((item) => ({
      book_id: item.book_id,
      position: item.position,
      added_at: item.added_at,
      book: Array.isArray(item.book) ? (item.book[0] ?? null) : (item.book ?? null),
    }));

    return querySuccess(items);
  } catch (err) {
    console.error('Unexpected error in getUserUpNextResult', err);
    return queryFailure('unavailable', 'Não foi possível carregar sua fila de leitura no momento.');
  }
}

export async function getUserUpNext(userId: string): Promise<UpNextItem[]> {
  const result = await getUserUpNextResult(userId);
  return result.ok ? result.data : [];
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
