import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/clients';

export async function GET() {
  const client = await createServerSupabase();
  const { data, error } = await client.auth.getClaims();
  const userId = typeof data?.claims?.sub === 'string' ? data.claims.sub : null;

  if (error || !userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const [
      profileRes,
      journalRes,
      listsRes,
      listItemsRes,
      listCollabsRes,
      upNextRes,
      progressRes,
      rsvpsRes,
      clubsRes,
      bookReadingsRes,
      clubMessagesRes,
      quizAttemptsRes,
      achievementsRes,
      channelConsentsRes,
      channelPrefsRes,
      notifPrefsRes,
      goalsRes,
    ] = await Promise.all([
      client
        .from('profiles')
        .select('id,username,display_name,bio,created_at')
        .eq('id', userId)
        .maybeSingle(),
      client
        .from('reading_journal_entries')
        .select('id,book_id,title,body,entry_date,minutes_read,page_from,page_to,is_spoiler,created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(200),
      client
        .from('reading_lists')
        .select('id,slug,title,description,visibility,is_collaborative,created_at')
        .eq('owner_id', userId)
        .limit(50),
      client
        .from('reading_list_items')
        .select('id,list_id,kind,book_id,chapter_id,position,created_at')
        .eq('added_by', userId)
        .limit(500),
      client
        .from('reading_list_collaborators')
        .select('list_id,can_edit,added_at')
        .eq('user_id', userId)
        .limit(100),
      client
        .from('user_up_next')
        .select('book_id,position,added_at')
        .eq('user_id', userId)
        .order('position', { ascending: true })
        .limit(200),
      client
        .from('user_progress')
        .select('chapter_id,percent,updated_at')
        .eq('user_id', userId)
        .limit(200),
      client
        .from('meeting_rsvps')
        .select('meeting_id,attending,created_at')
        .eq('user_id', userId)
        .limit(100),
      client
        .from('user_club_members')
        .select('club_id,role,joined_at')
        .eq('user_id', userId)
        .limit(50),
      client
        .from('user_book_readings')
        .select('book_id,status,source,first_started_at,first_completed_at,completed_at,updated_at')
        .eq('user_id', userId)
        .limit(200),
      client
        .from('club_messages')
        .select('id,channel_id,content,reply_to_id,video_sec,created_at,edited_at')
        .eq('author_id', userId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(500),
      client
        .from('quiz_attempts')
        .select('id,quiz_id,score,passed,created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(200),
      client
        .from('user_achievements')
        .select('achievement_id,unlocked_at')
        .eq('user_id', userId)
        .limit(200),
      client
        .from('club_channel_consents')
        .select('channel_id,rules_version,accepted_at')
        .eq('user_id', userId)
        .limit(100),
      client
        .from('club_channel_preferences')
        .select('channel_id,mode,updated_at')
        .eq('user_id', userId)
        .limit(100),
      client
        .from('user_notification_preferences')
        .select('replies,mentions,meeting_reminders,channel_activity,updated_at')
        .eq('user_id', userId)
        .maybeSingle(),
      client
        .from('reading_goals')
        .select('id,title,year,target_books,target_pages,target_minutes,version,created_at,archived_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    const failedSections: string[] = [];
    if (profileRes.error) failedSections.push('profile');
    if (journalRes.error) failedSections.push('journalEntries');
    if (listsRes.error) failedSections.push('readingLists');
    if (listItemsRes.error) failedSections.push('readingListItems');
    if (listCollabsRes.error) failedSections.push('readingListCollaborations');
    if (upNextRes.error) failedSections.push('upNextQueue');
    if (progressRes.error) failedSections.push('readingProgress');
    if (rsvpsRes.error) failedSections.push('meetingRsvps');
    if (clubsRes.error) failedSections.push('clubMemberships');
    if (bookReadingsRes.error) failedSections.push('bookReadings');
    if (clubMessagesRes.error) failedSections.push('communityMessages');
    if (quizAttemptsRes.error) failedSections.push('quizAttempts');
    if (achievementsRes.error) failedSections.push('achievements');
    if (channelConsentsRes.error) failedSections.push('channelConsents');
    if (channelPrefsRes.error) failedSections.push('channelPreferences');
    if (notifPrefsRes.error) failedSections.push('notificationPreferences');
    if (goalsRes.error) failedSections.push('readingGoals');

    const exportedAt = new Date().toISOString();
    const status = failedSections.length === 0 ? 'complete' : 'partial';

    const payload = {
      manifest: {
        userId,
        exportedAt,
        status,
        failedSections: failedSections.length > 0 ? failedSections : undefined,
        counts: {
          readingGoals: (goalsRes.data ?? []).length,
          journalEntries: (journalRes.data ?? []).length,
          readingLists: (listsRes.data ?? []).length,
          readingListItems: (listItemsRes.data ?? []).length,
          readingListCollaborations: (listCollabsRes.data ?? []).length,
          upNextItems: (upNextRes.data ?? []).length,
          readingProgress: (progressRes.data ?? []).length,
          bookReadings: (bookReadingsRes.data ?? []).length,
          meetingRsvps: (rsvpsRes.data ?? []).length,
          clubMemberships: (clubsRes.data ?? []).length,
          communityMessages: (clubMessagesRes.data ?? []).length,
          quizAttempts: (quizAttemptsRes.data ?? []).length,
          achievements: (achievementsRes.data ?? []).length,
          channelConsents: (channelConsentsRes.data ?? []).length,
          channelPreferences: (channelPrefsRes.data ?? []).length,
        },
        truncated: false,
      },
      exportedAt,
      status,
      failedSections: failedSections.length > 0 ? failedSections : undefined,
      account: {
        id: userId,
        profile: profileRes.data ?? null,
      },
      readingGoals: goalsRes.data ?? [],
      journalEntries: journalRes.data ?? [],
      readingLists: listsRes.data ?? [],
      readingListItems: listItemsRes.data ?? [],
      readingListCollaborations: listCollabsRes.data ?? [],
      upNextQueue: upNextRes.data ?? [],
      readingProgress: progressRes.data ?? [],
      bookReadings: bookReadingsRes.data ?? [],
      meetingRsvps: rsvpsRes.data ?? [],
      clubMemberships: clubsRes.data ?? [],
      communityMessages: clubMessagesRes.data ?? [],
      quizAttempts: quizAttemptsRes.data ?? [],
      achievements: achievementsRes.data ?? [],
      channelConsents: channelConsentsRes.data ?? [],
      channelPreferences: channelPrefsRes.data ?? [],
      notificationPreferences: notifPrefsRes.data ?? null,
    };

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': 'attachment; filename="diyspur-data-export.json"',
        'cache-control': 'private, no-store, max-age=0',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ error: 'failed_to_export' }, { status: 500 });
  }
}
