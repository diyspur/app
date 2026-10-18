import { createServerSupabase } from '@/lib/supabase/clients';

export type ReadingGoal = {
  id: string;
  user_id: string;
  title: string;
  year: number;
  target_books: number | null;
  target_pages: number | null;
  target_minutes: number | null;
  version: number;
  archived_at: string | null;
};

export type ReadingGoalProgress = {
  goal_id: string;
  books_done: number;
  pages_done: number;
  minutes_done: number;
  updated_at: string;
};

export type ReadingGoalWithProgress = {
  goal: ReadingGoal;
  progress: ReadingGoalProgress | null;
};

export async function getUserReadingGoals(
  userId: string,
  year = new Date().getFullYear(),
): Promise<{
  goals: ReadingGoalWithProgress[];
  error: boolean;
}> {
  const client = await createServerSupabase();
  const { data: rawGoals, error } = await client
    .from('reading_goals')
    .select('id,user_id,title,year,target_books,target_pages,target_minutes,version,archived_at')
    .eq('user_id', userId)
    .eq('year', year)
    .is('archived_at', null)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (error) return { goals: [], error: true };
  if (!rawGoals || rawGoals.length === 0) return { goals: [], error: false };

  const goalIds = rawGoals.map((g) => g.id);
  const { data: progressRows, error: progressError } = await client
    .from('reading_goal_progress')
    .select('goal_id,books_done,pages_done,minutes_done,updated_at')
    .in('goal_id', goalIds);

  const progressMap = new Map<string, ReadingGoalProgress>();
  if (!progressError && progressRows) {
    for (const row of progressRows) {
      progressMap.set(row.goal_id, row as ReadingGoalProgress);
    }
  }

  const items: ReadingGoalWithProgress[] = rawGoals.map((goal) => ({
    goal: {
      ...goal,
      title: goal.title || 'Minha meta de leitura',
      version: goal.version ?? 1,
      archived_at: goal.archived_at ?? null,
    } as ReadingGoal,
    progress: progressMap.get(goal.id) ?? null,
  }));

  return { goals: items, error: Boolean(progressError) };
}

export async function getUserReadingGoal(userId: string, year = new Date().getFullYear()): Promise<{
  goal: ReadingGoal | null;
  progress: ReadingGoalProgress | null;
  error: boolean;
}> {
  const { goals, error } = await getUserReadingGoals(userId, year);
  if (error) return { goal: null, progress: null, error: true };
  if (goals.length === 0) return { goal: null, progress: null, error: false };
  return {
    goal: goals[0].goal,
    progress: goals[0].progress,
    error: false,
  };
}
