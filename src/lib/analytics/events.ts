export type AnalyticsEvent =
  | 'page_viewed'
  | 'landing_page_viewed'
  | 'catalog_page_viewed'
  | 'book_detail_viewed'
  | 'club_page_viewed'
  | 'channel_page_viewed'
  | 'meeting_page_viewed'
  | 'reading_goals_viewed'
  | 'journal_page_viewed'
  | 'up_next_page_viewed'
  | 'profile_page_viewed'
  | 'ranking_page_viewed'
  | 'challenges_page_viewed'
  | 'privacy_page_viewed'
  | 'search_performed'
  | 'content_viewed'
  | 'content_shared'
  | 'favorite_added'
  | 'favorite_removed'
  | 'cta_clicked'
  | 'book_added_to_queue'
  | 'book_status_updated'
  | 'season_joined'
  | 'chapter_marked_read'
  | 'discussion_comment_submitted'
  | 'channel_message_sent'
  | 'spoiler_accepted'
  | 'meeting_created'
  | 'meeting_rsvp_changed'
  | 'affiliate_link_clicked'
  | 'share_book_clicked'
  | 'goal_created'
  | 'goal_updated'
  | 'journal_entry_saved'
  | 'poll_voted'
  | 'notification_opened'
  | 'notification_clicked'
  | 'auth_submitted'
  | 'auth_logout_clicked'
  | 'sign_up_started'
  | 'sign_up_completed'
  | 'login_completed'
  | 'onboarding_started'
  | 'onboarding_completed'
  | 'activation_completed'
  | 'return_session_started'
  | 'book_group_opened'
  | 'chapter_discussion_opened'
  | 'channel_spoiler_accepted'
  | 'club_message_sent'
  | 'book_reading_status_changed'
  | 'club_meeting_created'
  | 'notification_bell_opened';

export const ALLOWED_PROPERTIES: Record<AnalyticsEvent, readonly string[]> = {
  // Páginas
  page_viewed: ['page_path', 'page_type', 'referrer'],
  landing_page_viewed: ['page_path', 'page_type', 'source', 'referrer_category', 'referrer'],
  catalog_page_viewed: ['page_path', 'page_type', 'genre', 'sort', 'page', 'search_query'],
  book_detail_viewed: ['page_path', 'page_type', 'book_slug', 'source', 'has_active_club'],
  club_page_viewed: ['page_path', 'page_type', 'club_slug', 'is_member', 'tab'],
  channel_page_viewed: ['page_path', 'page_type', 'club_slug', 'channel_slug', 'has_spoiler_filter'],
  meeting_page_viewed: ['page_path', 'page_type', 'club_slug', 'meeting_id', 'kind'],
  reading_goals_viewed: ['page_path', 'page_type', 'year', 'goals_count'],
  journal_page_viewed: ['page_path', 'page_type', 'book_slug', 'entries_count'],
  up_next_page_viewed: ['page_path', 'page_type', 'queue_length'],
  profile_page_viewed: ['page_path', 'page_type', 'is_self', 'user_id'],
  ranking_page_viewed: ['page_path', 'page_type', 'period', 'genre'],
  challenges_page_viewed: ['page_path', 'page_type', 'challenge_id'],
  privacy_page_viewed: ['page_path', 'page_type', 'section'],

  // Busca e Conteúdo
  search_performed: ['query_length', 'result_count', 'search_scope'],
  content_viewed: ['content_category', 'content_type'],
  content_shared: ['content_type', 'share_channel'],
  favorite_added: ['content_type'],
  favorite_removed: ['content_type'],

  // Cliques Declarativos e Genéricos
  cta_clicked: [
    'cta_id',
    'page_type',
    'placement',
    'text_content',
    'href',
    'target',
    'page_path',
    'element_tag',
    'element_role',
  ],

  // Cliques e Ações de Domínio
  book_added_to_queue: ['book_slug', 'source', 'position', 'cta_id'],
  book_status_updated: ['book_slug', 'status', 'previous_status', 'cta_id'],
  season_joined: ['club_slug', 'season_id', 'source', 'cta_id'],
  chapter_marked_read: ['book_slug', 'chapter_id', 'club_slug', 'progress_percent', 'cta_id'],
  discussion_comment_submitted: ['club_slug', 'discussion_id', 'has_spoiler', 'is_reply', 'cta_id'],
  channel_message_sent: ['club_slug', 'channel_slug', 'is_reply', 'has_video_sec', 'cta_id'],
  spoiler_accepted: ['channel_slug', 'club_slug', 'chapter_id', 'spoiler_policy', 'cta_id'],
  meeting_created: ['club_slug', 'kind', 'spoiler_policy', 'cta_id'],
  meeting_rsvp_changed: ['meeting_id', 'club_slug', 'status', 'previous_status', 'cta_id'],
  affiliate_link_clicked: ['book_slug', 'merchant', 'placement', 'url', 'cta_id'],
  share_book_clicked: ['book_slug', 'share_channel', 'placement', 'cta_id'],
  goal_created: ['goal_type', 'target_count', 'year', 'cta_id'],
  goal_updated: ['goal_id', 'progress', 'target_count', 'cta_id'],
  journal_entry_saved: ['book_slug', 'entry_id', 'has_notes', 'cta_id'],
  poll_voted: ['poll_id', 'option_id', 'club_slug', 'cta_id'],
  notification_opened: ['notification_id', 'kind', 'unread_count', 'cta_id'],
  notification_clicked: ['notification_id', 'kind', 'unread', 'cta_url', 'cta_id'],
  auth_submitted: ['auth_method', 'mode', 'success', 'cta_id'],
  auth_logout_clicked: ['source', 'cta_id'],

  // Autenticação e Onboarding legados/compatíveis
  sign_up_started: ['auth_method'],
  sign_up_completed: ['auth_method'],
  login_completed: ['auth_method'],
  onboarding_started: ['step_id'],
  onboarding_completed: ['step_id'],
  activation_completed: ['activation_version'],
  return_session_started: ['session_type'],
  book_group_opened: ['book_slug', 'club_slug', 'source'],
  chapter_discussion_opened: ['chapter_id', 'club_slug', 'channel_slug', 'has_video_sec'],
  channel_spoiler_accepted: ['channel_slug', 'spoiler_policy'],
  club_message_sent: ['club_slug', 'channel_slug', 'is_reply', 'has_video_sec'],
  book_reading_status_changed: ['book_slug', 'status'],
  club_meeting_created: ['club_slug', 'kind', 'spoiler_policy'],
  notification_bell_opened: ['unread_count'],
};

export function sanitizeAnalyticsProperties(
  event: AnalyticsEvent,
  input: Record<string, string | number | boolean | undefined | null>,
): Record<string, string | number | boolean> {
  const allowed = ALLOWED_PROPERTIES[event] ?? [];
  const output: Record<string, string | number | boolean> = {};
  for (const key of allowed) {
    const value = input[key];
    if (typeof value === 'string') output[key] = value.slice(0, 100);
    else if (typeof value === 'number' && Number.isFinite(value)) output[key] = value;
    else if (typeof value === 'boolean') output[key] = value;
  }
  return output;
}
