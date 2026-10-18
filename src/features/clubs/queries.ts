import { createServerSupabase } from '@/lib/supabase/clients';

type Club = {
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
type Member = { user_id: string; role: string; joined_at: string };

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

export async function getVisibleClubs() {
  const client = await createServerSupabase();
  const { data: claims } = await client.auth.getClaims();
  const userId = typeof claims?.claims?.sub === 'string' ? claims.claims.sub : null;

  const { data, error } = await client
    .from('user_clubs')
    .select('id,owner_id,name,slug,description,is_private,version,archived_at,created_at')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(24);

  return { userId, clubs: (data ?? []) as Club[], error: error?.message ?? null };
}
