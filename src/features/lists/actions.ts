'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/clients';
import {
  createListSchema,
  manageListSchema,
  addListItemSchema,
  removeListItemSchema,
  reorderListSchema,
  inviteCollaboratorSchema,
  removeCollaboratorSchema,
} from './schemas';

export type ListActionResult =
  | { ok: true; message: string; data?: unknown }
  | { ok: false; message: string; requiresAuth?: boolean; code?: string };

async function sessionContext() {
  const client = await createServerSupabase();
  const { data, error } = await client.auth.getClaims();
  const userId = data?.claims?.sub;
  return !error && typeof userId === 'string' ? { client, userId } : null;
}

function slugify(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'lista'
  );
}

export async function createReadingList(input: unknown): Promise<ListActionResult> {
  const parsed = createListSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Confira o nome da lista.' };
  }
  const session = await sessionContext();
  if (!session) return { ok: false, message: 'Entre para criar uma lista.', requiresAuth: true };

  const slug = `${slugify(parsed.data.title)}-${crypto.randomUUID().slice(0, 8)}`;
  const { error } = await session.client.from('reading_lists').insert({
    owner_id: session.userId,
    slug,
    title: parsed.data.title,
    description: parsed.data.description || null,
    visibility: parsed.data.visibility,
    is_collaborative: parsed.data.isCollaborative,
  });

  if (error) {
    console.error('List create failed', error.code);
    return { ok: false, message: 'Não foi possível criar a lista agora.' };
  }
  revalidatePath('/listas');
  return { ok: true, message: 'Lista criada.' };
}

export async function addBookToReadingList(input: unknown): Promise<ListActionResult> {
  const parsed = addListItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Livro ou lista inválidos.' };
  const session = await sessionContext();
  if (!session) return { ok: false, message: 'Entre para salvar este livro.', requiresAuth: true };

  const { data, error } = await session.client.rpc('add_book_to_reading_list', {
    p_list_id: parsed.data.listId,
    p_book_id: parsed.data.bookId,
  });
  if (error || !data?.ok) {
    return { ok: false, message: data?.message ?? 'Não foi possível adicionar o livro agora.' };
  }
  revalidatePath('/listas');
  return { ok: true, message: data.message ?? 'Livro adicionado à lista.' };
}

export async function updateReadingList(input: unknown): Promise<ListActionResult> {
  const parsed = manageListSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Confira os dados da lista.' };
  const session = await sessionContext();
  if (!session) return { ok: false, message: 'Entre para editar a lista.', requiresAuth: true };

  const updates: Record<string, unknown> = {
    title: parsed.data.title,
    description: parsed.data.description || null,
    updated_at: new Date().toISOString(),
  };
  if (parsed.data.visibility !== undefined) {
    updates.visibility = parsed.data.visibility;
  }
  if (parsed.data.isCollaborative !== undefined) {
    updates.is_collaborative = parsed.data.isCollaborative;
  }

  const { data, error } = await session.client
    .from('reading_lists')
    .update(updates)
    .eq('id', parsed.data.listId)
    .eq('owner_id', session.userId)
    .select('id')
    .maybeSingle();

  if (error || !data) return { ok: false, message: 'Lista não encontrada ou sem permissão de proprietário.' };
  revalidatePath('/listas');
  return { ok: true, message: 'Lista atualizada.' };
}

export async function removeBookFromReadingList(input: unknown): Promise<ListActionResult> {
  const parsed = removeListItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Item inválido.' };
  const session = await sessionContext();
  if (!session) return { ok: false, message: 'Entre para editar a lista.', requiresAuth: true };

  const { data, error } = await session.client.rpc('remove_reading_list_item', {
    p_list_id: parsed.data.listId,
    p_item_id: parsed.data.itemId,
  });
  if (error || data !== true) {
    return {
      ok: false,
      message: error?.code === '42501' ? 'Você não pode editar esta lista.' : 'Item não encontrado ou sem acesso.',
    };
  }
  revalidatePath('/listas');
  return { ok: true, message: 'Item removido.' };
}

export async function restoreBookToReadingList(input: unknown): Promise<ListActionResult> {
  const parsed = removeListItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Item inválido.' };
  const session = await sessionContext();
  if (!session) return { ok: false, message: 'Entre para editar a lista.', requiresAuth: true };

  const { data, error } = await session.client.rpc('restore_reading_list_item', {
    p_list_id: parsed.data.listId,
    p_item_id: parsed.data.itemId,
  });
  if (error || data !== true) {
    return {
      ok: false,
      message: error?.code === '23505' ? 'Este livro já está ativo na lista.' : 'Item não encontrado ou sem acesso.',
    };
  }
  revalidatePath('/listas');
  return { ok: true, message: 'Item restaurado.' };
}

export async function reorderReadingList(input: unknown): Promise<ListActionResult> {
  const parsed = reorderListSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Ordem inválida.' };
  const session = await sessionContext();
  if (!session) return { ok: false, message: 'Entre para editar a lista.', requiresAuth: true };

  const { error } = await session.client.rpc('reorder_reading_list', {
    p_list: parsed.data.listId,
    p_version: parsed.data.version,
    p_item_ids: parsed.data.itemIds,
  });
  if (error) {
    return {
      ok: false,
      message: error.code === '40001' ? 'A lista mudou. Atualize e tente novamente.' : 'Não foi possível reorganizar a lista.',
    };
  }
  revalidatePath('/listas');
  return { ok: true, message: 'Ordem atualizada.' };
}

export async function inviteListCollaborator(input: unknown): Promise<ListActionResult> {
  const parsed = inviteCollaboratorSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  const session = await sessionContext();
  if (!session) return { ok: false, message: 'Entre para gerenciar colaboradores.', requiresAuth: true };

  // Verify list ownership
  const { data: list, error: listError } = await session.client
    .from('reading_lists')
    .select('id, owner_id')
    .eq('id', parsed.data.listId)
    .maybeSingle();

  if (listError || !list || list.owner_id !== session.userId) {
    return { ok: false, message: 'Apenas o proprietário pode convidar colaboradores.' };
  }

  // Find user by username
  const cleanUsername = parsed.data.username.replace(/^@/, '').trim();
  const { data: targetProfile, error: profileError } = await session.client
    .from('profiles')
    .select('id, username, display_name')
    .ilike('username', cleanUsername)
    .maybeSingle();

  if (profileError || !targetProfile) {
    return { ok: false, message: `Usuário "${cleanUsername}" não encontrado.` };
  }

  if (targetProfile.id === session.userId) {
    return { ok: false, message: 'Você já é o proprietário desta lista.' };
  }

  // Ensure list is marked as collaborative
  await session.client
    .from('reading_lists')
    .update({ is_collaborative: true, updated_at: new Date().toISOString() })
    .eq('id', list.id);

  // Insert or update collaborator
  const { error: collabError } = await session.client
    .from('reading_list_collaborators')
    .upsert(
      {
        list_id: list.id,
        user_id: targetProfile.id,
        can_edit: true,
      },
      { onConflict: 'list_id,user_id' }
    );

  if (collabError) {
    console.error('Add collaborator error', collabError);
    return { ok: false, message: 'Não foi possível adicionar o colaborador agora.' };
  }

  revalidatePath('/listas');
  return {
    ok: true,
    message: `@${targetProfile.username} foi adicionado como colaborador.`,
    data: { userId: targetProfile.id, username: targetProfile.username, displayName: targetProfile.display_name },
  };
}

export async function removeListCollaborator(input: unknown): Promise<ListActionResult> {
  const parsed = removeCollaboratorSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Dados inválidos.' };
  const session = await sessionContext();
  if (!session) return { ok: false, message: 'Entre para gerenciar colaboradores.', requiresAuth: true };

  // Verify list ownership
  const { data: list, error: listError } = await session.client
    .from('reading_lists')
    .select('id, owner_id')
    .eq('id', parsed.data.listId)
    .maybeSingle();

  if (listError || !list || list.owner_id !== session.userId) {
    return { ok: false, message: 'Apenas o proprietário pode remover colaboradores.' };
  }

  const { error } = await session.client
    .from('reading_list_collaborators')
    .delete()
    .eq('list_id', parsed.data.listId)
    .eq('user_id', parsed.data.userId);

  if (error) {
    console.error('Remove collaborator error', error);
    return { ok: false, message: 'Não foi possível remover o colaborador.' };
  }

  revalidatePath('/listas');
  return { ok: true, message: 'Colaborador removido da lista.' };
}
