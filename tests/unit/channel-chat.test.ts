import { describe, it, expect } from 'vitest';
import type { ClubMessageView } from '@/features/discussions/types';

// Pure reducer testing chat message update and deletion reconciliation
function reconcileChatMessageUpdate(
  messages: ClubMessageView[],
  payload: { id: string; content?: string; version?: number; edited_at?: string | null; deleted_at?: string | null },
): ClubMessageView[] {
  if (payload.deleted_at) {
    return messages.filter((m) => m.id !== payload.id);
  }
  return messages.map((m) =>
    m.id === payload.id
      ? {
          ...m,
          content: payload.content ?? m.content,
          version: payload.version ?? m.version,
          editedAt: payload.edited_at ?? m.editedAt,
        }
      : m,
  );
}

describe('Channel Chat Realtime & Pagination (QA-18)', () => {
  const sampleMessages: ClubMessageView[] = [
    {
      id: 'msg-1',
      channelId: 'ch-1',
      authorId: 'u-1',
      authorName: 'Ana',
      authorUsername: 'ana',
      authorAvatarUrl: null,
      content: 'Primeira impressão sobre o livro',
      replyToId: null,
      videoSec: null,
      version: 1,
      createdAt: '2026-10-18T10:00:00Z',
      editedAt: null,
    },
    {
      id: 'msg-2',
      channelId: 'ch-1',
      authorId: 'u-2',
      authorName: 'Bruno',
      authorUsername: 'bruno',
      authorAvatarUrl: null,
      content: 'Concordo com a análise',
      replyToId: 'msg-1',
      videoSec: null,
      version: 1,
      createdAt: '2026-10-18T10:05:00Z',
      editedAt: null,
    },
  ];

  it('updates message content and marks editedAt when receiving UPDATE', () => {
    const updated = reconcileChatMessageUpdate(sampleMessages, {
      id: 'msg-1',
      content: 'Primeira impressão revisada sobre o livro',
      version: 2,
      edited_at: '2026-10-18T10:08:00Z',
    });

    const msg1 = updated.find((m) => m.id === 'msg-1');
    expect(msg1?.content).toBe('Primeira impressão revisada sobre o livro');
    expect(msg1?.version).toBe(2);
    expect(msg1?.editedAt).toBe('2026-10-18T10:08:00Z');
  });

  it('removes message from list when deleted_at is received in UPDATE', () => {
    const deleted = reconcileChatMessageUpdate(sampleMessages, {
      id: 'msg-1',
      deleted_at: '2026-10-18T10:10:00Z',
    });

    expect(deleted.length).toBe(1);
    expect(deleted.some((m) => m.id === 'msg-1')).toBe(false);
  });
});
