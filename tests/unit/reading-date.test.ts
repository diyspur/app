import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { localDateInputValue, readingYearInSaoPaulo } from '@/lib/reading-date';

describe('Reading date civil timezone handling (QA-21)', () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = 'America/Sao_Paulo';
  });

  afterEach(() => {
    if (originalTz !== undefined) {
      process.env.TZ = originalTz;
    } else {
      delete process.env.TZ;
    }
  });

  it('formats local civil date correctly for 22h30 in Brasília on Oct 31 (UTC Nov 01)', () => {
    // 2026-10-31 22:30 in America/Sao_Paulo is 2026-11-01 01:30 UTC
    const date = new Date('2026-11-01T01:30:00Z');

    // Demonstrating the bug in UTC:
    expect(date.toISOString().slice(0, 10)).toBe('2026-11-01');

    // The fixed local date helper returns the civil reading date in Brazil:
    const localStr = localDateInputValue(date);
    expect(localStr).toBe('2026-10-31');
  });

  it('formats local civil date with zero-padded month and day', () => {
    const singleDigitDate = new Date('2026-05-04T15:00:00Z');
    expect(localDateInputValue(singleDigitDate)).toBe('2026-05-04');
  });

  it('returns valid YYYY-MM-DD for default argument (now)', () => {
    const todayStr = localDateInputValue();
    expect(todayStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('resolves readingYearInSaoPaulo accurately on New Year eve late evening', () => {
    // 2026-12-31 23:30 in America/Sao_Paulo is 2027-01-01 02:30 UTC
    const newYearEve = new Date('2027-01-01T02:30:00Z');

    expect(newYearEve.getUTCFullYear()).toBe(2027);
    expect(readingYearInSaoPaulo(newYearEve)).toBe(2026);
  });
});
