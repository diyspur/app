'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/session';
import { mapDatabaseError } from '@/lib/actions/database-errors';
import { withTelemetryAction } from '@/lib/observability/action-wrapper';
import { createJournalSchema, updateJournalSchema } from './schemas';

export async function createJournalEntry(input: unknown) {
  return withTelemetryAction(
    'journal.saveJournalEntry',
    async (inp) => {
      const parsed = createJournalSchema.safeParse(inp);
      if (!parsed.success) {
        const firstIssue = parsed.error.issues[0]?.message;
        return {
          ok: false,
          message: firstIssue ?? 'Confira o livro, a data e o texto do registro.',
          code: 'validation' as const,
        };
      }

      const session = await requireSession();
      if (!session) {
        return { ok: false, message: 'Entre para escrever no seu diário.', code: 'unauthenticated' as const };
      }

      const { error } = await session.client.from('reading_journal_entries').insert({
        user_id: session.userId,
        book_id: parsed.data.bookId,
        chapter_id: parsed.data.chapterId ?? null,
        entry_date: parsed.data.entryDate,
        title: parsed.data.title || null,
        body: parsed.data.body,
        page_from: parsed.data.pageFrom ?? null,
        page_to: parsed.data.pageTo ?? null,
        percent_at: parsed.data.percentAt ?? null,
        minutes_read: parsed.data.minutesRead ?? 0,
        is_spoiler: parsed.data.isSpoiler,
        visibility: 'private',
      });

      if (error) return { ok: false, ...mapDatabaseError(error.code) };
      revalidatePath('/diario');
      return { ok: true, message: 'Registro salvo no seu diário.' };
    },
    {
      resourceExtractor: (inp) => {
        if (inp && typeof inp === 'object' && 'bookId' in inp) {
          return { bookId: String((inp as { bookId: unknown }).bookId) };
        }
        return {};
      },
    }
  )(input);
}

export async function updateJournalEntry(input: unknown) {
  return withTelemetryAction(
    'journal.updateJournalEntry',
    async (inp) => {
      const parsed = updateJournalSchema.safeParse(inp);
      if (!parsed.success) {
        const firstIssue = parsed.error.issues[0]?.message;
        return {
          ok: false,
          message: firstIssue ?? 'Confira os dados do registro.',
          code: 'validation' as const,
        };
      }

      const session = await requireSession();
      if (!session) {
        return { ok: false, message: 'Entre para editar seu diário.', code: 'unauthenticated' as const };
      }

      let query = session.client
        .from('reading_journal_entries')
        .update({
          entry_date: parsed.data.entryDate,
          title: parsed.data.title || null,
          body: parsed.data.body,
          page_from: parsed.data.pageFrom ?? null,
          page_to: parsed.data.pageTo ?? null,
          percent_at: parsed.data.percentAt ?? null,
          minutes_read: parsed.data.minutesRead ?? 0,
          is_spoiler: parsed.data.isSpoiler,
          updated_at: new Date().toISOString(),
        })
        .eq('id', parsed.data.id)
        .eq('user_id', session.userId);

      if (parsed.data.expectedVersion) {
        query = query.eq('version', parsed.data.expectedVersion);
      }

      const { data, error } = await query.select('id').maybeSingle();

      if (error || !data) {
        return {
          ok: false,
          message: 'Registro não encontrado, modificado recentemente ou sem permissão para edição.',
        };
      }

      revalidatePath('/diario');
      return { ok: true, message: 'Registro atualizado no seu diário.' };
    },
    {
      resourceExtractor: (inp) => {
        if (inp && typeof inp === 'object' && 'id' in inp) {
          return { id: String((inp as { id: unknown }).id) };
        }
        return {};
      },
    }
  )(input);
}

async function setArchived(id: string, archived: boolean) {
  const session = await requireSession();
  const parsed = z.string().uuid().safeParse(id);
  if (!session || !parsed.success) {
    return { ok: false, message: 'Não foi possível atualizar este registro.' };
  }

  const { data, error } = await session.client
    .from('reading_journal_entries')
    .update({
      archived_at: archived ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data)
    .eq('user_id', session.userId)
    .select('id')
    .maybeSingle();

  if (error || !data) {
    return { ok: false, message: 'Registro não encontrado ou sem acesso.' };
  }

  revalidatePath('/diario');
  return { ok: true, message: archived ? 'Registro arquivado.' : 'Registro restaurado.' };
}

export async function archiveJournalEntry(id: string) {
  return withTelemetryAction(
    'journal.archiveJournalEntry',
    async (entryId: string) => setArchived(entryId, true),
    {
      resourceExtractor: (entryId: string) => ({ entryId }),
    }
  )(id);
}

export async function restoreJournalEntry(id: string) {
  return withTelemetryAction(
    'journal.restoreJournalEntry',
    async (entryId: string) => setArchived(entryId, false),
    {
      resourceExtractor: (entryId: string) => ({ entryId }),
    }
  )(id);
}
