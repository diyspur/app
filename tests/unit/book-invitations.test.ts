import { describe, it, expect, vi, beforeEach } from 'vitest';
import { inviteEmailSchema } from '@/features/book-invitations/schemas';
import { sendBookInvitation } from '@/features/book-invitations/actions';
import * as sessionModule from '@/lib/auth/session';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('Book Share Invitations (QA-09, QA-10)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('validates bookId and email strictly', () => {
    const valid = inviteEmailSchema.safeParse({
      bookId: '11111111-1111-4111-a111-111111111111',
      email: 'amigo@exemplo.com',
    });
    expect(valid.success).toBe(true);

    const invalidEmail = inviteEmailSchema.safeParse({
      bookId: '11111111-1111-4111-a111-111111111111',
      email: 'not-an-email',
    });
    expect(invalidEmail.success).toBe(false);

    const invalidUuid = inviteEmailSchema.safeParse({
      bookId: '123',
      email: 'amigo@exemplo.com',
    });
    expect(invalidUuid.success).toBe(false);
  });

  it('rejects unauthenticated users attempting to send invites', async () => {
    vi.spyOn(sessionModule, 'requireSession').mockResolvedValue(null as any);

    const res = await sendBookInvitation({
      bookId: '11111111-1111-4111-a111-111111111111',
      email: 'leitor@exemplo.com',
    });

    expect(res.ok).toBe(false);
    expect(res.requiresAuth).toBe(true);
  });

  it('sends invitation via RPC when authenticated', async () => {
    const rpcMock = vi.fn().mockResolvedValue({
      data: { ok: true, message: 'Convite enviado com sucesso para o leitor!' },
      error: null,
    });

    vi.spyOn(sessionModule, 'requireSession').mockResolvedValue({
      userId: 'user-1',
      client: { rpc: rpcMock } as any,
    } as any);

    const res = await sendBookInvitation({
      bookId: '11111111-1111-4111-a111-111111111111',
      email: 'leitor@exemplo.com',
    });

    expect(res.ok).toBe(true);
    expect(res.message).toBe('Convite enviado com sucesso para o leitor!');
    expect(rpcMock).toHaveBeenCalledWith('create_book_share_invitation', {
      p_book: '11111111-1111-4111-a111-111111111111',
      p_email: 'leitor@exemplo.com',
    });
  });
});
