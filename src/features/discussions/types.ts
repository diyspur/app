import type { ChannelAccessReason } from './access';

export type ChannelKind = 'no_spoilers' | 'full_spoilers' | 'chapter' | 'topic';
export type SpoilerPolicy = 'none' | 'whole_book' | 'chapter';
export type ChannelPreferenceMode = 'muted' | 'mentions' | 'following';
export type ClubMemberRole = 'owner' | 'moderator' | 'member';

export interface ClubChannelDirectoryEntry {
  id: string;
  slug: string;
  kind: ChannelKind;
  displayName: string;
  chapterId: string | null;
  chapterNumber: number | null;
  seasonNumber: number | null;
  spoilerPolicy: SpoilerPolicy;
  rulesVersion: number;
  canRead: boolean;
  hasConsent: boolean;
  accessReason: ChannelAccessReason;
}

export interface ClubMessageView {
  id: string;
  channelId: string;
  authorId: string | null;
  authorName: string;
  authorUsername: string | null;
  authorAvatarUrl: string | null;
  content: string;
  replyToId: string | null;
  videoSec: number | null;
  version: number;
  createdAt: string;
  editedAt: string | null;
}

export interface ChannelPromptView {
  id: string;
  body: string;
  position: number;
  publishedAt: string;
}

export interface ChannelWorkspaceData {
  club: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    kind: 'custom' | 'official';
    isPrivate: boolean;
    officialBookId: string | null;
    currentBookId: string | null;
    currentSeasonId: string | null;
    ownerId: string | null;
    version: number;
  };
  book: {
    id: string;
    slug: string;
    title: string;
  } | null;
  channels: ClubChannelDirectoryEntry[];
  activeChannel: ClubChannelDirectoryEntry;
  messages: ClubMessageView[];
  prompts: ChannelPromptView[];
  preferenceMode: ChannelPreferenceMode;
  viewerId: string | null;
  viewerRole: ClubMemberRole | null;
  isViewerAdmin: boolean;
}
