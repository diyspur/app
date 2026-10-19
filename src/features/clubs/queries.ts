import { createServerSupabase } from '@/lib/supabase/clients';

export type Club = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string | null;
  is_private: boolean;
  kind?: string;
  official_book_id?: string | null;
  version: number;
  archived_at: string | null;
  created_at: string;
  current_book_id?: string | null;
  current_season_id?: string | null;
};
export type ClubSummary = Club;
type Member = { user_id: string; role: string; joined_at: string };

export function decodeClubCursor(cursor: string): { createdAt: string; id: string } | null {
  if (!cursor || typeof cursor !== 'string') return null;
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.createdAt === 'string' && typeof parsed.id === 'string') {
      return parsed;
    }
  } catch {
    // try fallback
  }
  try {
    const raw = Buffer.from(cursor, 'base64').toString('utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.createdAt === 'string' && typeof parsed.id === 'string') {
      return parsed;
    }
  } catch {
    // try delimiter
  }
  const hashIdx = cursor.lastIndexOf('#');
  if (hashIdx > 0) {
    const createdAt = cursor.slice(0, hashIdx);
    const id = cursor.slice(hashIdx + 1);
    if (createdAt && id) return { createdAt, id };
  }
  return null;
}

export function encodeClubCursor(item: { created_at: string; id: string }): string {
  return Buffer.from(JSON.stringify({ createdAt: item.created_at, id: item.id })).toString('base64url');
}

export async function getClubPage(slug: string) {
  const client = await createServerSupabase();
  const { data: claims } = await client.auth.getClaims();
  const userId = typeof claims?.claims?.sub === 'string' ? claims.claims.sub : null;

  const { data: club, error } = await client
    .from('user_clubs')
    .select('id,owner_id,name,slug,description,is_private,kind,official_book_id,version,archived_at,created_at,current_book_id,current_season_id')
    .eq('slug', slug)
    .maybeSingle();

  if (error || !club || (club.archived_at && club.owner_id !== userId)) return { userId, club: null, members: [] as Member[], isMember: false };
  const [{ data: members }, ownMembership, memberCount] = await Promise.all([
    client.from('user_club_members').select('user_id,role,joined_at').eq('club_id', club.id).order('joined_at', { ascending: true }).limit(100),
    userId ? client.from('user_club_members').select('user_id,role').eq('club_id', club.id).eq('user_id', userId).maybeSingle() : Promise.resolve({ data: null }),
    client.from('user_club_members').select('*', { count: 'exact', head: true }).eq('club_id', club.id),
  ]);
  return { userId, club: club as Club, members: (members ?? []) as Member[], totalMembers: memberCount.count ?? 0, isMember: Boolean(ownMembership.data) };
}

export async function getVisibleClubsPaginated(options?: {
  search?: string;
  cursor?: string;
  limit?: number;
}): Promise<{
  clubs: ClubSummary[];
  nextCursor: string | null;
  userId?: string | null;
  error?: string | null;
}> {
  const client = await createServerSupabase();
  const { data: claims } = await client.auth.getClaims();
  const userId = typeof claims?.claims?.sub === 'string' ? claims.claims.sub : null;

  const limit = options?.limit && options.limit > 0 ? options.limit : 24;

  let query = client
    .from('user_clubs')
    .select('id,owner_id,name,slug,description,is_private,kind,official_book_id,version,archived_at,created_at')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);

  const term = options?.search?.trim().replace(/[%,()]/g, '');
  if (term) {
    query = query.ilike('name', `%${term}%`);
  }

  if (options?.cursor) {
    const decoded = decodeClubCursor(options.cursor);
    if (decoded) {
      query = query.or(
        `created_at.lt.${decoded.createdAt},and(created_at.eq.${decoded.createdAt},id.lt.${decoded.id})`,
      );
    }
  }

  const { data, error } = await query;
  if (error) {
    return {
      clubs: [],
      nextCursor: null,
      userId,
      error: error.message,
    };
  }

  const rows = (data ?? []) as ClubSummary[];
  const hasMore = rows.length > limit;
  const clubs = hasMore ? rows.slice(0, limit) : rows;
  const lastItem = clubs[clubs.length - 1];
  const nextCursor = hasMore && lastItem ? encodeClubCursor(lastItem) : null;

  return {
    clubs,
    nextCursor,
    userId,
    error: null,
  };
}

export async function getVisibleClubs() {
  const result = await getVisibleClubsPaginated({ limit: 24 });
  return {
    userId: result.userId ?? null,
    clubs: result.clubs,
    error: result.error ?? null,
  };
}
