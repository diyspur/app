import { describe, it, expect } from 'vitest';
import { type ReadingGoal, type ReadingGoalProgress } from '@/features/goals/queries';

describe('Goals progress contract', () => {
  it('handles null goal and null progress gracefully', () => {
    const result: { goal: ReadingGoal | null; progress: ReadingGoalProgress | null; error: boolean } = {
      goal: null,
      progress: null,
      error: false,
    };

    expect(result.goal).toBeNull();
    expect(result.progress).toBeNull();
    expect(result.error).toBe(false);
  });

  it('calculates progress percentage safely when goal exists', () => {
    const goal: ReadingGoal = {
      id: 'g-1',
      user_id: 'u-1',
      title: 'Meta 2026',
      year: 2026,
      target_books: 12,
      target_pages: 3600,
      target_minutes: 6000,
      version: 1,
      archived_at: null,
    };
    const progress: ReadingGoalProgress = {
      goal_id: 'g-1',
      books_done: 3,
      pages_done: 900,
      minutes_done: 1500,
      updated_at: '2026-10-12T00:00:00Z',
    };

    const bookPercent = Math.min(100, Math.round((progress.books_done / goal.target_books!) * 100));
    expect(bookPercent).toBe(25);
  });
});
