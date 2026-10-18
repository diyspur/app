import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addBookToReadingList, createReadingList } from '@/features/lists/actions';
import { createServerSupabase } from '@/lib/supabase/clients';

vi.mock('@/lib/supabase/clients', () => ({
  createServerSupabase: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('Reading Lists Integration (QA-07, QA-08)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects adding book when unauthenticated', async () => {
    vi.mocked(createServerSupabase).mockResolvedValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({ data: null, error: new Error('unauthenticated') }),
      },
    } as any);

    const res = await addBookToReadingList({
      listId: '11111111-1111-4111-a111-111111111111',
      bookId: '22222222-2222-4222-a222-222222222222',
    });

    expect(res.ok).toBe(false);
    expect(res.requiresAuth).toBe(true);
  });

  it('adds book to list via RPC when authenticated', async () => {
    const rpcMock = vi.fn().mockResolvedValue({
      data: { ok: true, message: 'Livro adicionado à lista.' },
      error: null,
    });

    vi.mocked(createServerSupabase).mockResolvedValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: { sub: 'user-123' } },
          error: null,
        }),
      },
      rpc: rpcMock,
    } as any);

    const res = await addBookToReadingList({
      listId: '11111111-1111-4111-a111-111111111111',
      bookId: '22222222-2222-4222-a222-222222222222',
    });

    expect(res.ok).toBe(true);
    expect(res.message).toBe('Livro adicionado à lista.');
    expect(rpcMock).toHaveBeenCalledWith('add_book_to_reading_list', {
      p_list_id: '11111111-1111-4111-a111-111111111111',
      p_book_id: '22222222-2222-4222-a222-222222222222',
    });
  });

  it('validates list creation input', async () => {
    const res = await createReadingList({ title: '' });
    expect(res.ok).toBe(false);
    expect(res.message).toBe('Dê um nome para sua lista.');
  });
});
