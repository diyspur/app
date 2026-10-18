'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { joinClub } from '@/features/clubs/actions';
import type { ChannelWorkspaceData, ClubMessageView } from '@/features/discussions/types';
import { ChannelPreferencesControl } from './channel-preferences';
import { MessageComposer } from './message-composer';
import { MessageList } from './message-list';
import { RevokeSpoilerConsentButton, SpoilerConsentGate } from './spoiler-consent';
import { paginateEarlierMessages } from '@/features/discussions/message-page';

interface ChannelChatProps {
  workspace: ChannelWorkspaceData;
  initialReplyToId?: string | null;
  initialFocusMessageId?: string | null;
  initialVideoSec?: number | null;
}

export function ChannelChat({
  workspace,
  initialReplyToId,
  initialFocusMessageId,
  initialVideoSec,
}: ChannelChatProps) {
  const {
    club,
    activeChannel,
    prompts,
    preferenceMode,
    viewerId,
    viewerRole,
    isViewerAdmin,
  } = workspace;

  const [messages, setMessages] = useState<ClubMessageView[]>(workspace.messages);
  const [replyTo, setReplyTo] = useState<ClubMessageView | null>(() => {
    if (!initialReplyToId) return null;
    return workspace.messages.find((m) => m.id === initialReplyToId) ?? null;
  });

  useEffect(() => {
    setMessages(workspace.messages);
  }, [workspace.messages]);

  useEffect(() => {
    if (!activeChannel.canRead) return;
    let mounted = true;
    let cleanup: (() => void) | undefined;

    try {
      const supabase = createBrowserSupabase();
      const channel = supabase
        .channel(`club-channel-${activeChannel.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'club_messages',
            filter: `channel_id=eq.${activeChannel.id}`,
          },
          (payload) => {
            if (!mounted) return;
            const row = payload.new as {
              id?: string;
              channel_id?: string;
              author_id?: string | null;
              content?: string;
              reply_to_id?: string | null;
              video_sec?: number | null;
              version?: number;
              created_at?: string;
              edited_at?: string | null;
              deleted_at?: string | null;
            };
            if (!row?.id || row.deleted_at) return;
            setMessages((prev) => {
              if (prev.some((m) => m.id === row.id)) return prev;
              return [
                ...prev,
                {
                  id: row.id!,
                  channelId: row.channel_id ?? activeChannel.id,
                  authorId: row.author_id ?? null,
                  authorName: 'Leitor(a) da comunidade',
                  authorUsername: null,
                  authorAvatarUrl: null,
                  content: row.content ?? '',
                  replyToId: row.reply_to_id ?? null,
                  videoSec: row.video_sec ?? null,
                  version: row.version ?? 1,
                  createdAt: row.created_at ?? new Date().toISOString(),
                  editedAt: row.edited_at ?? null,
                },
              ];
            });
          },
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'club_messages',
            filter: `channel_id=eq.${activeChannel.id}`,
          },
          (payload) => {
            if (!mounted) return;
            const row = payload.new as {
              id?: string;
              content?: string;
              version?: number;
              edited_at?: string | null;
              deleted_at?: string | null;
            };
            if (!row?.id) return;
            if (row.deleted_at) {
              setMessages((prev) => prev.filter((m) => m.id !== row.id));
              return;
            }
            setMessages((prev) =>
              prev.map((m) =>
                m.id === row.id
                  ? {
                      ...m,
                      content: row.content ?? m.content,
                      version: row.version ?? m.version,
                      editedAt: row.edited_at ?? m.editedAt,
                    }
                  : m,
              ),
            );
          },
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'club_messages',
            filter: `channel_id=eq.${activeChannel.id}`,
          },
          (payload) => {
            if (!mounted) return;
            const oldRow = payload.old as { id?: string };
            if (!oldRow?.id) return;
            setMessages((prev) => prev.filter((m) => m.id !== oldRow.id));
          },
        )
        .subscribe();

      cleanup = () => {
        void supabase.removeChannel(channel);
      };
    } catch {
      // Realtime fallback
    }

    return () => {
      mounted = false;
      cleanup?.();
    };
  }, [activeChannel.canRead, activeChannel.id]);

  const handleMessageSent = (sent: ClubMessageView) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === sent.id)) return prev;
      return [...prev, sent];
    });
  };

  const handleMessageUpdated = (id: string, content: string, newVersion: number) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id
          ? { ...m, content, version: newVersion, editedAt: new Date().toISOString() }
          : m,
      ),
    );
  };

  const handleMessageDeleted = (id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  };

  const handleAuthorBlocked = (authorId: string) => {
    setMessages((prev) => prev.filter((m) => m.authorId !== authorId));
  };

  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [hasMoreEarlier, setHasMoreEarlier] = useState(workspace.messages.length >= 20);
  const [earlierError, setEarlierError] = useState<string | null>(null);

  const handleLoadEarlier = async () => {
    if (loadingEarlier || messages.length === 0) return;
    setLoadingEarlier(true);
    setEarlierError(null);
    const oldest = messages[0];
    try {
      const supabase = createBrowserSupabase();
      const pageSize = 30;
      const { data, error } = await supabase.rpc('list_club_messages', {
        p_channel: activeChannel.id,
        p_before_created_at: oldest.createdAt,
        p_before_id: oldest.id,
        p_limit: pageSize + 1,
      });

      if (error) {
        setEarlierError('Não foi possível carregar as mensagens anteriores. Tente novamente.');
        return;
      }

      if (Array.isArray(data)) {
        const { messages: merged, hasMore } = paginateEarlierMessages(
          messages,
          data as Array<Record<string, unknown>>,
          pageSize,
        );
        setHasMoreEarlier(hasMore);
        setMessages(merged);
      }
    } catch {
      setEarlierError('Erro de conexão ao carregar mensagens anteriores.');
    } finally {
      setLoadingEarlier(false);
    }
  };

  const isMember = Boolean(viewerRole);

  return (
    <div className="channel-chat-panel">
      <header className="channel-chat-header">
        <div>
          <span className="eyebrow">
            {activeChannel.spoilerPolicy === 'whole_book'
              ? 'Spoilers liberados'
              : activeChannel.spoilerPolicy === 'chapter'
                ? 'Discussão de capítulo'
                : 'Canal sem spoilers'}
          </span>
          <h1>#{activeChannel.displayName}</h1>
        </div>
        <div className="channel-chat-header-controls">
          {viewerId && isMember && (
            <ChannelPreferencesControl
              channelId={activeChannel.id}
              clubSlug={club.slug}
              channelSlug={activeChannel.slug}
              initialMode={preferenceMode}
            />
          )}
          {activeChannel.spoilerPolicy === 'whole_book' && activeChannel.hasConsent && (
            <RevokeSpoilerConsentButton
              channelId={activeChannel.id}
              clubSlug={club.slug}
              channelSlug={activeChannel.slug}
            />
          )}
        </div>
      </header>

      {prompts.length > 0 && activeChannel.canRead && (
        <section className="channel-prompts-banner" aria-label="Perguntas guia do canal">
          <span className="eyebrow">Perguntas para aquecer a conversa</span>
          <ul className="channel-prompts-list">
            {prompts.map((p) => (
              <li key={p.id}>{p.body}</li>
            ))}
          </ul>
        </section>
      )}

      {!activeChannel.canRead ? (
        activeChannel.accessReason === 'consent_required' ||
        (!activeChannel.hasConsent && activeChannel.spoilerPolicy !== 'none') ? (
          viewerId ? (
            <SpoilerConsentGate
              channelId={activeChannel.id}
              channelName={activeChannel.displayName}
              rulesVersion={activeChannel.rulesVersion}
              clubSlug={club.slug}
              channelSlug={activeChannel.slug}
            />
          ) : (
            <div className="member-card">
              <h2>Entre para aceitar o aviso de spoilers</h2>
              <p>
                Este canal permite spoilers de toda a obra. Faça login para registrar seu aceite e
                participar da conversa.
              </p>
              <div className="empty-actions">
                <Link
                  className="button button-small"
                  href={`/entrar?redirect=${encodeURIComponent(
                    `/clubes/${club.slug}/canais/${activeChannel.slug}`,
                  )}`}
                >
                  Entrar na conta
                </Link>
              </div>
            </div>
          )
        ) : activeChannel.accessReason === 'chapter_unread' ? (
          <div className="member-card">
            <span className="eyebrow">Proteção de leitura</span>
            <h2>Conclua a leitura deste capítulo primeiro</h2>
            <p>
              Para evitar spoilers antes da hora, complete a leitura deste capítulo antes de acessar
              a conversa com os outros leitores.
            </p>
            <div className="empty-actions">
              {activeChannel.chapterId ? (
                <Link className="button button-small" href={`/capitulos/${activeChannel.chapterId}`}>
                  Abrir capítulo
                </Link>
              ) : workspace.book ? (
                <Link className="button button-small" href={`/livros/${workspace.book.slug}`}>
                  Voltar para o livro
                </Link>
              ) : null}
            </div>
          </div>
        ) : activeChannel.accessReason === 'chapter_locked' ? (
          <div className="member-card">
            <span className="eyebrow">Proteção de leitura</span>
            <h2>Este capítulo ainda está bloqueado para você</h2>
            <p>
              Avance na leitura da temporada e desbloqueie o capítulo para conversar com quem já
              chegou até esta parte da história.
            </p>
            <div className="empty-actions">
              {workspace.book && (
                <Link className="button button-small" href={`/livros/${workspace.book.slug}`}>
                  Voltar para o livro
                </Link>
              )}
            </div>
          </div>
        ) : activeChannel.accessReason === 'banned' ? (
          <div className="member-card" role="alert">
            <h2>Acesso suspenso neste clube</h2>
            <p>Sua participação neste clube foi suspensa pela moderação.</p>
          </div>
        ) : (
          <div className="member-card">
            <h2>Canal exclusivo para membros do clube</h2>
            <p>Participe do clube para visualizar e enviar mensagens neste canal.</p>
          </div>
        )
      ) : (
        <>
          {hasMoreEarlier && (
            <div style={{ textAlign: 'center', margin: '8px 0 16px' }}>
              <button
                type="button"
                className="button button-small button-quiet"
                disabled={loadingEarlier}
                onClick={handleLoadEarlier}
              >
                {loadingEarlier ? 'Carregando anteriores…' : '↑ Carregar mensagens anteriores'}
              </button>
              {earlierError && (
                <p className="field-error" style={{ marginTop: '6px' }}>
                  {earlierError}
                </p>
              )}
            </div>
          )}
          <MessageList
            messages={messages}
            clubId={club.id}
            clubSlug={club.slug}
            channelSlug={activeChannel.slug}
            chapterId={activeChannel.chapterId}
            viewerId={viewerId}
            viewerRole={viewerRole}
            isViewerAdmin={isViewerAdmin}
            focusedMessageId={initialFocusMessageId}
            onReply={(msg) => setReplyTo(msg)}
            onMessageUpdated={handleMessageUpdated}
            onMessageDeleted={handleMessageDeleted}
            onAuthorBlocked={handleAuthorBlocked}
          />

          {!viewerId ? (
            <div className="member-card" style={{ marginTop: '1rem' }}>
              <h3>Faça parte desta conversa</h3>
              <p>Entre na sua conta para responder aos leitores e compartilhar suas impressões.</p>
              <div className="empty-actions">
                <Link
                  className="btn btn-primary btn-sm"
                  href={`/entrar?redirect=${encodeURIComponent(
                    `/clubes/${club.slug}/canais/${activeChannel.slug}`,
                  )}`}
                >
                  Entrar para participar
                </Link>
              </div>
            </div>
          ) : !isMember && !isViewerAdmin ? (
            <div className="member-card" style={{ marginTop: '1rem' }}>
              <h3>Entre no grupo para enviar mensagens</h3>
              <p>
                Você está visualizando o canal. Entre no grupo <strong>{club.name}</strong> para
                publicar na conversa.
              </p>
              {!club.isPrivate && (
                <JoinClubInlineButton clubId={club.id} />
              )}
            </div>
          ) : (
            <MessageComposer
              channelId={activeChannel.id}
              replyToMessage={replyTo}
              initialVideoSec={initialVideoSec}
              onClearReply={() => setReplyTo(null)}
              onMessageSent={handleMessageSent}
            />
          )}
        </>
      )}
    </div>
  );
}

function JoinClubInlineButton({ clubId }: { clubId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoin = async () => {
    setBusy(true);
    setError(null);
    const res = await joinClub({ clubId });
    setBusy(false);
    if (res.ok) {
      window.location.reload();
    } else {
      setError(res.message);
    }
  };

  return (
    <div style={{ marginTop: '0.75rem' }}>
      <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void handleJoin()}>
        {busy ? 'Entrando no grupo…' : 'Entrar no grupo e conversar'}
      </button>
      {error && (
        <p className="field-hint" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
