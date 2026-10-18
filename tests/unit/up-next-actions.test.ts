import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addToUpNext, removeFromUpNext, reorderUpNext } from '@/features/up-next/actions';
import * as sessionModule from '@/lib/auth/session';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('up-next actions (QA-06 continuous playlist)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects invalid uuid', async () => {
    const res = await addToUpNext('not-a-uuid');
    expect(res.ok).toBe(false);
    expect(res.message).toBe('Livro inválido.');
  });

  it('rejects unauthenticated user', async () => {
    vi.spyOn(sessionModule, 'requireSession').mockResolvedValue(null as any);
    const res = await addToUpNext('550e8400-e29b-41d4-a716-446655440000');
    expect(res.ok).toBe(false);
    expect(res.message).toBe('Entre para adicionar livros à sua fila.');
  });

  it('returns success message on valid add (even beyond 5 items)', async () => {
    const rpcMock = vi.fn().mockResolvedValue({
      data: 6, // 6th item in the continuous playlist
      error: null,
    });
    vi.spyOn(sessionModule, 'requireSession').mockResolvedValue({
      userId: 'user-1',
      client: { rpc: rpcMock } as any,
    } as any);

    const res = await addToUpNext('550e8400-e29b-41d4-a716-446655440000');
    expect(res.ok).toBe(true);
    expect(res.message).toBe('Livro guardado na sua fila.');
    expect(rpcMock).toHaveBeenCalledWith('add_to_up_next_atomic', {
      p_book: '550e8400-e29b-41d4-a716-446655440000',
    });
  });

  it('validates uuid on removeFromUpNext', async () => {
    const res = await removeFromUpNext('invalid');
    expect(res.ok).toBe(false);
    expect(res.message).toBe('Livro inválido.');
  });

  it('successfully removes from queue', async () => {
    const deleteMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
    vi.spyOn(sessionModule, 'requireSession').mockResolvedValue({
      userId: 'user-1',
      client: { from: vi.fn().mockReturnValue({ delete: deleteMock }) } as any,
    } as any);

    const res = await removeFromUpNext('550e8400-e29b-41d4-a716-446655440000');
    expect(res.ok).toBe(true);
    expect(res.message).toBe('Livro removido da sua fila.');
  });

  it('rejects invalid uuid array on reorderUpNext', async () => {
    const res = await reorderUpNext(['not-a-uuid']);
    expect(res.ok).toBe(false);
    expect(res.message).toBe('Ordem de livros inválida.');
  });

  it('successfully calls reorder_up_next RPC with valid uuid array', async () => {
    const rpcMock = vi.fn().mockResolvedValue({
      data: true,
      error: null,
    });
    vi.spyOn(sessionModule, 'requireSession').mockResolvedValue({
      userId: 'user-1',
      client: { rpc: rpcMock } as any,
    } as any);

    const bookIds = [
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440002',
    ];
    const res = await reorderUpNext(bookIds);
    expect(res.ok).toBe(true);
    expect(res.message).toBe('Fila reorganizada com sucesso.');
    expect(rpcMock).toHaveBeenCalledWith('reorder_up_next', {
      p_book_ids: bookIds,
    });
  });
});
