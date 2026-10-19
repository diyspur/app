'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/session';
import { mapDatabaseError } from '@/lib/actions/database-errors';
import { withTelemetryAction } from '@/lib/observability/action-wrapper';
import { goalSchema } from './schemas';

export async function setReadingGoal(input: unknown) {
  return withTelemetryAction(
    'goals.saveReadingGoal',
    async (inp) => {
      const parsed = goalSchema.safeParse(inp);
      if (!parsed.success) {
        return {
          ok: false,
          message: parsed.error.issues[0]?.message || 'Informe metas numéricas válidas para livros, páginas ou minutos.',
          code: 'validation' as const,
        };
      }
      const session = await requireSession();
      if (!session) {
        return { ok: false, message: 'Entre na sua conta para definir sua meta de leitura.', code: 'unauthenticated' as const };
      }

      const { data, error } = await session.client.rpc('set_personal_reading_goal', {
        p_id: parsed.data.id || null,
        p_title: parsed.data.title || 'Minha meta de leitura',
        p_year: parsed.data.year,
        p_books: parsed.data.targetBooks ?? null,
        p_pages: parsed.data.targetPages ?? null,
        p_minutes: parsed.data.targetMinutes ?? null,
        p_version: parsed.data.version != null ? parsed.data.version : null,
      });

      if (error) {
        if (error.code === '40900' || error.message?.includes('conflict') || error.message?.includes('goal_archived')) {
          return { ok: false, message: 'Esta meta foi alterada em outra aba. Recarregue para atualizar.', code: 'conflict' as const };
        }
        if (error.code === 'P0002' || error.message?.includes('not_found')) {
          return { ok: false, message: 'Meta de leitura não encontrada.', code: 'not_found' as const };
        }
        return { ok: false, ...mapDatabaseError(error.code) };
      }

      revalidatePath('/metas');
      revalidatePath('/perfil');
      return { ok: true, message: 'Meta de leitura salva com sucesso!', goal: data };
    },
    {
      resourceExtractor: (inp) => {
        if (inp && typeof inp === 'object' && 'year' in inp) {
          return { year: (inp as { year: unknown }).year };
        }
        return {};
      },
    }
  )(input);
}

export async function archiveReadingGoal(goalId: string, version: number) {
  return withTelemetryAction(
    'goals.archiveReadingGoal',
    async (id, ver) => {
      const session = await requireSession();
      if (!session) {
        return { ok: false, message: 'Entre na sua conta para alterar suas metas.', code: 'unauthenticated' as const };
      }

      const parsedId = z.string().uuid().safeParse(id);
      const parsedVersion = z.number().int().nonnegative().safeParse(ver);
      if (!parsedId.success || !parsedVersion.success) {
        return { ok: false, message: 'Identificador ou versão inválida.', code: 'validation' as const };
      }

      const { error } = await session.client.rpc('archive_personal_reading_goal', {
        p_id: parsedId.data,
        p_version: parsedVersion.data,
      });

      if (error) {
        if (error.code === '40900' || error.message?.includes('conflict')) {
          return { ok: false, message: 'Esta meta foi alterada em outra aba. Recarregue a página.', code: 'conflict' as const };
        }
        return { ok: false, ...mapDatabaseError(error.code) };
      }

      revalidatePath('/metas');
      revalidatePath('/perfil');
      return { ok: true, message: 'Meta arquivada com sucesso.' };
    },
    {
      resourceExtractor: (id, ver) => ({ goalId: id, version: ver }),
    }
  )(goalId, version);
}
