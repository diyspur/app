'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/session';
import { mapDatabaseError } from '@/lib/actions/database-errors';

const goalSchema = z
  .object({
    id: z.string().uuid().optional(),
    title: z.string().trim().min(1).max(120).optional(),
    year: z.coerce.number().int().min(2020).max(2050),
    targetBooks: z.coerce.number().int().positive().max(1000).nullable().optional(),
    targetPages: z.coerce.number().int().positive().max(1000000).nullable().optional(),
    targetMinutes: z.coerce.number().int().positive().max(1000000).nullable().optional(),
    version: z.coerce.number().int().nonnegative().optional(),
  })
  .strict()
  .refine(
    (v) =>
      (v.targetBooks != null && v.targetBooks > 0) ||
      (v.targetPages != null && v.targetPages > 0) ||
      (v.targetMinutes != null && v.targetMinutes > 0),
    { message: 'Defina pelo menos um objetivo (livros, páginas ou minutos).' },
  );

export async function setReadingGoal(input: unknown) {
  const parsed = goalSchema.safeParse(input);
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
    if (error.code === '40900' || error.message?.includes('conflict')) {
      return { ok: false, message: 'Esta meta foi alterada em outra aba. Recarregue para atualizar.', code: 'conflict' as const };
    }
    return { ok: false, ...mapDatabaseError(error.code) };
  }

  revalidatePath('/metas');
  revalidatePath('/perfil');
  return { ok: true, message: 'Meta de leitura salva com sucesso!', goal: data };
}

export async function archiveReadingGoal(goalId: string, version: number) {
  const session = await requireSession();
  if (!session) {
    return { ok: false, message: 'Entre na sua conta para alterar suas metas.', code: 'unauthenticated' as const };
  }

  const parsedId = z.string().uuid().safeParse(goalId);
  const parsedVersion = z.number().int().nonnegative().safeParse(version);
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
}
