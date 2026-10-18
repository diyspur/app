'use client';

import Link from 'next/link';
import { buildClubChannelHref } from '@/lib/community-navigation';
import type { ClubChannelDirectoryEntry } from '@/features/discussions/types';

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

interface ChannelDirectoryProps {
  clubSlug: string;
  channels: ClubChannelDirectoryEntry[];
  activeChannelSlug?: string;
}

export function ChannelDirectory({
  clubSlug,
  channels,
  activeChannelSlug,
}: ChannelDirectoryProps) {
  const generalChannels = channels.filter(
    (c) => c.kind === 'no_spoilers' || c.kind === 'full_spoilers' || c.kind === 'topic',
  );
  const chapterChannels = channels.filter((c) => c.kind === 'chapter');

  return (
    <nav className="channel-directory" aria-label="Canais do grupo">
      <div className="channel-directory-group">
        <span className="eyebrow">Canais gerais</span>
        <ul className="channel-directory-list">
          {generalChannels.map((ch) => {
            const isActive = ch.slug === activeChannelSlug;
            const badge = badgeForChannel(ch);
            return (
              <li key={ch.id}>
                <Link
                  href={buildClubChannelHref({ clubSlug, channelSlug: ch.slug })}
                  className={`channel-directory-link ${isActive ? 'active' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span className="channel-directory-name">#{ch.displayName}</span>
                  <span className={`channel-policy-pill tone-${badge.tone}`}>{badge.text}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      {chapterChannels.length > 0 && (
        <div className="channel-directory-group">
          <span className="eyebrow">Por capítulo</span>
          <ul className="channel-directory-list">
            {chapterChannels.map((ch) => {
              const isActive = ch.slug === activeChannelSlug;
              const badge = badgeForChannel(ch);
              return (
                <li key={ch.id}>
                  <Link
                    href={buildClubChannelHref({ clubSlug, channelSlug: ch.slug })}
                    className={`channel-directory-link ${isActive ? 'active' : ''} ${
                      !ch.canRead ? 'is-locked' : ''
                    }`}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <span className="channel-directory-name">#{ch.displayName}</span>
                    <span className={`channel-policy-pill tone-${badge.tone}`}>{badge.text}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </nav>
  );
}
