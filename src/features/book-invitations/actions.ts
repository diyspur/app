'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth/session';
import { mapDatabaseError } from '@/lib/actions/database-errors';
import { inviteEmailSchema } from './schemas';

export async function sendBookInvitation(input: unknown) {
  const parsed = inviteEmailSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? 'Dados de convite inválidos.',
      code: 'validation' as const,
    };
  }

  const session = await requireSession();
  if (!session) {
    return {
      ok: false,
      message: 'Entre na sua conta para convidar amigos para a leitura.',
      requiresAuth: true,
      code: 'unauthenticated' as const,
    };
  }

  const { data, error } = await session.client.rpc('create_book_share_invitation', {
    p_book: parsed.data.bookId,
    p_email: parsed.data.email,
  });

  if (error) {
    return { ok: false, ...mapDatabaseError(error.code) };
  }

  revalidatePath('/leituras-compartilhadas');
  return { ok: true, message: data?.message || 'Convite enviado com sucesso para o leitor!' };
}
