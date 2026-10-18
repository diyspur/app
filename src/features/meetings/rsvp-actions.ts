'use server';

import { isReadOnlyPreview, READ_ONLY_PREVIEW_MESSAGE } from '@/lib/actions/read-only';
import { withTelemetryAction } from '@/lib/observability/action-wrapper';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase/clients';
import type { Database } from '@/types/database';

const uuidSchema = z.string().uuid();

/**
 * The public contract intentionally has no status field: an RSVP is only an
 * affirmative or cancelled response represented by `attending`.
 */
const meetingRsvpInputSchema = z.object({
  meetingId: uuidSchema,
  attending: z.boolean(),
}).strict();

type MeetingRsvpInsert = Database['public']['Tables']['meeting_rsvps']['Insert'];

export type MeetingRsvpActionResult =
  | { ok: true; attending: boolean; message: string }
  | { ok: false; message: string; requiresAuth?: boolean };

async function getAuthenticatedContext() {
  try {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase.auth.getClaims();
    const userId = data?.claims?.sub;

    // The subject comes from the verified JWT; never accept user_id from the browser.
    if (error || typeof userId !== 'string' || !uuidSchema.safeParse(userId).success) return null;
    return { supabase, userId };
  } catch (cause) {
    console.error('RSVP auth check failed', cause instanceof Error ? cause.name : 'unknown_error');
    return null;
  }
}

/**
 * Read the current user's RSVP only. A server page can pass this value to
 * MeetingRsvp; the client component never performs an initial table query.
 */
export async function getMeetingRsvp(meetingId: string): Promise<boolean | null> {
  const parsedMeetingId = uuidSchema.safeParse(meetingId);
  if (!parsedMeetingId.success) return null;

  const session = await getAuthenticatedContext();
  if (!session) return null;

  const { data, error } = await session.supabase
    .from('meeting_rsvps')
    .select('attending')
    .eq('meeting_id', parsedMeetingId.data)
    .eq('user_id', session.userId)
    .maybeSingle();

  if (error) {
    console.error('RSVP read failed', error.code);
    return null;
  }

  return typeof data?.attending === 'boolean' ? data.attending : null;
}

/** Batch-loads RSVP state for the authenticated viewer only. */
export async function getMeetingRsvpMap(meetingIds: string[]): Promise<Record<string, boolean>> {
  const parsed = z.array(uuidSchema).max(100).safeParse(meetingIds);
  if (!parsed.success || parsed.data.length === 0) return {};
  const session = await getAuthenticatedContext();
  if (!session) return {};
  const { data, error } = await session.supabase
    .from('meeting_rsvps')
    .select('meeting_id,attending')
    .eq('user_id', session.userId)
    .in('meeting_id', parsed.data);
  if (error) {
    console.error('RSVP batch read failed', error.code);
    return {};
  }
  return Object.fromEntries((data ?? []).map((row) => [row.meeting_id, row.attending]));
}

export async function setMeetingRsvp(input: unknown): Promise<MeetingRsvpActionResult> {
  return withTelemetryAction(
    'meetings.setMeetingRsvp',
    async (inp: unknown): Promise<MeetingRsvpActionResult> => {
      if (isReadOnlyPreview()) return { ok: false, message: READ_ONLY_PREVIEW_MESSAGE };
      const parsed = meetingRsvpInputSchema.safeParse(inp);
      if (!parsed.success) {
        return { ok: false, message: 'O RSVP informado não é válido.' };
      }

      const session = await getAuthenticatedContext();
      if (!session) {
        return { ok: false, message: 'Entre na sua conta para responder ao encontro.', requiresAuth: true };
      }

      const values: MeetingRsvpInsert = {
        meeting_id: parsed.data.meetingId,
        user_id: session.userId,
        attending: parsed.data.attending,
      };

      // Upsert is scoped by the composite primary key and the user_id comes only
      // from getClaims(). Cancellation is attending=false, not a DELETE, so this
      // action uses the owner INSERT/UPDATE policies and preserves the RSVP row.
      const { error } = await session.supabase
        .from('meeting_rsvps')
        .upsert(values, { onConflict: 'meeting_id,user_id' });

      if (error) {
        console.error('RSVP write failed', error.code);
        return {
          ok: false,
          message: error.code === '42501'
            ? 'Sua sessão não permite alterar este RSVP.'
            : 'Não foi possível salvar sua resposta agora. Tente novamente.',
        };
      }

      revalidatePath('/calendario');
      return {
        ok: true,
        attending: parsed.data.attending,
        message: parsed.data.attending
          ? 'Intenção de presença registrada. Isso não contabiliza presença nem concede XP.'
          : 'Intenção de presença cancelada.',
      };
    },
    {
      resourceExtractor: (inp: unknown) => {
        const parsed = meetingRsvpInputSchema.safeParse(inp);
        if (parsed.success) {
          return {
            meetingId: parsed.data.meetingId,
            attending: parsed.data.attending,
          };
        }
        return {};
      },
    }
  )(input);
}
