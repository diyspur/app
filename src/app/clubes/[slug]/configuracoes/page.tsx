import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ClubManagement } from '@/components/clubs/club-management';
import { buildClubHref } from '@/lib/community-navigation';
import { createServerSupabase } from '@/lib/supabase/clients';

export const dynamic = 'force-dynamic';

type Params = Promise<{ slug: string }>;

export const metadata: Metadata = {
  title: 'Configurações do Clube',
  robots: { index: false, follow: false },
};

export default async function ClubSettingsPage({ params }: { params: Params }) {
  const { slug } = await params;
  const supabase = await createServerSupabase();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub ?? null;

  if (!userId) {
    redirect(`/entrar?redirect=${encodeURIComponent(`/clubes/${slug}/configuracoes`)}`);
  }

  const { data: club } = await supabase
    .from('user_clubs')
    .select('id,slug,name,description,is_private,kind,owner_id,version,current_season_id')
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

  const [{ data: rawMembers }, { data: rawInvitations }, { data: seasons }] = await Promise.all([
    supabase
      .from('user_club_members')
      .select('user_id,role,joined_at')
      .eq('club_id', club.id)
      .order('joined_at', { ascending: true }),
    supabase
      .from('user_club_invitations')
      .select('id,invited_user_id,expires_at')
      .eq('club_id', club.id)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString()),
    supabase.from('seasons').select('id,title,slug').order('number', { ascending: false }),
  ]);

  const profileIds = Array.from(
    new Set([
      ...(rawMembers ?? []).map((m) => m.user_id),
      ...(rawInvitations ?? []).map((i) => i.invited_user_id),
    ]),
  );

  const profileMap = new Map<string, { displayName: string | null; username: string | null }>();
  if (profileIds.length > 0) {
    const { data: profiles } = await supabase
      .from('v_profiles_public')
      .select('id,display_name,username')
      .in('id', profileIds);
    for (const p of profiles ?? []) {
      if (p.id) {
        profileMap.set(p.id, { displayName: p.display_name, username: p.username });
      }
    }
  }

  const members = (rawMembers ?? []).map((m) => ({
    ...m,
    displayName: profileMap.get(m.user_id)?.displayName ?? null,
    username: profileMap.get(m.user_id)?.username ?? null,
  }));

  const invitations = (rawInvitations ?? []).map((inv) => ({
    ...inv,
    displayName: profileMap.get(inv.invited_user_id)?.displayName ?? null,
    username: profileMap.get(inv.invited_user_id)?.username ?? null,
  }));

  return (
    <div className="container section">
      <div style={{ marginBottom: '1.25rem' }}>
        <Link href={buildClubHref(club.slug)} className="text-link">
          ← Voltar para {club.name}
        </Link>
      </div>
      <header className="page-intro">
        <span className="eyebrow">Gestão do clube</span>
        <h1>Configurações de {club.name}</h1>
      </header>
      <ClubManagement
        club={club}
        members={members}
        invitations={invitations}
        seasons={seasons ?? []}
      />
    </div>
  );
}
