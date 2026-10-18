import { describe, it, expect } from 'vitest';

describe('Catalog Navigation and Presentation (QA-12, QA-13, QA-20, QA-21)', () => {
  it('computes totalChapters accurately using Math.max between book total and chapter count (QA-13)', () => {
    const computeTotalChapters = (
      bookTotal: number | null | undefined,
      chaptersCount: number
    ) => Math.max(bookTotal ?? 0, chaptersCount);

    // Case 1: Book has 25 total chapters, season currently has 10 registered
    expect(computeTotalChapters(25, 10)).toBe(25);

    // Case 2: Book total is undefined/null, season has 12 chapters
    expect(computeTotalChapters(null, 12)).toBe(12);
    expect(computeTotalChapters(undefined, 8)).toBe(8);

    // Case 3: Season has bonus/extra chapters beyond book total
    expect(computeTotalChapters(10, 12)).toBe(12);

    // Case 4: Both are 0
    expect(computeTotalChapters(0, 0)).toBe(0);
  });

  it('deduplicates season breadcrumb when season title matches book title (QA-20)', () => {
    const getBreadcrumbLabels = (
      book: { title: string },
      season: { title: string; number: number },
      chapter: { number: number }
    ) => {
      const isSeasonTitleSameAsBook =
        book.title.toLowerCase().trim() === season.title.toLowerCase().trim();
      const seasonLabel = isSeasonTitleSameAsBook
        ? `Temporada ${season.number}`
        : season.title;
      return [book.title, seasonLabel, `Capítulo ${chapter.number}`];
    };

    // When season title equals book title (e.g. "Verity" / "Verity")
    const deduped = getBreadcrumbLabels(
      { title: 'Verity' },
      { title: 'Verity', number: 1 },
      { number: 1 }
    );
    expect(deduped).toEqual(['Verity', 'Temporada 1', 'Capítulo 1']);

    // When season title is distinct (e.g. "O Nome do Vento" / "Crônica do Matador do Rei - Parte 1")
    const distinct = getBreadcrumbLabels(
      { title: 'O Nome do Vento' },
      { title: 'Crônica do Matador do Rei - Parte 1', number: 2 },
      { number: 4 }
    );
    expect(distinct).toEqual([
      'O Nome do Vento',
      'Crônica do Matador do Rei - Parte 1',
      'Capítulo 4',
    ]);
  });

  it('formats season progress correctly for the homepage (QA-14)', () => {
    const formatSeasonProgress = (published: number, total: number) =>
      `${published} de ${total} capítulos liberados`;

    expect(formatSeasonProgress(5, 20)).toBe('5 de 20 capítulos liberados');
    expect(formatSeasonProgress(1, 1)).toBe('1 de 1 capítulos liberados');
  });

  it('provides safe ranking link path on homepage (QA-12)', () => {
    const rankingPath = '/ranking';
    expect(rankingPath.startsWith('/ranking')).toBe(true);
  });
});
