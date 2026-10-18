'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/session';
import { mapDatabaseError } from '@/lib/actions/database-errors';
import { isReadOnlyPreview, READ_ONLY_PREVIEW_MESSAGE } from '@/lib/actions/read-only';

const bookIdSchema = z.string().uuid();

export async function addToUpNext(bookId: string) {
  if (isReadOnlyPreview()) return { ok: false, message: READ_ONLY_PREVIEW_MESSAGE };
  const parsed = bookIdSchema.safeParse(bookId);
  if (!parsed.success) return { ok: false, message: 'Livro inválido.' };
  const session = await requireSession();
  if (!session) return { ok: false, message: 'Entre para adicionar livros à sua fila.' };

  const { error } = await session.client.rpc('add_to_up_next_atomic', {
    p_book: parsed.data,
  });

  if (error) return { ok: false, ...mapDatabaseError(error.code) };
  revalidatePath('/minha-fila');
  return { ok: true, message: 'Livro guardado na sua fila.' };
}

export async function removeFromUpNext(bookId: string) {
  if (isReadOnlyPreview()) return { ok: false, message: READ_ONLY_PREVIEW_MESSAGE };
  const parsed = bookIdSchema.safeParse(bookId);
  if (!parsed.success) return { ok: false, message: 'Livro inválido.' };
  const session = await requireSession();
  if (!session) return { ok: false, message: 'Entre para alterar sua fila.' };

  const { error } = await session.client
    .from('user_up_next')
    .delete()
    .eq('user_id', session.userId)
    .eq('book_id', parsed.data);

  if (error) return { ok: false, ...mapDatabaseError(error.code) };
  revalidatePath('/minha-fila');
  return { ok: true, message: 'Livro removido da sua fila.' };
}

const reorderSchema = z.array(z.string().uuid()).max(100);

export async function reorderUpNext(bookIds: string[]) {
  if (isReadOnlyPreview()) return { ok: false, message: READ_ONLY_PREVIEW_MESSAGE };
  const parsed = reorderSchema.safeParse(bookIds);
  if (!parsed.success) return { ok: false, message: 'Ordem de livros inválida.' };
  const session = await requireSession();
  if (!session) return { ok: false, message: 'Entre para alterar a ordem da sua fila.' };

  const { error } = await session.client.rpc('reorder_up_next', {
    p_book_ids: parsed.data,
  });

  if (error) return { ok: false, ...mapDatabaseError(error.code) };
  revalidatePath('/minha-fila');
  return { ok: true, message: 'Fila reorganizada com sucesso.' };
}

