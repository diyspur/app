import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase/clients';

export type JournalEntry = {
  id: string;
  book_id: string;
  entry_date: string;
  title: string | null;
  body: string;
  page_from: number | null;
  page_to: number | null;
  percent_at: number | null;
  minutes_read: number | null;
  is_spoiler: boolean;
  archived_at: string | null;
  version: number;
};

const cursorSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  id: z.string().uuid(),
}).strict();

function encodeCursor(date: string, id: string): string {
  return Buffer.from(JSON.stringify({ date, id })).toString('base64url');
}

function decodeCursor(value?: string) {
  if (!value) return null;
  try {
    const parsed = cursorSchema.safeParse(
      JSON.parse(Buffer.from(value, 'base64url').toString('utf8')),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function getJournalEntries(
  userId: string,
  encodedCursor?: string,
  limit = 20,
  archivedOnly = false,
) {
  const client = await createServerSupabase();
  const cursor = decodeCursor(encodedCursor);
  if (encodedCursor && !cursor) {
    return { data: null, error: { code: 'invalid_cursor', message: 'Cursor inválido' }, nextCursor: null };
  }
  const pageSize = Math.min(Math.max(Math.trunc(limit), 1), 50);
  let query = client
    .from('reading_journal_entries')
    .select('id,book_id,entry_date,title,body,page_from,page_to,percent_at,minutes_read,is_spoiler,archived_at,version')
    .eq('user_id', userId);

  if (archivedOnly) {
    query = query.not('archived_at', 'is', null);
  } else {
    query = query.is('archived_at', null);
  }

  query = query
    .order('entry_date', { ascending: false })
    .order('id', { ascending: false })
    .limit(pageSize + 1);

  if (cursor) {
    query = query.or(
      `entry_date.lt.${cursor.date},and(entry_date.eq.${cursor.date},id.lt.${cursor.id})`,
    );
  }
  const { data, error } = await query;
  if (error) return { data: null, error, nextCursor: null };
  const rows = (data ?? []) as JournalEntry[];
  const page = rows.slice(0, pageSize);
  const tail = page.at(-1);
  return {
    data: page,
    error: null,
    nextCursor: rows.length > pageSize && tail
      ? encodeCursor(tail.entry_date, tail.id)
      : null,
  };
}

export async function getBooksByIds(
  bookIds: string[],
  // Structural type on purpose: tests inject a minimal mock exposing only .from().
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  customClient?: { from: (table: string) => any },
): Promise<{ id: string; title: string }[]> {
  const uniqueIds = Array.from(new Set(bookIds.filter(Boolean)));
  if (uniqueIds.length === 0) return [];

  const supabase = customClient ?? (await createServerSupabase());
  const { data, error } = await supabase
    .from('books')
    .select('id,title')
    .in('id', uniqueIds);

  if (error || !data) return [];
  return data as { id: string; title: string }[];
}

