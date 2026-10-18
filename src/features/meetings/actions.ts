'use server';

import { revalidatePath } from 'next/cache';
import { mapDatabaseError } from '@/lib/actions/database-errors';
import { isReadOnlyPreview, READ_ONLY_PREVIEW_MESSAGE } from '@/lib/actions/read-only';
import { withTelemetryAction } from '@/lib/observability/action-wrapper';
import { createServerSupabase } from '@/lib/supabase/clients';
import {
  cancelMeetingSchema,
  createMeetingSchema,
  updateMeetingSchema,
  type CancelMeetingInput,
  type CreateMeetingInput,
  type UpdateMeetingInput,
} from './schemas';

export async function createClubMeetingAction(
  input: CreateMeetingInput,
): Promise<{ ok: boolean; meetingId?: string; message: string }> {
  return withTelemetryAction(
    'meetings.createMeeting',
    async (inp: CreateMeetingInput) => {
      if (isReadOnlyPreview()) {
        return { ok: false, message: READ_ONLY_PREVIEW_MESSAGE };
      }

      const parsed = createMeetingSchema.safeParse(inp);
      if (!parsed.success) {
        return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
      }

      try {
        const supabase = await createServerSupabase();
        const { data, error } = await supabase.rpc('create_club_meeting', {
          p_club: parsed.data.clubId,
          p_book: parsed.data.bookId,
          p_chapter: parsed.data.chapterId ?? null,
          p_title: parsed.data.title,
          p_kind: parsed.data.kind,
          p_scheduled_at: parsed.data.scheduledAt,
          p_duration_min: parsed.data.durationMin,
          p_meeting_url: parsed.data.meetingUrl ?? null,
          p_location: parsed.data.location ?? null,
          p_agenda: parsed.data.agenda ?? null,
          p_spoiler_policy: parsed.data.spoilerPolicy,
          p_request_id: parsed.data.requestId,
        });

        if (error || !data) {
          const mapped = mapDatabaseError(error?.code, error?.message);
          return { ok: false, message: mapped.message };
        }

        revalidatePath('/calendario');
        return { ok: true, meetingId: data, message: 'Encontro agendado com sucesso.' };
      } catch {
        return { ok: false, message: 'Não foi possível agendar o encontro agora.' };
      }
    },
    {
      resourceExtractor: (inp) => ({
        clubId: inp.clubId,
        bookId: inp.bookId,
        chapterId: inp.chapterId,
        title: inp.title,
      }),
    }
  )(input);
}

export async function updateClubMeetingAction(
  input: UpdateMeetingInput,
): Promise<{ ok: boolean; newVersion?: number; message: string }> {
  return withTelemetryAction(
    'meetings.updateMeeting',
    async (inp: UpdateMeetingInput) => {
      if (isReadOnlyPreview()) {
        return { ok: false, message: READ_ONLY_PREVIEW_MESSAGE };
      }

      const parsed = updateMeetingSchema.safeParse(inp);
      if (!parsed.success) {
        return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
      }

      try {
        const supabase = await createServerSupabase();
        const { data, error } = await supabase.rpc('update_club_meeting', {
          p_meeting: parsed.data.meetingId,
          p_version: parsed.data.version,
          p_chapter: parsed.data.chapterId ?? null,
          p_title: parsed.data.title,
          p_kind: parsed.data.kind,
          p_scheduled_at: parsed.data.scheduledAt,
          p_duration_min: parsed.data.durationMin,
          p_meeting_url: parsed.data.meetingUrl ?? null,
          p_location: parsed.data.location ?? null,
          p_agenda: parsed.data.agenda ?? null,
          p_spoiler_policy: parsed.data.spoilerPolicy,
        });

        if (error || typeof data !== 'number') {
          const mapped = mapDatabaseError(error?.code, error?.message);
          return { ok: false, message: mapped.message };
        }

        revalidatePath('/calendario');
        revalidatePath(`/eventos/${parsed.data.meetingId}`);
        return { ok: true, newVersion: data, message: 'Encontro atualizado com sucesso.' };
      } catch {
        return { ok: false, message: 'Não foi possível atualizar o encontro agora.' };
      }
    },
    {
      resourceExtractor: (inp) => ({
        meetingId: inp.meetingId,
        title: inp.title,
      }),
    }
  )(input);
}

export async function cancelClubMeetingAction(
  input: CancelMeetingInput,
): Promise<{ ok: boolean; newVersion?: number; message: string }> {
  return withTelemetryAction(
    'meetings.cancelMeeting',
    async (inp: CancelMeetingInput) => {
      if (isReadOnlyPreview()) {
        return { ok: false, message: READ_ONLY_PREVIEW_MESSAGE };
      }

      const parsed = cancelMeetingSchema.safeParse(inp);
      if (!parsed.success) {
        return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
      }

      try {
        const supabase = await createServerSupabase();
        const { data, error } = await supabase.rpc('cancel_club_meeting', {
          p_meeting: parsed.data.meetingId,
          p_version: parsed.data.version,
        });

        if (error || typeof data !== 'number') {
          const mapped = mapDatabaseError(error?.code, error?.message);
          return { ok: false, message: mapped.message };
        }

        revalidatePath('/calendario');
        revalidatePath(`/eventos/${parsed.data.meetingId}`);
        return { ok: true, newVersion: data, message: 'Encontro cancelado com sucesso.' };
      } catch {
        return { ok: false, message: 'Não foi possível cancelar o encontro agora.' };
      }
    },
    {
      resourceExtractor: (inp) => ({
        meetingId: inp.meetingId,
      }),
    }
  )(input);
}
