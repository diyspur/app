import { describe, it, expect } from 'vitest';
import { paginateEarlierMessages } from '@/features/discussions/message-page';
import type { ClubMessageView } from '@/features/discussions/types';

describe('Message Cursor Pagination (QA-05)', () => {
  const existing: ClubMessageView[] = [
    {
      id: 'm-3',
      channelId: 'ch-1',
      authorId: 'u-1',
      authorName: 'Ana',
      authorUsername: 'ana',
      authorAvatarUrl: null,
      content: 'Mensagem 3',
      replyToId: null,
      videoSec: null,
      version: 1,
      createdAt: '2026-10-18T10:02:00Z',
      editedAt: null,
    },
    {
      id: 'm-4',
      channelId: 'ch-1',
      authorId: 'u-2',
      authorName: 'Bruno',
      authorUsername: 'bruno',
      authorAvatarUrl: null,
      content: 'Mensagem 4',
      replyToId: null,
      videoSec: null,
      version: 1,
      createdAt: '2026-10-18T10:03:00Z',
      editedAt: null,
    },
  ];

  it('deduplicates rows against current messages and prepends earlier ones ordered chronologically', () => {
    const rawRows = [
      {
        id: 'm-2',
        channel_id: 'ch-1',
        author_id: 'u-1',
        author_name: 'Ana',
        author_username: 'ana',
        author_avatar_url: null,
        content: 'Mensagem 2',
        reply_to_id: null,
        video_sec: null,
        version: 1,
        created_at: '2026-10-18T10:01:00Z',
        edited_at: null,
      },
      {
        id: 'm-1',
        channel_id: 'ch-1',
        author_id: 'u-3',
        author_name: 'Carla',
        author_username: 'carla',
        author_avatar_url: null,
        content: 'Mensagem 1',
        reply_to_id: null,
        video_sec: null,
        version: 1,
        created_at: '2026-10-18T10:00:00Z',
        edited_at: null,
      },
      // duplicated row
      {
        id: 'm-3',
        channel_id: 'ch-1',
        author_id: 'u-1',
        author_name: 'Ana',
        author_username: 'ana',
        author_avatar_url: null,
        content: 'Mensagem 3',
        reply_to_id: null,
        video_sec: null,
        version: 1,
        created_at: '2026-10-18T10:02:00Z',
        edited_at: null,
      },
    ];

    const result = paginateEarlierMessages(existing, rawRows, 30);
    expect(result.messages.map((m) => m.id)).toEqual(['m-1', 'm-2', 'm-3', 'm-4']);
    expect(result.hasMore).toBe(false);
  });

  it('detects hasMore true when rows returned exceed requested pageSize', () => {
    // 3 requested pageSize, 4 returned
    const rawRows = [
      { id: '1', channel_id: 'ch-1', content: '1', created_at: '2026-10-18T10:00:00Z' },
      { id: '2', channel_id: 'ch-1', content: '2', created_at: '2026-10-18T10:01:00Z' },
      { id: '3', channel_id: 'ch-1', content: '3', created_at: '2026-10-18T10:02:00Z' },
      { id: '4', channel_id: 'ch-1', content: '4', created_at: '2026-10-18T10:03:00Z' },
    ];

    const result = paginateEarlierMessages([], rawRows, 3);
    expect(result.hasMore).toBe(true);
    expect(result.messages.length).toBe(3);
  });
});
