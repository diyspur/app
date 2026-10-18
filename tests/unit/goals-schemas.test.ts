import { describe, expect, it } from 'vitest';
import { goalSchema } from '@/features/goals/schemas';

describe('reading goals schema (QA-23)', () => {
  it('validates a valid goal setup', () => {
    const result = goalSchema.safeParse({
      year: 2026,
      targetBooks: 12,
      targetPages: 3600,
      targetMinutes: 7200,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.year).toBe(2026);
      expect(result.data.targetBooks).toBe(12);
    }
  });

  it('rejects invalid years and negative targets', () => {
    expect(goalSchema.safeParse({ year: 1999, targetBooks: 5 }).success).toBe(false);
    expect(goalSchema.safeParse({ year: 2026, targetBooks: -1 }).success).toBe(false);
    expect(goalSchema.safeParse({ year: 2026, targetBooks: 0 }).success).toBe(false);
  });

  it('enforces maximum limits aligned with database contract (365 books, 50k pages, 500k minutes)', () => {
    expect(goalSchema.safeParse({ year: 2026, targetBooks: 366 }).success).toBe(false);
    expect(goalSchema.safeParse({ year: 2026, targetPages: 50001 }).success).toBe(false);
    expect(goalSchema.safeParse({ year: 2026, targetMinutes: 500001 }).success).toBe(false);

    expect(goalSchema.safeParse({ year: 2026, targetBooks: 365 }).success).toBe(true);
    expect(goalSchema.safeParse({ year: 2026, targetPages: 50000 }).success).toBe(true);
    expect(goalSchema.safeParse({ year: 2026, targetMinutes: 500000 }).success).toBe(true);
  });
});
