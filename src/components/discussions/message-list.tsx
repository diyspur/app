'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ReportButton } from '@/components/moderation/report-button';
import {
  applyClubSanctionAction,
  blockCommunityUserAction,
  deleteClubMessageAction,
  editClubMessageAction,
} from '@/features/discussions/actions';
import type { ClubMemberRole, ClubMessageView } from '@/features/discussions/types';
import {
  buildChapterVideoHref,
  buildClubChannelHref,
  formatVideoTimestamp,
} from '@/lib/community-navigation';

function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function canStillEdit(createdAtIso: string): boolean {
  const createdMs = new Date(createdAtIso).getTime();
  if (Number.isNaN(createdMs)) return false;
  return Date.now() - createdMs < 15 * 60 * 1000;
}

interface MessageListProps {
  messages: ClubMessageView[];
  clubId: string;
  clubSlug: string;
  channelSlug: string;
  chapterId: string | null;
  viewerId: string | null;
  viewerRole: ClubMemberRole | null;
  isViewerAdmin: boolean;
  focusedMessageId?: string | null;
  onReply: (message: ClubMessageView) => void;
  onMessageUpdated: (id: string, content: string, newVersion: number) => void;
  onMessageDeleted: (id: string) => void;
  onAuthorBlocked: (authorId: string) => void;
}

export function MessageList({
  messages,
  clubId,
  clubSlug,
  channelSlug,
  chapterId,
  viewerId,
  viewerRole,
  isViewerAdmin,
  focusedMessageId,
  onReply,
  onMessageUpdated,
  onMessageDeleted,
  onAuthorBlocked,
}: MessageListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const messageMap = new Map(messages.map((m) => [m.id, m]));
  const canModerate =
    isViewerAdmin || viewerRole === 'owner' || viewerRole === 'moderator';
  const currentPath = buildClubChannelHref({ clubSlug, channelSlug });

  if (messages.length === 0) {
    return (
      <div className="empty-state" style={{ padding: '2rem 1rem' }}>
        <h3>Comece a conversa neste canal</h3>
        <p>Seja a primeira pessoa a compartilhar uma ideia ou responder às perguntas guia.</p>
      </div>
    );
  }

  const startEdit = (msg: ClubMessageView) => {
    setEditingId(msg.id);
    setEditDraft(msg.content);
    setFeedback(null);
  };

  const handleSaveEdit = (msg: ClubMessageView) => {
    startTransition(async () => {
      const res = await editClubMessageAction({
        messageId: msg.id,
        version: msg.version,
        content: editDraft,
        clubSlug,
        channelSlug,
      });
      if (res.ok && typeof res.newVersion === 'number') {
        onMessageUpdated(msg.id, editDraft.trim(), res.newVersion);
        setEditingId(null);
      } else {
        setFeedback(res.message ?? 'Não foi possível salvar a edição.');
      }
    });
  };

  const handleDelete = (msg: ClubMessageView) => {
    startTransition(async () => {
      const res = await deleteClubMessageAction({
        messageId: msg.id,
        version: msg.version,
        clubSlug,
        channelSlug,
      });
      if (res.ok) {
        onMessageDeleted(msg.id);
      } else {
        setFeedback(res.message ?? 'Não foi possível excluir a mensagem.');
      }
    });
  };

  const handleBlockUser = (authorId: string) => {
    startTransition(async () => {
      const res = await blockCommunityUserAction({ targetUserId: authorId });
      setFeedback(res.message);
      if (res.ok) {
        onAuthorBlocked(authorId);
      }
    });
  };

  const handleSanction = (authorId: string, kind: 'mute' | 'ban') => {
    startTransition(async () => {
      const res = await applyClubSanctionAction({
        clubId,
        clubSlug,
        userId: authorId,
        kind,
        reason: kind === 'ban' ? 'Banimento aplicado pela moderação do clube' : 'Silenciamento temporário de 24h',
        expiresAt:
          kind === 'mute'
            ? new Date(Date.now() + 24 * 3600 * 1000).toISOString()
            : null,
      });
      setFeedback(res.message);
    });
  };

  return (
    <div className="club-messages-container">
      {feedback && (
        <div className="notice" role="status" aria-live="polite" style={{ marginBottom: '0.75rem' }}>
          {feedback}
        </div>
      )}
      <ol className="club-message-list" aria-label="Mensagens do canal">
        {messages.map((msg) => {
          const parent = msg.replyToId ? messageMap.get(msg.replyToId) : undefined;
          const isOwn = Boolean(viewerId && msg.authorId === viewerId);
          const canEditThis = isOwn && canStillEdit(msg.createdAt);
          const canDeleteThis = isOwn || canModerate;
          const isFocused = focusedMessageId === msg.id;

          return (
            <li
              key={msg.id}
              id={`msg-${msg.id}`}
              className={`club-message-item ${isFocused ? 'is-focused' : ''}`}
            >
              {parent && (
                <div className="club-message-reply-preview">
                  <span>
                    Em resposta a <strong>{parent.authorName}</strong>:{' '}
                    {parent.content.slice(0, 80)}
                    {parent.content.length > 80 ? '…' : ''}
                  </span>
                </div>
              )}

              <div className="club-message-header">
                <div className="club-message-author">
                  <strong>{msg.authorName}</strong>
                  {msg.authorUsername && (
                    <span className="field-hint">@{msg.authorUsername}</span>
                  )}
                </div>
                <div className="club-message-meta">
                  {msg.videoSec !== null && (
                    chapterId ? (
                      <Link
                        href={buildChapterVideoHref(chapterId, msg.videoSec)}
                        className="video-timestamp-pill"
                        title="Abrir vídeo neste trecho"
                      >
                        ▶ {formatVideoTimestamp(msg.videoSec)}
                      </Link>
                    ) : (
                      <span className="video-timestamp-pill">
                        ▶ {formatVideoTimestamp(msg.videoSec)}
                      </span>
                    )
                  )}
                  <time dateTime={msg.createdAt} className="field-hint">
                    {formatMessageTime(msg.createdAt)}
                  </time>
                  {msg.editedAt && <span className="field-hint">(editada)</span>}
                </div>
              </div>

              {editingId === msg.id ? (
                <div className="club-message-edit-box">
                  <textarea
                    rows={3}
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    maxLength={4000}
                    className="composer-textarea"
                    aria-label="Editar conteúdo da mensagem"
                  />
                  <div className="action-row" style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className="button button-small"
                      disabled={isPending}
                      onClick={() => handleSaveEdit(msg)}
                    >
                      Salvar
                    </button>
                    <button
                      type="button"
                      className="button button-quiet button-small"
                      onClick={() => setEditingId(null)}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <p className="club-message-body">{msg.content}</p>
              )}

              {viewerId && (
                <div className="club-message-actions">
                  <button
                    type="button"
                    className="button button-quiet button-small"
                    onClick={() => onReply(msg)}
                  >
                    Responder
                  </button>
                  {canEditThis && editingId !== msg.id && (
                    <button
                      type="button"
                      className="button button-quiet button-small"
                      onClick={() => startEdit(msg)}
                    >
                      Editar
                    </button>
                  )}
                  {canDeleteThis && (
                    <button
                      type="button"
                      className="button button-quiet button-small"
                      disabled={isPending}
                      onClick={() => handleDelete(msg)}
                    >
                      Excluir
                    </button>
                  )}
                  {!isOwn && msg.authorId && (
                    <>
                      <ReportButton
                        contentType="club_message"
                        contentId={msg.id}
                        path={currentPath}
                      />
                      <button
                        type="button"
                        className="button button-quiet button-small"
                        disabled={isPending}
                        onClick={() => handleBlockUser(msg.authorId!)}
                      >
                        Bloquear leitor
                      </button>
                      {canModerate && (
                        <>
                          <button
                            type="button"
                            className="button button-quiet button-small"
                            disabled={isPending}
                            onClick={() => handleSanction(msg.authorId!, 'mute')}
                          >
                            Silenciar 24h
                          </button>
                          <button
                            type="button"
                            className="button button-quiet button-small"
                            disabled={isPending}
                            onClick={() => handleSanction(msg.authorId!, 'ban')}
                          >
                            Banir do clube
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
