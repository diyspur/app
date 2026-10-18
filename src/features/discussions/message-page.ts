import type { ClubMessageView } from './types';

export function paginateEarlierMessages(
  currentMessages: ClubMessageView[],
  rawRows: Array<Record<string, unknown>>,
  pageSize = 30,
): { messages: ClubMessageView[]; hasMore: boolean } {
  const hasMore = rawRows.length > pageSize;
  const visibleRows = rawRows.slice(0, pageSize);

  const mapped: ClubMessageView[] = visibleRows.map((row) => ({
    id: String(row.id),
    channelId: String(row.channel_id ?? ''),
    authorId: typeof row.author_id === 'string' ? row.author_id : null,
    authorName: typeof row.author_name === 'string' && row.author_name ? row.author_name : 'Leitor(a)',
    authorUsername: typeof row.author_username === 'string' ? row.author_username : null,
    authorAvatarUrl: typeof row.author_avatar_url === 'string' ? row.author_avatar_url : null,
    content: String(row.content ?? ''),
    replyToId: typeof row.reply_to_id === 'string' ? row.reply_to_id : null,
    videoSec: typeof row.video_sec === 'number' ? row.video_sec : null,
    version: typeof row.version === 'number' ? row.version : 1,
    createdAt: String(row.created_at ?? ''),
    editedAt: typeof row.edited_at === 'string' ? row.edited_at : null,
  }));

  const existingMap = new Map<string, ClubMessageView>();
  for (const m of currentMessages) {
    existingMap.set(m.id, m);
  }
  for (const m of mapped) {
    if (!existingMap.has(m.id)) {
      existingMap.set(m.id, m);
    }
  }

  // Ordenar cronologicamente por createdAt e id
  const merged = Array.from(existingMap.values()).sort((a, b) => {
    const timeDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.id.localeCompare(b.id);
  });

  return {
    messages: merged,
    hasMore,
  };
}
