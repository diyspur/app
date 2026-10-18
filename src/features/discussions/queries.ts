import 'server-only';

import { createServerSupabase } from '@/lib/supabase/clients';
import type {
  ChannelKind,
  ChannelPreferenceMode,
  ChannelPromptView,
  ChannelWorkspaceData,
  ClubChannelDirectoryEntry,
  ClubMemberRole,
  ClubMessageView,
  SpoilerPolicy,
} from './types';

import { channelAccessReasonSchema } from './access';

function mapDirectoryRow(row: {
  id: string;
  slug: string;
  kind: string;
  display_name: string;
  chapter_id: string | null;
  chapter_number: number | null;
  season_number: number | null;
  spoiler_policy: string;
  rules_version: number;
  can_read: boolean;
  has_consent: boolean;
  access_reason: string;
}): ClubChannelDirectoryEntry {
  const parsedReason = channelAccessReasonSchema.safeParse(row.access_reason);
  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind as ChannelKind,
    displayName: row.display_name,
    chapterId: row.chapter_id,
    chapterNumber: row.chapter_number,
    seasonNumber: row.season_number,
    spoilerPolicy: row.spoiler_policy as SpoilerPolicy,
    rulesVersion: row.rules_version,
    canRead: row.can_read,
    hasConsent: row.has_consent,
    accessReason: parsedReason.success ? parsedReason.data : 'unauthenticated',
  };
}

export async function getClubChannelDirectory(
  clubId: string,
): Promise<ClubChannelDirectoryEntry[]> {
  try {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase.rpc('get_club_channel_directory', {
      p_club: clubId,
    });
    if (error || !data) return [];
    return data.map(mapDirectoryRow);
  } catch {
    return [];
  }
}

export async function getChannelWorkspaceData(params: {
  clubSlug: string;
  channelSlug: string;
  focusMessageId?: string | null;
}): Promise<ChannelWorkspaceData | null> {
  try {
    const supabase = await createServerSupabase();
    const { data: claimsData } = await supabase.auth.getClaims();
    const viewerId = claimsData?.claims?.sub ?? null;

    const { data: clubRow } = await supabase
      .from('user_clubs')
      .select(
        'id,slug,name,description,kind,is_private,official_book_id,current_book_id,current_season_id,owner_id,version',
      )
      .eq('slug', params.clubSlug)
      .is('archived_at', null)
      .maybeSingle();

    if (!clubRow) return null;

    const targetBookId = clubRow.official_book_id ?? clubRow.current_book_id;

    const [
      { data: directoryRows },
      { data: bookRow },
      { data: memberRow },
      { data: isAdminData },
    ] = await Promise.all([
      supabase.rpc('get_club_channel_directory', { p_club: clubRow.id }),
      targetBookId
        ? supabase.from('books').select('id,slug,title').eq('id', targetBookId).maybeSingle()
        : Promise.resolve({ data: null }),
      viewerId
        ? supabase
            .from('user_club_members')
            .select('role')
            .eq('club_id', clubRow.id)
            .eq('user_id', viewerId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      viewerId ? supabase.rpc('is_admin') : Promise.resolve({ data: false }),
    ]);

    const channels: ClubChannelDirectoryEntry[] = (directoryRows ?? []).map(mapDirectoryRow);
    const activeChannel = channels.find((c: ClubChannelDirectoryEntry) => c.slug === params.channelSlug);
    if (!activeChannel) return null;

    let preferenceMode: ChannelPreferenceMode = 'mentions';
    let prompts: ChannelPromptView[] = [];
    let messages: ClubMessageView[] = [];

    if (viewerId) {
      const { data: prefRow } = await supabase
        .from('club_channel_preferences')
        .select('mode')
        .eq('channel_id', activeChannel.id)
        .eq('user_id', viewerId)
        .maybeSingle();

      if (
        prefRow?.mode === 'muted' ||
        prefRow?.mode === 'mentions' ||
        prefRow?.mode === 'following'
      ) {
        preferenceMode = prefRow.mode;
      }
    }

    if (activeChannel.canRead) {
      const [{ data: promptRows }, { data: rawMessages }] = await Promise.all([
        supabase
          .from('club_channel_prompts')
          .select('id,body,position,published_at')
          .eq('channel_id', activeChannel.id)
          .order('position', { ascending: true }),
        params.focusMessageId
          ? supabase.rpc('get_club_message_context', {
              p_message: params.focusMessageId,
              p_window: 20,
            })
          : supabase.rpc('list_club_messages', {
              p_channel: activeChannel.id,
              p_limit: 50,
            }),
      ]);

      prompts = (promptRows ?? []).map((p) => ({
        id: p.id,
        body: p.body,
        position: p.position,
        publishedAt: p.published_at,
      }));

      const messageRows = rawMessages ?? [];
      // If list_club_messages returned newest-first, sort ascending for chronological reading
      const ordered = [...messageRows].sort((a, b) => {
        const cmp = a.created_at.localeCompare(b.created_at);
        return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
      });

      const authorIds = Array.from(
        new Set(ordered.map((m) => m.author_id).filter((id): id is string => Boolean(id))),
      );

      const profilesMap = new Map<
        string,
        { displayName: string; username: string | null; avatarUrl: string | null }
      >();

      if (authorIds.length > 0) {
        const { data: profileRows } = await supabase
          .from('v_profiles_public')
          .select('id,display_name,username,avatar_url')
          .in('id', authorIds);

        for (const prof of profileRows ?? []) {
          if (prof.id) {
            profilesMap.set(prof.id, {
              displayName: prof.display_name ?? prof.username ?? 'Leitor(a)',
              username: prof.username,
              avatarUrl: prof.avatar_url,
            });
          }
        }
      }

      messages = ordered.map((m) => {
        const author = m.author_id ? profilesMap.get(m.author_id) : undefined;
        return {
          id: m.id,
          channelId: m.channel_id,
          authorId: m.author_id,
          authorName: author?.displayName ?? 'Leitor(a) da comunidade',
          authorUsername: author?.username ?? null,
          authorAvatarUrl: author?.avatarUrl ?? null,
          content: m.content,
          replyToId: m.reply_to_id,
          videoSec: m.video_sec,
          version: m.version,
          createdAt: m.created_at,
          editedAt: m.edited_at,
        };
      });
    }

    const viewerRole =
      memberRow?.role === 'owner' || memberRow?.role === 'moderator' || memberRow?.role === 'member'
        ? (memberRow.role as ClubMemberRole)
        : null;

    return {
      club: {
        id: clubRow.id,
        slug: clubRow.slug,
        name: clubRow.name,
        description: clubRow.description,
        kind: clubRow.kind === 'official' ? 'official' : 'custom',
        isPrivate: clubRow.is_private,
        officialBookId: clubRow.official_book_id,
        currentBookId: clubRow.current_book_id,
        currentSeasonId: clubRow.current_season_id,
        ownerId: clubRow.owner_id,
        version: clubRow.version,
      },
      book: bookRow
        ? { id: bookRow.id, slug: bookRow.slug, title: bookRow.title }
        : null,
      channels,
      activeChannel,
      messages,
      prompts,
      preferenceMode,
      viewerId,
      viewerRole,
      isViewerAdmin: Boolean(isAdminData),
    };
  } catch {
    return null;
  }
}

export async function getOfficialBookCommunitySnapshot(bookId: string): Promise<{
  officialClub: { id: string; slug: string; name: string; memberCount: number } | null;
  channelsCount: number;
  upcomingMeetings: {
    id: string;
    title: string;
    scheduledAt: string;
    kind: string;
    chapterId: string | null;
  }[];
}> {
  try {
    const supabase = await createServerSupabase();
    const [{ data: clubRow }, { data: meetings }] = await Promise.all([
      supabase
        .from('user_clubs')
        .select('id,slug,name')
        .eq('official_book_id', bookId)
        .eq('kind', 'official')
        .is('archived_at', null)
        .maybeSingle(),
      supabase
        .from('meetings')
        .select('id,title,scheduled_at,kind,chapter_id')
        .eq('book_id', bookId)
        .neq('status', 'cancelled')
        .gte('scheduled_at', new Date(Date.now() - 2 * 3600 * 1000).toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(4),
    ]);

    let memberCount = 0;
    let channelsCount = 0;

    if (clubRow) {
      const [{ count: members }, { count: channels }] = await Promise.all([
        supabase
          .from('user_club_members')
          .select('user_id', { count: 'exact', head: true })
          .eq('club_id', clubRow.id),
        supabase
          .from('club_channels')
          .select('id', { count: 'exact', head: true })
          .eq('club_id', clubRow.id)
          .is('archived_at', null),
      ]);
      memberCount = members ?? 0;
      channelsCount = channels ?? 0;
    }

    return {
      officialClub: clubRow
        ? {
            id: clubRow.id,
            slug: clubRow.slug,
            name: clubRow.name,
            memberCount,
          }
        : null,
      channelsCount,
      upcomingMeetings: (meetings ?? []).map((m) => ({
        id: m.id,
        title: m.title,
        scheduledAt: m.scheduled_at,
        kind: m.kind,
        chapterId: m.chapter_id,
      })),
    };
  } catch {
    return { officialClub: null, channelsCount: 0, upcomingMeetings: [] };
  }
}
