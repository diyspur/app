import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { createServerSupabase } from '@/lib/supabase/clients';
import { getClubChannelDirectory } from '@/features/discussions/queries';
import type { ClubChannelDirectoryEntry } from '@/features/discussions/types';
import { buildClubHref, buildClubChannelHref } from '@/lib/community-navigation';

export const metadata: Metadata = {
  title: 'Comunidade de Leitura e Clubes | DIYSPUR',
  description: 'Lista de clubes de leitura, salas de discussão e canais de chat por livro e capítulo.',
  alternates: { canonical: '/comunidade' },
};

function badgeForChannel(channel: ClubChannelDirectoryEntry): {
  text: string;
  tone: 'safe' | 'spoiler' | 'locked';
} {
  if (!channel.canRead) {
    if (channel.accessReason === 'consent_required') {
      return { text: 'Requer aceite', tone: 'spoiler' };
    }
    if (channel.accessReason === 'chapter_unread') {
      return { text: 'Não lido', tone: 'locked' };
    }
    return { text: 'Bloqueado', tone: 'locked' };
  }
  if (channel.spoilerPolicy === 'whole_book') {
    return { text: 'Spoiler total', tone: 'spoiler' };
  }
  if (channel.spoilerPolicy === 'chapter') {
    return { text: 'Cap. liberado', tone: 'safe' };
  }
  return { text: 'Sem spoiler', tone: 'safe' };
}

function channelIcon(channel: ClubChannelDirectoryEntry): string {
  if (channel.spoilerPolicy === 'whole_book') return '⚠️';
  if (channel.kind === 'chapter') return '📖';
  return '💬';
}

export default async function CommunityPage() {
  let clubsWithChannels: Array<{
    id: string;
    slug: string;
    name: string;
    description: string | null;
    kind: string;
    is_private: boolean;
    official_book_id: string | null;
    books?: {
      id: string;
      slug: string;
      title: string;
      cover_url: string | null;
      synopsis: string | null;
    } | null;
    channels: ClubChannelDirectoryEntry[];
  }> = [];
  let hasError = false;

  try {
    const client = await createServerSupabase();
    const { data, error } = await client
      .from('user_clubs')
      .select('id,slug,name,description,kind,is_private,official_book_id,books!user_clubs_official_book_id_fkey(id,slug,title,cover_url,synopsis)')
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(36);

    if (error) {
      console.error('Community directory query failed', error.code);
      hasError = true;
    } else {
      const clubsList = (data ?? []).map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        description: c.description,
        kind: c.kind,
        is_private: c.is_private,
        official_book_id: c.official_book_id,
        books: Array.isArray(c.books) ? c.books[0] : c.books,
      }));

      // Busca os canais para cada clube em paralelo
      clubsWithChannels = await Promise.all(
        clubsList.map(async (club) => {
          const channels = await getClubChannelDirectory(club.id);
          return {
            ...club,
            channels,
          };
        })
      );
    }
  } catch (error) {
    console.error('Community directory unavailable', error instanceof Error ? error.name : 'unknown_error');
    hasError = true;
  }

  return (
    <section className="container">
      <header className="page-intro">
        <span className="eyebrow">Comunidade DIYSPUR</span>
        <h1>Clubes e Canais de Discussão</h1>
        <p>
          Encontre seu clube de leitura e participe dos chats temáticos e por capítulo.
          Tudo com proteção inteligente contra spoilers para acompanhar o seu ritmo.
        </p>
        <div style={{ marginTop: '16px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Link className="button button-small" href="/clubes/novo">
            Criar um clube
          </Link>
          <Link className="button button-quiet button-small" href="/livros">
            Explorar livros
          </Link>
        </div>
      </header>

      {hasError ? (
        <div className="notice" role="alert" style={{ marginBlock: '24px' }}>
          Não foi possível carregar os clubes no momento. Tente novamente mais tarde.
        </div>
      ) : clubsWithChannels.length === 0 ? (
        <div className="empty-state">
          <h2>Nenhum clube aberto ainda.</h2>
          <p>Seja o primeiro a abrir um clube de leitura para a comunidade.</p>
          <div style={{ marginTop: '16px' }}>
            <Link className="button button-dark button-small" href="/livros">
              Explorar catálogo de livros
            </Link>
          </div>
        </div>
      ) : (
        <div className="community-clubs-grid">
          {clubsWithChannels.map((club) => {
            const book = club.books;
            return (
              <article className="club-community-card" key={club.id}>
                <div className="club-community-header">
                  {book?.cover_url ? (
                    <div className="club-community-cover">
                      <Image
                        src={book.cover_url}
                        alt={book.title}
                        width={72}
                        height={108}
                        style={{ objectFit: 'cover' }}
                      />
                    </div>
                  ) : (
                    <div className="club-community-cover" style={{ display: 'grid', placeItems: 'center', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                      Clube
                    </div>
                  )}

                  <div className="club-community-info">
                    <div className="club-community-badges">
                      {club.kind === 'official' ? (
                        <span className="status-pill">Oficial</span>
                      ) : (
                        <span className="status-pill neutral">{club.is_private ? 'Privado' : 'Público'}</span>
                      )}
                    </div>

                    <h3 className="club-community-title">
                      <Link href={buildClubHref(club.slug)}>{club.name}</Link>
                    </h3>

                    {book && (
                      <p className="field-hint" style={{ margin: '0 0 6px' }}>
                        Leitura: <Link className="text-link" href={`/livros/${book.slug}`}>{book.title}</Link>
                      </p>
                    )}

                    {club.description ? (
                      <p className="club-community-desc">{club.description}</p>
                    ) : book?.synopsis ? (
                      <p className="club-community-desc">{book.synopsis}</p>
                    ) : null}

                    <div style={{ marginTop: '10px' }}>
                      <Link className="button button-small button-dark" href={buildClubHref(club.slug)}>
                        Entrar no clube →
                      </Link>
                    </div>
                  </div>
                </div>

                {/* Lista de Chats / Canais dentro do clube */}
                <div className="club-chats-section">
                  <div className="club-chats-header">
                    <span className="eyebrow">Canais de conversa ({club.channels.length})</span>
                    <Link href={buildClubHref(club.slug)} className="text-link" style={{ fontSize: '12px' }}>
                      Ver todos
                    </Link>
                  </div>

                  {club.channels.length === 0 ? (
                    <p className="field-hint" style={{ margin: 0 }}>
                      Nenhum canal aberto ainda neste clube.
                    </p>
                  ) : (
                    <ul className="club-chats-list">
                      {club.channels.slice(0, 5).map((channel) => {
                        const badge = badgeForChannel(channel);
                        const icon = channelIcon(channel);
                        return (
                          <li key={channel.id}>
                            <Link
                              href={buildClubChannelHref({ clubSlug: club.slug, channelSlug: channel.slug })}
                              className="club-chat-item-link"
                            >
                              <div className="club-chat-item-left">
                                <span className="club-chat-icon" aria-hidden="true">{icon}</span>
                                <span className="club-chat-name">#{channel.displayName}</span>
                              </div>
                              <span className={`channel-policy-pill tone-${badge.tone}`}>
                                {badge.text}
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                      {club.channels.length > 5 && (
                        <li>
                          <Link
                            href={buildClubHref(club.slug)}
                            className="field-hint text-link"
                            style={{ display: 'block', textAlign: 'center', padding: '6px', fontSize: '12px' }}
                          >
                            + {club.channels.length - 5} outros canais no clube
                          </Link>
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
