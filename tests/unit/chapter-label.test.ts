import { describe, it, expect } from 'vitest';
import { cleanChapterTitle, chapterLabel } from '@/lib/chapter-label';

describe('Chapter Label & Title Cleaning (QA-10)', () => {
  it('strips redundant "Capítulo X — " prefix from chapter title', () => {
    expect(cleanChapterTitle('Capítulo 1 — O Início', 1)).toBe('O Início');
    expect(cleanChapterTitle('Capítulo 02: A Descoberta', 2)).toBe('A Descoberta');
    expect(cleanChapterTitle('Capítulo 3 - Encontro', 3)).toBe('Encontro');
    expect(cleanChapterTitle('Capítulo 4 · Conclusão', 4)).toBe('Conclusão');
    expect(cleanChapterTitle('Cap. 5: Epílogo', 5)).toBe('Epílogo');
  });

  it('preserves clean title without prefix', () => {
    expect(cleanChapterTitle('O Início', 1)).toBe('O Início');
    expect(cleanChapterTitle('Primeiras Impressões')).toBe('Primeiras Impressões');
  });

  it('handles titles that are just chapter number or empty', () => {
    expect(cleanChapterTitle('Capítulo 1', 1)).toBe('Capítulo 1');
    expect(cleanChapterTitle('', 1)).toBe('');
  });

  it('formats chapterLabel cleanly without duplicating chapter number', () => {
    expect(chapterLabel('Capítulo 1 — O Início', 1)).toBe('Capítulo 1 · O Início');
    expect(chapterLabel('O Início', 1)).toBe('Capítulo 1 · O Início');
    expect(chapterLabel('Capítulo 1', 1)).toBe('Capítulo 1');
    expect(chapterLabel('Capítulo 2: A Volta', 2)).toBe('Capítulo 2 · A Volta');
  });

  it('deduplicates titles already containing redundant chapter prefixes (QA-06)', () => {
    expect(cleanChapterTitle('Capítulo 1: Capítulo 1 — O Início', 1)).toBe('O Início');
    expect(chapterLabel('Capítulo 1: Capítulo 1 — O Início', 1)).toBe('Capítulo 1 · O Início');
    expect(chapterLabel('Capítulo 1 — O Início', 1)).toBe('Capítulo 1 · O Início');
    expect(chapterLabel('Capítulo 1: O Início', 1)).toBe('Capítulo 1 · O Início');
  });
});
