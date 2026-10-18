'use server';

import { revalidatePath } from 'next/cache';
import { mapDatabaseError } from '@/lib/actions/database-errors';
import { isReadOnlyPreview, READ_ONLY_PREVIEW_MESSAGE } from '@/lib/actions/read-only';
import {
  buildClubChannelHref,
  buildClubHref,
} from '@/lib/community-navigation';
import { createServerSupabase } from '@/lib/supabase/clients';
import { withTelemetryAction } from '@/lib/observability/action-wrapper';
import {
  DEFAULT_CHANNEL_SLUGS,
  type DiscussionEntryResult,
} from '@/lib/discussion-contract';
import {
  acceptChannelSpoilersSchema,
  applyClubSanctionSchema,
  blockCommunityUserSchema,
  createTopicChannelSchema,
  deleteClubMessageSchema,
  editClubMessageSchema,
  openChapterDiscussionSchema,
  openBookDiscussionSchema,
  revokeChannelSpoilersSchema,
  sendClubMessageSchema,
  setChannelPreferenceSchema,
  setClubMemberRoleSchema,
} from './schemas';
import type { ClubMessageView } from './types';

export async function openOfficialBookGroupAction(input: {
  bookId: string;
  bookSlug: string;
  destination?: 'hub' | 'safe' | 'spoilers';
}): Promise<DiscussionEntryResult> {
  const parsed = openBookDiscussionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: 'invalid_input', message: 'Livro inválido.' };
  }
  if (isReadOnlyPreview()) {
    return { ok: false, code: 'unavailable', message: READ_ONLY_PREVIEW_MESSAGE };
  }

  try {
    const client = await createServerSupabase();
    const { data: auth, error: authError } = await client.auth.getClaims();
    if (authError || !auth?.claims?.sub) {
      const returnTo = `/livros/${encodeURIComponent(parsed.data.bookSlug)}`;
      return {
        ok: false,
        code: 'unauthenticated',
        message: 'Entre para participar do grupo deste livro.',
        loginHref: `/entrar?redirect=${encodeURIComponent(returnTo)}`,
      };
    }

    const { data, error } = await client.rpc('ensure_official_book_group', {
      p_book: parsed.data.bookId,
    });
    if (error || !data?.[0]) {
      return {
        ok: false,
        code: 'unavailable',
        message: 'Não foi possível abrir o grupo agora. Tente novamente.',
      };
    }

    const row = data[0];
    revalidatePath('/clubes');
    revalidatePath('/comunidade');
    revalidatePath(`/livros/${parsed.data.bookSlug}`);
    const channelSlug =
      parsed.data.destination === 'spoilers'
        ? DEFAULT_CHANNEL_SLUGS.spoilers
        : DEFAULT_CHANNEL_SLUGS.safe;
    return {
      ok: true,
      href:
        parsed.data.destination === 'hub'
          ? buildClubHref(row.club_slug)
          : buildClubChannelHref({ clubSlug: row.club_slug, channelSlug }),
    };
  } catch {
    return { ok: false, code: 'unavailable', message: 'Grupo indisponível no momento.' };
  }
}

export async function openChapterDiscussionAction(input: {
  chapterId: string;
  videoSec?: number | null;
}): Promise<DiscussionEntryResult> {
  const parsed = openChapterDiscussionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: 'invalid_input', message: 'Capítulo inválido.' };
  }
  if (isReadOnlyPreview()) {
    return { ok: false, code: 'unavailable', message: READ_ONLY_PREVIEW_MESSAGE };
  }
  try {
    const client = await createServerSupabase();
    const { data: auth, error: authError } = await client.auth.getClaims();
    if (authError || !auth?.claims?.sub) {
      const returnTo = `/capitulos/${parsed.data.chapterId}`;
      return {
        ok: false,
        code: 'unauthenticated',
        message: 'Entre para conversar sobre este capítulo.',
        loginHref: `/entrar?redirect=${encodeURIComponent(returnTo)}`,
      };
    }
    const { data, error } = await client.rpc('ensure_chapter_discussion', {
      p_chapter: parsed.data.chapterId,
    });
    if (error || !data?.[0]) {
      const mapped = mapDatabaseError(error?.code, error?.message);
      return { ok: false, code: 'unavailable', message: mapped.message };
    }
    const row = data[0];
    revalidatePath(buildClubHref(row.club_slug));
    return {
      ok: true,
      href: buildClubChannelHref({
        clubSlug: row.club_slug,
        channelSlug: row.channel_slug,
        videoSec: parsed.data.videoSec ?? null,
      }),
    };
  } catch {
    return { ok: false, code: 'unavailable', message: 'Discussão indisponível no momento.' };
  }
}

export async function sendClubMessageAction(input: {
  channelId: string;
  clientMessageId: string;
  content: string;
  replyToId?: string | null;
  videoSec?: number | null;
}): Promise<{
  ok: boolean;
  message?: string;
  sent?: ClubMessageView;
}> {
  return withTelemetryAction(
    'clubs.postClubMessage',
    async (inp: typeof input) => {
      if (isReadOnlyPreview()) {
        return { ok: false, message: READ_ONLY_PREVIEW_MESSAGE };
      }
      const parsed = sendClubMessageSchema.safeParse(inp);
      if (!parsed.success) {
        return { ok: false, message: parsed.error.issues[0]?.message ?? 'Mensagem inválida.' };
      }

      try {
        const supabase = await createServerSupabase();
        const { data, error } = await supabase.rpc('send_club_message', {
          p_channel: parsed.data.channelId,
          p_client_message_id: parsed.data.clientMessageId,
          p_content: parsed.data.content,
          p_reply_to: parsed.data.replyToId ?? null,
          p_video_sec: parsed.data.videoSec ?? null,
        });

        if (error || !data?.[0]) {
          const mapped = mapDatabaseError(error?.code, error?.message);
          return { ok: false, message: mapped.message };
        }

        const row = data[0];
        let authorName = 'Você';
        let authorUsername: string | null = null;
        let authorAvatarUrl: string | null = null;

        if (row.author_id) {
          const { data: profile } = await supabase
            .from('v_profiles_public')
            .select('display_name,username,avatar_url')
            .eq('id', row.author_id)
            .maybeSingle();
          if (profile) {
            authorName = profile.display_name ?? profile.username ?? 'Você';
            authorUsername = profile.username;
            authorAvatarUrl = profile.avatar_url;
          }
        }

        revalidatePath(
          buildClubChannelHref({ clubSlug: row.club_slug, channelSlug: row.channel_slug }),
        );

        return {
          ok: true,
          sent: {
            id: row.id,
            channelId: row.channel_id,
            authorId: row.author_id,
            authorName,
            authorUsername,
            authorAvatarUrl,
            content: row.content,
            replyToId: row.reply_to_id,
            videoSec: row.video_sec,
            version: row.version,
            createdAt: row.created_at,
            editedAt: null,
          },
        };
      } catch {
        return { ok: false, message: 'Não foi possível enviar sua mensagem agora.' };
      }
    },
    {
      resourceExtractor: (inp) => ({
        channelId: inp.channelId,
        clientMessageId: inp.clientMessageId,
      }),
    }
  )(input);
}

export async function editClubMessageAction(input: {
  messageId: string;
  version: number;
  content: string;
  clubSlug: string;
  channelSlug: string;
}): Promise<{ ok: boolean; newVersion?: number; message?: string }> {
  if (isReadOnlyPreview()) {
    return { ok: false, message: READ_ONLY_PREVIEW_MESSAGE };
  }
  const parsed = editClubMessageSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }

  try {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase.rpc('edit_club_message', {
      p_message: parsed.data.messageId,
      p_version: parsed.data.version,
      p_content: parsed.data.content,
    });

    if (error || typeof data !== 'number') {
      const mapped = mapDatabaseError(error?.code, error?.message);
      return { ok: false, message: mapped.message };
    }

    revalidatePath(
      buildClubChannelHref({ clubSlug: input.clubSlug, channelSlug: input.channelSlug }),
    );
    return { ok: true, newVersion: data };
  } catch {
    return { ok: false, message: 'Não foi possível editar esta mensagem.' };
  }
}

export async function deleteClubMessageAction(input: {
  messageId: string;
  version: number;
  clubSlug: string;
  channelSlug: string;
}): Promise<{ ok: boolean; message?: string }> {
  if (isReadOnlyPreview()) {
    return { ok: false, message: READ_ONLY_PREVIEW_MESSAGE };
  }
  const parsed = deleteClubMessageSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }

  try {
    const supabase = await createServerSupabase();
    const { error } = await supabase.rpc('delete_club_message', {
      p_message: parsed.data.messageId,
      p_version: parsed.data.version,
    });

    if (error) {
      const mapped = mapDatabaseError(error.code, error.message);
      return { ok: false, message: mapped.message };
    }

    revalidatePath(
      buildClubChannelHref({ clubSlug: input.clubSlug, channelSlug: input.channelSlug }),
    );
    return { ok: true };
  } catch {
    return { ok: false, message: 'Não foi possível remover esta mensagem.' };
  }
}

export async function acceptChannelSpoilersAction(input: {
  channelId: string;
  rulesVersion: number;
  clubSlug: string;
  channelSlug: string;
}): Promise<{ ok: boolean; message?: string }> {
  if (isReadOnlyPreview()) {
    return { ok: false, message: READ_ONLY_PREVIEW_MESSAGE };
  }
  const parsed = acceptChannelSpoilersSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Canal inválido.' };
  }

  try {
    const supabase = await createServerSupabase();
    const { error } = await supabase.rpc('accept_channel_spoilers', {
      p_channel: parsed.data.channelId,
      p_rules_version: parsed.data.rulesVersion,
    });

    if (error) {
      const mapped = mapDatabaseError(error.code, error.message);
      return { ok: false, message: mapped.message };
    }

    revalidatePath(buildClubHref(input.clubSlug));
    revalidatePath(
      buildClubChannelHref({ clubSlug: input.clubSlug, channelSlug: input.channelSlug }),
    );
    return { ok: true };
  } catch {
    return { ok: false, message: 'Não foi possível registrar seu consentimento.' };
  }
}

export async function revokeChannelSpoilersAction(input: {
  channelId: string;
  clubSlug: string;
  channelSlug: string;
}): Promise<{ ok: boolean; message?: string }> {
  if (isReadOnlyPreview()) {
    return { ok: false, message: READ_ONLY_PREVIEW_MESSAGE };
  }
  const parsed = revokeChannelSpoilersSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Canal inválido.' };
  }

  try {
    const supabase = await createServerSupabase();
    const { error } = await supabase.rpc('revoke_channel_spoilers', {
      p_channel: parsed.data.channelId,
    });

    if (error) {
      const mapped = mapDatabaseError(error.code, error.message);
      return { ok: false, message: mapped.message };
    }

    revalidatePath(buildClubHref(input.clubSlug));
    revalidatePath(
      buildClubChannelHref({ clubSlug: input.clubSlug, channelSlug: input.channelSlug }),
    );
    return { ok: true };
  } catch {
    return { ok: false, message: 'Não foi possível ocultar o canal agora.' };
  }
}

export async function setChannelPreferenceAction(input: {
  channelId: string;
  mode: 'muted' | 'mentions' | 'following';
  clubSlug: string;
  channelSlug: string;
}): Promise<{ ok: boolean; message?: string }> {
  if (isReadOnlyPreview()) {
    return { ok: false, message: READ_ONLY_PREVIEW_MESSAGE };
  }
  const parsed = setChannelPreferenceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Preferência inválida.' };
  }

  try {
    const supabase = await createServerSupabase();
    const { error } = await supabase.rpc('set_channel_preference', {
      p_channel: parsed.data.channelId,
      p_mode: parsed.data.mode,
    });

    if (error) {
      const mapped = mapDatabaseError(error.code, error.message);
      return { ok: false, message: mapped.message };
    }

    revalidatePath(
      buildClubChannelHref({ clubSlug: input.clubSlug, channelSlug: input.channelSlug }),
    );
    return { ok: true, message: 'Preferência de alerta atualizada.' };
  } catch {
    return { ok: false, message: 'Não foi possível atualizar sua preferência.' };
  }
}

export async function createTopicChannelAction(input: {
  clubId: string;
  clubSlug: string;
  name: string;
  slug: string;
  spoilerPolicy: 'none' | 'whole_book';
  requestId: string;
}): Promise<{ ok: boolean; href?: string; message?: string }> {
  if (isReadOnlyPreview()) {
    return { ok: false, message: READ_ONLY_PREVIEW_MESSAGE };
  }
  const parsed = createTopicChannelSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }

  try {
    const supabase = await createServerSupabase();
    const { error } = await supabase.rpc('create_club_topic_channel', {
      p_club: parsed.data.clubId,
      p_name: parsed.data.name,
      p_slug: parsed.data.slug,
      p_spoiler_policy: parsed.data.spoilerPolicy,
      p_request_id: parsed.data.requestId,
    });

    if (error) {
      const mapped = mapDatabaseError(error.code, error.message);
      return { ok: false, message: mapped.message };
    }

    const href = buildClubChannelHref({
      clubSlug: input.clubSlug,
      channelSlug: parsed.data.slug,
    });
    revalidatePath(buildClubHref(input.clubSlug));
    revalidatePath(href);
    return { ok: true, href, message: 'Canal criado com sucesso.' };
  } catch {
    return { ok: false, message: 'Não foi possível criar o canal agora.' };
  }
}

export async function blockCommunityUserAction(input: {
  targetUserId: string;
}): Promise<{ ok: boolean; message: string }> {
  if (isReadOnlyPreview()) {
    return { ok: false, message: READ_ONLY_PREVIEW_MESSAGE };
  }
  const parsed = blockCommunityUserSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Usuário inválido.' };
  }

  try {
    const supabase = await createServerSupabase();
    const { error } = await supabase.rpc('block_community_user', {
      p_target_user: parsed.data.targetUserId,
    });

    if (error) {
      const mapped = mapDatabaseError(error.code, error.message);
      return { ok: false, message: mapped.message };
    }

    return { ok: true, message: 'Usuário bloqueado. Suas mensagens não aparecerão para você.' };
  } catch {
    return { ok: false, message: 'Não foi possível bloquear este usuário agora.' };
  }
}

export async function applyClubSanctionAction(input: {
  clubId: string;
  clubSlug: string;
  userId: string;
  kind: 'mute' | 'ban';
  reason: string;
  expiresAt?: string | null;
}): Promise<{ ok: boolean; message: string }> {
  if (isReadOnlyPreview()) {
    return { ok: false, message: READ_ONLY_PREVIEW_MESSAGE };
  }
  const parsed = applyClubSanctionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }

  try {
    const supabase = await createServerSupabase();
    const { error } = await supabase.rpc('apply_club_sanction', {
      p_club: parsed.data.clubId,
      p_user: parsed.data.userId,
      p_kind: parsed.data.kind,
      p_reason: parsed.data.reason,
      p_expires_at: parsed.data.expiresAt ?? null,
    });

    if (error) {
      const mapped = mapDatabaseError(error.code, error.message);
      return { ok: false, message: mapped.message };
    }

    revalidatePath(buildClubHref(input.clubSlug));
    return {
      ok: true,
      message:
        parsed.data.kind === 'ban'
          ? 'Membro banido do clube.'
          : 'Membro silenciado no clube.',
    };
  } catch {
    return { ok: false, message: 'Não foi possível aplicar a sanção agora.' };
  }
}

export async function setClubMemberRoleAction(input: {
  clubId: string;
  clubSlug: string;
  memberId: string;
  role: 'moderator' | 'member';
}): Promise<{ ok: boolean; message: string }> {
  if (isReadOnlyPreview()) {
    return { ok: false, message: READ_ONLY_PREVIEW_MESSAGE };
  }
  const parsed = setClubMemberRoleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }

  try {
    const supabase = await createServerSupabase();
    const { error } = await supabase.rpc('set_club_member_role', {
      p_club: parsed.data.clubId,
      p_member: parsed.data.memberId,
      p_role: parsed.data.role,
    });

    if (error) {
      const mapped = mapDatabaseError(error.code, error.message);
      return { ok: false, message: mapped.message };
    }

    revalidatePath(buildClubHref(input.clubSlug));
    return { ok: true, message: 'Papel do membro atualizado.' };
  } catch {
    return { ok: false, message: 'Não foi possível atualizar o papel do membro.' };
  }
}
