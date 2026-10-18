import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as tf from '@tensorflow/tfjs';
import type { Book } from '@/features/catalog/queries';
import type { BookReadingStatus } from '@/features/reading/schemas';
import type { RecommendationOptions } from '@/features/recommendations/types';
import {
  computeTensorFlowRecommendations,
  rankCatalogBooks,
} from '@/features/recommendations/tensorflow-recommender';
import {
  computeCosineSimilarity,
  computeNativeRecommendations,
  rankCatalogBooksNative,
} from '@/features/recommendations/native-recommender';
import {
  rankCatalog,
  getRecommenderBackend,
} from '@/features/recommendations/recommender-engine';

describe('Native JS vs TensorFlow.js Recommender Engine Benchmark & Equivalence', () => {
  const author1 = '11111111-1111-1111-1111-111111111111';
  const author2 = '22222222-2222-2222-2222-222222222222';
  const author3 = '33333333-3333-3333-3333-333333333333';
  const author4 = '44444444-4444-4444-4444-444444444444';

  const mockBook = (
    id: string,
    title: string,
    author_id: string,
    tags: string[] | null,
  ): Book => ({
    id,
    title,
    slug: title.toLowerCase().replace(/\s+/g, '-'),
    author_id,
    cover_url: null,
    isbn13: null,
    language: 'pt-BR',
    synopsis: `Sinopse de ${title}`,
    total_chapters: 20,
    total_pages: 300,
    publication_year: 2024,
    tags,
    amazon_url: null,
    publisher: null,
    translator: null,
    publication_date: null,
    content_rating: null,
    edition_number: 1,
    format: 'Capa comum',
    width_mm: 140,
    height_mm: 210,
    depth_mm: 15,
  });

  const catalog: Book[] = [
    mockBook('b-1', 'Verity', author1, ['Suspense', 'Thriller', 'Psicológico']),
    mockBook('b-2', 'A Garota no Trem', author2, ['Suspense', 'Mistério']),
    mockBook('b-3', 'It: A Coisa', author3, ['Terror', 'Sobrenatural']),
    mockBook('b-4', 'Orgulho e Preconceito', author2, ['Romance', 'Clássico']),
    mockBook('b-5', 'Gothic Mystery', author1, ['Suspense', 'Gótico']),
    mockBook('b-6', 'O Iluminado', author3, ['Terror', 'Psicológico', 'Clássico']),
    mockBook('b-7', 'Duna', author4, ['Ficção Científica', 'Aventura']),
    mockBook('b-8', 'Neuromancer', author4, ['Ficção Científica', 'Cyberpunk']),
    mockBook('b-9', 'Emma', author2, ['Romance', 'Clássico', 'Comédia']),
    mockBook('b-10', 'Sem Tags', author1, null),
    mockBook('b-11', 'Tags Vazias', author3, []),
    mockBook('b-12', 'Outro Thriller', author1, ['Thriller', 'Mistério']),
  ];

  beforeEach(() => {
    tf.engine().startScope();
    tf.engine().endScope();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('computeCosineSimilarity Unit Tests', () => {
    it('returns 1.0 for identical non-zero vectors', () => {
      const vec = [1.0, 2.0, 0.5];
      const similarity = computeCosineSimilarity(vec, vec);
      expect(Math.abs(similarity - 1.0)).toBeLessThan(1e-7);
    });

    it('returns 1.0 for scalar multiple vectors (same direction)', () => {
      const vecA = [1.0, 2.0, 3.0];
      const vecB = [2.0, 4.0, 6.0];
      const similarity = computeCosineSimilarity(vecA, vecB);
      expect(Math.abs(similarity - 1.0)).toBeLessThan(1e-7);
    });

    it('returns 0 for orthogonal vectors', () => {
      const vecA = [1.0, 0.0, 0.0];
      const vecB = [0.0, 1.0, 0.0];
      const similarity = computeCosineSimilarity(vecA, vecB);
      expect(similarity).toBe(0);
    });

    it('returns 0 when either vector is all zeros without NaN or division by zero', () => {
      const vecA = [0.0, 0.0, 0.0];
      const vecB = [1.0, 2.0, 3.0];
      expect(computeCosineSimilarity(vecA, vecB)).toBe(0);
      expect(computeCosineSimilarity(vecB, vecA)).toBe(0);
      expect(computeCosineSimilarity(vecA, vecA)).toBe(0);
    });

    it('handles empty vectors safely returning 0', () => {
      expect(computeCosineSimilarity([], [])).toBe(0);
    });
  });

  describe('Parameterized Numerical Equivalence: computeNativeRecommendations vs computeTensorFlowRecommendations', () => {
    const scenarios: Array<{
      name: string;
      candidates: Book[];
      historyBooks: { book: Book; status: 'read' | 'reading' }[];
      options?: RecommendationOptions;
    }> = [
      {
        name: 'Single read book with shared tags and authors',
        candidates: [catalog[1], catalog[2], catalog[3], catalog[4], catalog[5]],
        historyBooks: [{ book: catalog[0], status: 'read' }],
      },
      {
        name: 'Mixed read and reading books with custom weights',
        candidates: [catalog[0], catalog[4], catalog[6], catalog[7], catalog[11]],
        historyBooks: [
          { book: catalog[1], status: 'reading' },
          { book: catalog[3], status: 'read' },
        ],
        options: {
          readingWeight: 1.5,
          readWeight: 0.9,
          recommendationThreshold: 0.2,
        },
      },
      {
        name: 'Multiple history books with strong author affinity',
        candidates: [catalog[3], catalog[8], catalog[6], catalog[7]],
        historyBooks: [
          { book: catalog[1], status: 'read' },
          { book: catalog[4], status: 'reading' },
        ],
      },
      {
        name: 'Browser interactions only (click and view signals)',
        candidates: [catalog[0], catalog[1], catalog[4], catalog[6]],
        historyBooks: [],
        options: {
          interactions: [
            {
              bookId: catalog[2].id,
              slug: catalog[2].slug,
              title: catalog[2].title,
              tags: catalog[2].tags,
              author_id: catalog[2].author_id,
              timestamp: Date.now(),
              type: 'click',
            },
            {
              bookId: catalog[5].id,
              slug: catalog[5].slug,
              title: catalog[5].title,
              tags: catalog[5].tags,
              author_id: catalog[5].author_id,
              timestamp: Date.now(),
              type: 'view',
            },
          ],
        },
      },
      {
        name: 'Combined reading history and browser interactions',
        candidates: [catalog[2], catalog[5], catalog[6], catalog[7], catalog[8]],
        historyBooks: [{ book: catalog[0], status: 'read' }],
        options: {
          interactions: [
            {
              bookId: catalog[1].id,
              slug: catalog[1].slug,
              title: catalog[1].title,
              tags: catalog[1].tags,
              author_id: catalog[1].author_id,
              timestamp: Date.now(),
              type: 'click',
            },
          ],
          interactionWeight: 0.75,
        },
      },
      {
        name: 'Books with null or empty tags and disconnected vocabulary',
        candidates: [catalog[9], catalog[10], catalog[6]],
        historyBooks: [{ book: catalog[0], status: 'read' }],
      },
      {
        name: 'Empty candidates returns empty map',
        candidates: [],
        historyBooks: [{ book: catalog[0], status: 'read' }],
      },
      {
        name: 'Empty history and interactions returns empty map',
        candidates: [catalog[0], catalog[1]],
        historyBooks: [],
      },
    ];

    it.each(scenarios)('$name: matches TensorFlow scores within 1e-5 precision', ({ candidates, historyBooks, options }) => {
      const tfScores = computeTensorFlowRecommendations(candidates, historyBooks, options);
      const nativeScores = computeNativeRecommendations(candidates, historyBooks, options);

      expect(nativeScores.size).toBe(tfScores.size);

      for (const candidate of candidates) {
        const tfScore = tfScores.get(candidate.id) ?? 0;
        const nativeScore = nativeScores.get(candidate.id) ?? 0;
        const diff = Math.abs(nativeScore - tfScore);

        expect(diff).toBeLessThanOrEqual(1e-5);
      }
    });
  });

  describe('Parameterized 100% Identical Ranking Order: rankCatalogBooksNative vs rankCatalogBooks', () => {
    const rankingScenarios: Array<{
      name: string;
      books: Book[];
      userReadings?: Map<string, BookReadingStatus> | null;
      options?: RecommendationOptions;
    }> = [
      {
        name: 'Standard user with read and reading books',
        books: catalog,
        userReadings: new Map<string, BookReadingStatus>([
          ['b-1', 'read'],
          ['b-2', 'reading'],
        ]),
      },
      {
        name: 'User with DNF, reading, read, and want_to_read statuses',
        books: catalog,
        userReadings: new Map<string, BookReadingStatus>([
          ['b-1', 'read'],
          ['b-2', 'reading'],
          ['b-3', 'dnf'],
          ['b-4', 'want_to_read'],
        ]),
      },
      {
        name: 'Guest user (null readings)',
        books: catalog,
        userReadings: null,
      },
      {
        name: 'Guest user with empty readings map',
        books: catalog,
        userReadings: new Map(),
      },
      {
        name: 'User with only DNF books and no reading history',
        books: catalog,
        userReadings: new Map<string, BookReadingStatus>([
          ['b-3', 'dnf'],
          ['b-6', 'dnf'],
        ]),
      },
      {
        name: 'User with browser interactions only and null readings',
        books: catalog,
        userReadings: null,
        options: {
          interactions: [
            {
              bookId: 'b-7',
              slug: 'duna',
              title: 'Duna',
              tags: ['Ficção Científica', 'Aventura'],
              author_id: author4,
              timestamp: Date.now(),
              type: 'click',
            },
          ],
        },
      },
      {
        name: 'User with external history books not in catalog candidates',
        books: [catalog[1], catalog[2], catalog[3], catalog[4], catalog[5]],
        userReadings: new Map<string, BookReadingStatus>([
          ['ext-1', 'read'],
        ]),
        options: {
          externalHistoryBooks: [
            mockBook('ext-1', 'External Thriller', author1, ['Suspense', 'Thriller']),
          ],
        },
      },
    ];

    it.each(rankingScenarios)('$name: produces 100% identical book ordering and badges', ({ books, userReadings, options }) => {
      const tfRanked = rankCatalogBooks(books, userReadings, options);
      const nativeRanked = rankCatalogBooksNative(books, userReadings, options);

      expect(nativeRanked.length).toBe(tfRanked.length);

      const tfIds = tfRanked.map((b) => b.id);
      const nativeIds = nativeRanked.map((b) => b.id);
      expect(nativeIds).toEqual(tfIds);

      const tfRecommended = tfRanked.map((b) => b.isRecommended);
      const nativeRecommended = nativeRanked.map((b) => b.isRecommended);
      expect(nativeRecommended).toEqual(tfRecommended);

      const tfReadingStatuses = tfRanked.map((b) => b.readingStatus);
      const nativeReadingStatuses = nativeRanked.map((b) => b.readingStatus);
      expect(nativeReadingStatuses).toEqual(tfReadingStatuses);

      for (let i = 0; i < tfRanked.length; i++) {
        const tfScore = tfRanked[i].recommendationScore ?? 0;
        const nativeScore = nativeRanked[i].recommendationScore ?? 0;
        expect(Math.abs(nativeScore - tfScore)).toBeLessThanOrEqual(1e-5);
      }
    });
  });

  describe('Zero Tensor Allocation Guarantee in Native Engine', () => {
    it('does not allocate any TensorFlow tensors during computeNativeRecommendations', () => {
      const candidates = [catalog[1], catalog[2], catalog[4], catalog[5]];
      const historyBooks = [{ book: catalog[0], status: 'read' as const }];

      const initialTensors = tf.memory().numTensors;

      for (let i = 0; i < 50; i++) {
        computeNativeRecommendations(candidates, historyBooks);
      }

      const finalTensors = tf.memory().numTensors;
      expect(finalTensors).toBe(initialTensors);
    });

    it('does not allocate any TensorFlow tensors during rankCatalogBooksNative', () => {
      const userReadings = new Map<string, BookReadingStatus>([
        ['b-1', 'read'],
        ['b-2', 'reading'],
      ]);

      const initialTensors = tf.memory().numTensors;

      for (let i = 0; i < 50; i++) {
        rankCatalogBooksNative(catalog, userReadings);
      }

      const finalTensors = tf.memory().numTensors;
      expect(finalTensors).toBe(initialTensors);
    });
  });

  describe('Recommender Engine Strategy Adapter: rankCatalog', () => {
    const userReadings = new Map<string, BookReadingStatus>([
      ['b-1', 'read'],
      ['b-2', 'reading'],
    ]);

    it('defaults to native backend when backend is omitted and env is unset', () => {
      delete process.env.RECOMMENDER_BACKEND;
      expect(getRecommenderBackend()).toBe('native');

      const ranked = rankCatalog(catalog, userReadings);
      const nativeRanked = rankCatalogBooksNative(catalog, userReadings);

      expect(ranked.map((b) => b.id)).toEqual(nativeRanked.map((b) => b.id));
    });

    it('respects RECOMMENDER_BACKEND=tensorflow environment variable', () => {
      vi.stubEnv('RECOMMENDER_BACKEND', 'tensorflow');
      expect(getRecommenderBackend()).toBe('tensorflow');

      const ranked = rankCatalog(catalog, userReadings);
      const tfRanked = rankCatalogBooks(catalog, userReadings);

      expect(ranked.map((b) => b.id)).toEqual(tfRanked.map((b) => b.id));
    });

    it('respects explicit backend parameter over environment variable', () => {
      vi.stubEnv('RECOMMENDER_BACKEND', 'tensorflow');

      const rankedExplicitNative = rankCatalog(catalog, userReadings, undefined, 'native');
      const nativeRanked = rankCatalogBooksNative(catalog, userReadings);

      expect(rankedExplicitNative.map((b) => b.id)).toEqual(nativeRanked.map((b) => b.id));

      const rankedExplicitTf = rankCatalog(catalog, userReadings, undefined, 'tensorflow');
      const tfRanked = rankCatalogBooks(catalog, userReadings);

      expect(rankedExplicitTf.map((b) => b.id)).toEqual(tfRanked.map((b) => b.id));
    });
  });
});
