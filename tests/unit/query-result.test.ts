import { describe, it, expect } from 'vitest';
import { querySuccess, queryFailure, type QueryResult } from '@/lib/queries/result';

describe('QueryResult Pattern (QA-15)', () => {
  it('creates successful result with data', () => {
    const res: QueryResult<string[]> = querySuccess(['book-1', 'book-2']);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toEqual(['book-1', 'book-2']);
    }
  });

  it('creates failure result with specific honest error code', () => {
    const res: QueryResult<string[]> = queryFailure('unavailable');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('unavailable');
    }
  });

  it('distinguishes empty collection from failure', () => {
    const emptySuccess = querySuccess([]);
    const failure = queryFailure('unavailable');

    expect(emptySuccess.ok).toBe(true);
    expect(failure.ok).toBe(false);
  });
});
