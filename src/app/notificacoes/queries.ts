import 'server-only';

import { createServerSupabase } from '@/lib/supabase/clients';
import type { Database } from '@/types/database';

export type NotificationRow = Pick<
  Database['public']['Tables']['notifications']['Row'],
  'id' | 'kind' | 'payload' | 'created_at' | 'read_at'
>;

export type NotificationPreferencesData = {
  replies: boolean;
  mentions: boolean;
  meetingReminders: boolean;
  channelActivity: boolean;
};

export type NotificationsPageData = {
  userId: string | null;
  notifications: NotificationRow[];
  invitations: { id: string; club_id: string; expires_at: string; created_at: string }[];
  preferences: NotificationPreferencesData;
  total: number;
  page: number;
  totalPages: number;
  error: boolean;
};

const DEFAULT_PREFS: NotificationPreferencesData = {
  replies: true,
  mentions: true,
  meetingReminders: true,
  channelActivity: false,
};

export async function getNotificationsPageData(page: number = 1, limit: number = 20): Promise<NotificationsPageData> {
  try {
    const client = await createServerSupabase();
    const { data: claimsData, error: claimsError } = await client.auth.getClaims();
    const userId = claimsData?.claims?.sub;

    if (claimsError || !userId) {
      return {
        userId: null,
        notifications: [],
        invitations: [],
        preferences: DEFAULT_PREFS,
        total: 0,
        page: 1,
        totalPages: 1,
        error: Boolean(claimsError),
      };
    }

    const safePage = Math.max(1, page);
    const offset = (safePage - 1) * limit;

    const [notifResult, { data: invitations }, { data: prefRow }] = await Promise.all([
      client
        .from('notifications')
        .select('id,kind,payload,created_at,read_at', { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(offset, offset + limit - 1),
      client
        .from('user_club_invitations')
        .select('id,club_id,expires_at,created_at')
        .eq('invited_user_id', userId)
        .is('accepted_at', null)
        .is('revoked_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(20),
      client
        .from('user_notification_preferences')
        .select('replies,mentions,meeting_reminders,channel_activity')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

    if (notifResult.error?.code === 'PGRST103' && safePage > 1) {
      return getNotificationsPageData(1, limit);
    }

    const total = notifResult.count ?? (notifResult.data?.length ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      userId,
      notifications: (notifResult.data ?? []) as NotificationRow[],
      invitations: invitations ?? [],
      preferences: prefRow
        ? {
            replies: prefRow.replies,
            mentions: prefRow.mentions,
            meetingReminders: prefRow.meeting_reminders,
            channelActivity: prefRow.channel_activity,
          }
        : DEFAULT_PREFS,
      total,
      page: safePage,
      totalPages,
      error: Boolean(notifResult.error),
    };
  } catch {
    return {
      userId: null,
      notifications: [],
      invitations: [],
      preferences: DEFAULT_PREFS,
      total: 0,
      page: 1,
      totalPages: 1,
      error: true,
    };
  }
}
