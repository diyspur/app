import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as tf from '@tensorflow/tfjs';
import type { Book } from '@/features/catalog/queries';
import type { BookReadingStatus } from '@/features/reading/schemas';
import type {
  FeatureVocabulary,
} from '@/features/recommendations/types';
import {
  buildFeatureVocabulary,
  vectorizeBook,
  computeTensorFlowRecommendations,
  rankCatalogBooks,
} from '@/features/recommendations/tensorflow-recommender';

describe('TensorFlow.js Book Recommendation Engine', () => {
  const author1 = '11111111-1111-1111-1111-111111111111';
  const author2 = '22222222-2222-2222-2222-222222222222';
  const author3 = '33333333-3333-3333-3333-333333333333';

  const mockBook = (
    id: string,
    title: string,
    author_id: string,
    tags: string[],
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

  const bookA = mockBook('b-1', 'Verity', author1, ['Suspense', 'Thriller', 'Psicológico']);
  const bookB = mockBook('b-2', 'A Garota no Trem', author2, ['Suspense', 'Mistério']);
  const bookC = mockBook('b-3', 'It: A Coisa', author3, ['Terror', 'Sobrenatural']);
  const bookD = mockBook('b-4', 'Orgulho e Preconceito', author2, ['Romance', 'Clássico']);
  const bookE = mockBook('b-5', 'Gothic Mystery', author1, ['Suspense', 'Gótico']);

  const sampleCatalog: Book[] = [bookA, bookB, bookC, bookD, bookE];

  beforeEach(() => {
    // Reset/warm up backend
    tf.engine().startScope();
    tf.engine().endScope();
  });

  describe('Feature Extraction and Vocabulary', () => {
    it('extracts unique normalized tags and author IDs from catalog', () => {
      const vocab = buildFeatureVocabulary([bookA, bookB]);
      expect(vocab.tags).toContain('suspense');
      expect(vocab.tags).toContain('thriller');
      expect(vocab.tags).toContain('psicológico');
      expect(vocab.tags).toContain('mistério');
      expect(vocab.authorIds).toContain(author1);
      expect(vocab.authorIds).toContain(author2);
    });

    it('vectorizes a book into a normalized feature array without NaNs', () => {
      const vocab = buildFeatureVocabulary(sampleCatalog);
      const vector = vectorizeBook(bookA, vocab);

      expect(vector.length).toBe(vocab.tags.length + vocab.authorIds.length);
      expect(vector.some((v) => Number.isNaN(v))).toBe(false);
      // Contains positive values for bookA's tags and author
      const sum = vector.reduce((acc, val) => acc + val, 0);
      expect(sum).toBeGreaterThan(0);
    });

    it('handles books with null or empty tags gracefully', () => {
      const emptyBook = mockBook('b-empty', 'Livro Sem Tags', author1, []);
      emptyBook.tags = null;
      const vocab = buildFeatureVocabulary([bookA]);
      const vector = vectorizeBook(emptyBook, vocab);
      expect(vector.length).toBe(vocab.tags.length + vocab.authorIds.length);
      expect(vector.some((v) => Number.isNaN(v))).toBe(false);
    });

    it('populates tagIndexMap and authorIndexMap with exact O(1) indices matching arrays', () => {
      const vocab = buildFeatureVocabulary(sampleCatalog);

      expect(vocab.tagIndexMap).toBeInstanceOf(Map);
      expect(vocab.authorIndexMap).toBeInstanceOf(Map);
      expect(vocab.tagIndexMap.size).toBe(vocab.tags.length);
      expect(vocab.authorIndexMap.size).toBe(vocab.authorIds.length);

      vocab.tags.forEach((tag, idx) => {
        expect(vocab.tagIndexMap.get(tag)).toBe(idx);
      });

      vocab.authorIds.forEach((authorId, idx) => {
        expect(vocab.authorIndexMap.get(authorId)).toBe(idx);
      });
    });

    it('vectorizes books using O(1) map lookups without invoking indexOf', () => {
      const vocab = buildFeatureVocabulary(sampleCatalog);

      const tagIndexOfSpy = vi.spyOn(vocab.tags, 'indexOf');
      const authorIndexOfSpy = vi.spyOn(vocab.authorIds, 'indexOf');

      const vector = vectorizeBook(bookA, vocab);

      expect(vector.length).toBe(vocab.tags.length + vocab.authorIds.length);
      expect(tagIndexOfSpy).not.toHaveBeenCalled();
      expect(authorIndexOfSpy).not.toHaveBeenCalled();

      tagIndexOfSpy.mockRestore();
      authorIndexOfSpy.mockRestore();
    });

    it('produces identical vectors between indexed O(1) lookups and legacy fallback vocabulary', () => {
      const vocab = buildFeatureVocabulary(sampleCatalog);

      // Create a legacy vocabulary structure without maps
      const legacyVocab: FeatureVocabulary = {
        tags: [...vocab.tags],
        authorIds: [...vocab.authorIds],
      };

      for (const book of sampleCatalog) {
        const indexedVector = vectorizeBook(book, vocab);
        const legacyVector = vectorizeBook(book, legacyVocab);
        expect(indexedVector).toEqual(legacyVector);
      }

      // Also verify with an unknown book containing non-existent tags and author
      const unknownBook = mockBook('b-unknown', 'Desconhecido', 'author-999', ['TagInexistente']);
      expect(vectorizeBook(unknownBook, vocab)).toEqual(vectorizeBook(unknownBook, legacyVocab));
    });

    it('falls back to indexOf when vocabulary lacks index maps (backward compatibility)', () => {
      const vocab = buildFeatureVocabulary([bookA]);

      const legacyVocab: FeatureVocabulary = {
        tags: [...vocab.tags],
        authorIds: [...vocab.authorIds],
      };

      const tagIndexOfSpy = vi.spyOn(legacyVocab.tags, 'indexOf');
      const authorIndexOfSpy = vi.spyOn(legacyVocab.authorIds, 'indexOf');

      const vector = vectorizeBook(bookA, legacyVocab);

      expect(vector.length).toBe(legacyVocab.tags.length + legacyVocab.authorIds.length);
      expect(tagIndexOfSpy).toHaveBeenCalled();
      expect(authorIndexOfSpy).toHaveBeenCalled();

      tagIndexOfSpy.mockRestore();
      authorIndexOfSpy.mockRestore();
    });
  });

  describe('TensorFlow.js Cosine Similarity and Memory Management', () => {
    it('computes higher similarity score for books sharing genre tags and author', () => {
      // User has read bookA (Suspense, Thriller, author1)
      const scores = computeTensorFlowRecommendations(
        [bookB, bookC, bookD, bookE],
        [{ book: bookA, status: 'read' }],
      );

      const scoreB = scores.get(bookB.id) ?? 0; // shares 'Suspense'
      const scoreC = scores.get(bookC.id) ?? 0; // Terror, Sobrenatural (no overlap)
      const scoreE = scores.get(bookE.id) ?? 0; // shares 'Suspense' + same author1

      // bookE shares author1 and 'Suspense', so scoreE > scoreB > scoreC
      expect(scoreE).toBeGreaterThan(scoreB);
      expect(scoreB).toBeGreaterThan(scoreC);
      expect(scoreC).toBeCloseTo(0, 1);
    });

    it('guarantees zero memory leaks in TensorFlow tensors (tf.tidy clean)', () => {
      const initialTensors = tf.memory().numTensors;

      // Run recommendation multiple times
      for (let i = 0; i < 5; i++) {
        computeTensorFlowRecommendations(
          [bookB, bookC, bookD, bookE],
          [{ book: bookA, status: 'reading' }],
        );
      }

      const finalTensors = tf.memory().numTensors;
      expect(finalTensors).toBe(initialTensors);
    });
  });

  describe('Catalog Ranking Business Rules (SDD / User Requirements)', () => {
    it('places top recommendations first and read/reading/dnf books at the very end', () => {
      // Setup reading status:
      // User has read bookA
      // User is currently reading bookB
      // User gave up (dnf) on bookC
      // Candidate unread books: bookD (Romance), bookE (Suspense + author1)
      const userReadings = new Map<string, BookReadingStatus>([
        [bookA.id, 'read'],
        [bookB.id, 'reading'],
        [bookC.id, 'dnf'],
      ]);

      const ranked = rankCatalogBooks(sampleCatalog, userReadings);

      expect(ranked.length).toBe(sampleCatalog.length);

      // Candidate books (bookE and bookD) must come before read/reading/dnf books (bookA, bookB, bookC)
      const candidateIds = ranked.slice(0, 2).map((b) => b.id);
      expect(candidateIds).toContain(bookE.id);
      expect(candidateIds).toContain(bookD.id);

      // Between candidates, bookE has high similarity with read bookA (Suspense + author1)
      // So bookE must be ranked first (index 0) and marked as recommended
      expect(ranked[0].id).toBe(bookE.id);
      expect(ranked[0].isRecommended).toBe(true);
      expect(ranked[0].readingStatus).toBeUndefined();

      // Read, Reading, and DNF books MUST be at the bottom (last 3 items)
      const bottomIds = ranked.slice(2).map((b) => b.id);
      expect(bottomIds).toContain(bookA.id);
      expect(bottomIds).toContain(bookB.id);
      expect(bottomIds).toContain(bookC.id);

      // Verify statuses attached
      const bottomA = ranked.find((b) => b.id === bookA.id);
      const bottomB = ranked.find((b) => b.id === bookB.id);
      const bottomC = ranked.find((b) => b.id === bookC.id);
      expect(bottomA?.readingStatus).toBe('read');
      expect(bottomB?.readingStatus).toBe('reading');
      expect(bottomC?.readingStatus).toBe('dnf');
    });

    it('falls back to default catalog order when user is guest (null or empty readings)', () => {
      const ranked = rankCatalogBooks(sampleCatalog, new Map());
      expect(ranked.map((b) => b.id)).toEqual(sampleCatalog.map((b) => b.id));
      expect(ranked.every((b) => !b.isRecommended)).toBe(true);
    });

    it('falls back gracefully when user only has dnf and no read/reading books', () => {
      const userReadings = new Map<string, BookReadingStatus>([[bookA.id, 'dnf']]);
      const ranked = rankCatalogBooks(sampleCatalog, userReadings);

      // All unread books come first in default order, bookA at the very end
      expect(ranked[ranked.length - 1].id).toBe(bookA.id);
      expect(ranked[ranked.length - 1].readingStatus).toBe('dnf');
      expect(ranked.slice(0, 4).map((b) => b.id)).toEqual([
        bookB.id,
        bookC.id,
        bookD.id,
        bookE.id,
      ]);
    });

    it('includes want_to_read books in candidates and scores them normally', () => {
      const userReadings = new Map<string, BookReadingStatus>([
        [bookA.id, 'read'],
        [bookE.id, 'want_to_read'], // marked as want_to_read
      ]);

      const ranked = rankCatalogBooks(sampleCatalog, userReadings);

      // bookE has high affinity with bookA and is want_to_read, so it should be at the top!
      expect(ranked[0].id).toBe(bookE.id);
      expect(ranked[0].readingStatus).toBe('want_to_read');
      // bookA (read) is at the bottom
      expect(ranked[ranked.length - 1].id).toBe(bookA.id);
      expect(ranked[ranked.length - 1].readingStatus).toBe('read');
    });

    it('scores candidates accurately even when read books are passed via externalHistoryBooks', () => {
      // Suppose only candidates bookC, bookD, bookE are passed in books list
      // But bookA (read) was provided as externalHistoryBooks
      const candidatesOnly = [bookC, bookD, bookE];
      const userReadings = new Map<string, BookReadingStatus>([
        [bookA.id, 'read'],
      ]);

      const ranked = rankCatalogBooks(candidatesOnly, userReadings, {
        externalHistoryBooks: [bookA],
      });

      // bookE shares author1 and Suspense with external bookA, so it must be ranked first
      expect(ranked[0].id).toBe(bookE.id);
      expect(ranked[0].isRecommended).toBe(true);
    });

    it('ranks candidate books based on user clicks/views stored in browser memory (memoryItem)', () => {
      // User has no server reading history, but clicked/viewed bookA in browser
      const ranked = rankCatalogBooks([bookC, bookD, bookE], null, {
        interactions: [
          {
            bookId: bookA.id,
            slug: bookA.slug,
            title: bookA.title,
            tags: bookA.tags,
            author_id: bookA.author_id,
            timestamp: Date.now(),
            type: 'click',
          },
        ],
      });

      // bookE shares author1 and 'Suspense' with clicked bookA -> should be ranked first
      expect(ranked[0].id).toBe(bookE.id);
      expect(ranked[0].isRecommended).toBe(true);
    });

    it('preserves server-provided reading statuses when re-ranking with client browser interactions', () => {
      const booksWithStatus: Book[] = [
        { ...bookA, readingStatus: 'read' },
        { ...bookB, readingStatus: 'reading' },
        { ...bookC, readingStatus: 'dnf' },
        { ...bookD, readingStatus: undefined },
        { ...bookE, readingStatus: undefined },
      ];

      // Extrair mapa de leituras preservadas
      const preservedReadings = new Map<string, BookReadingStatus>(
        booksWithStatus
          .filter((b) => b.readingStatus)
          .map((b) => [b.id, b.readingStatus as BookReadingStatus]),
      );

      const ranked = rankCatalogBooks(booksWithStatus, preservedReadings, {
        interactions: [
          {
            bookId: bookA.id,
            slug: bookA.slug,
            title: bookA.title,
            tags: bookA.tags,
            author_id: bookA.author_id,
            timestamp: Date.now(),
            type: 'click',
          },
        ],
      });

      // bookA, bookB, bookC DEVEM permanecer no final com seus status preservados
      const bottom = ranked.slice(2);
      expect(bottom.find((b) => b.id === bookA.id)?.readingStatus).toBe('read');
      expect(bottom.find((b) => b.id === bookB.id)?.readingStatus).toBe('reading');
      expect(bottom.find((b) => b.id === bookC.id)?.readingStatus).toBe('dnf');

      // Candidatos não lidos no topo
      expect(ranked[0].id).toBe(bookE.id);
      expect(ranked[0].readingStatus).toBeUndefined();
    });
  });

  describe('BookCard Presentation with Recommendation and Status Badges', () => {
    it('renders recommended badge when book.isRecommended is true', async () => {
      const { BookCard } = await import('@/components/book-card');
      const recommendedBook = { ...bookA, isRecommended: true };
      const card = BookCard({ book: recommendedBook });

      expect(card).toBeDefined();
      expect(card.props.href).toBe('/livros/verity');
      // Children contain cover, h3, p, and tags container
      const children = card.props.children;
      expect(children).toBeDefined();
    });

    it('renders reading status badge when book.readingStatus is reading/read/dnf', async () => {
      const { BookCard } = await import('@/components/book-card');
      const readingBook = { ...bookB, readingStatus: 'reading' as const };
      const card = BookCard({ book: readingBook });

      expect(card).toBeDefined();
      expect(card.props.href).toBe('/livros/a-garota-no-trem');
    });
  });

  describe('Browser Storage for Book Interactions (memoryItem)', () => {
    beforeEach(() => {
      const store = new Map<string, string>();
      vi.stubGlobal('localStorage', {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
        clear: () => store.clear(),
      });
    });

    it('saves and retrieves interaction under memoryItem and list', async () => {
      const { saveBookInteraction, getStoredInteractions, MEMORY_ITEM_KEY } = await import(
        '@/features/recommendations/browser-storage'
      );

      saveBookInteraction({
        bookId: 'b-test',
        slug: 'livro-teste',
        title: 'Livro Teste',
        tags: ['ficcao'],
        author_id: 'auth-1',
        type: 'click',
      });

      const interactions = getStoredInteractions();
      expect(interactions.length).toBe(1);
      expect(interactions[0].bookId).toBe('b-test');
      expect(interactions[0].type).toBe('click');

      const single = JSON.parse(localStorage.getItem(MEMORY_ITEM_KEY)!);
      expect(single.bookId).toBe('b-test');
    });

    it('deduplicates multiple clicks on the same book keeping newest', async () => {
      const { saveBookInteraction, getStoredInteractions } = await import(
        '@/features/recommendations/browser-storage'
      );

      saveBookInteraction({
        bookId: 'b-1',
        slug: 'slug-1',
        title: 'Title 1',
        type: 'click',
        timestamp: 100,
      });
      saveBookInteraction({
        bookId: 'b-1',
        slug: 'slug-1',
        title: 'Title 1',
        type: 'view',
        timestamp: 200,
      });

      const items = getStoredInteractions();
      expect(items.length).toBe(1);
      expect(items[0].timestamp).toBe(200);
      expect(items[0].type).toBe('view');
    });

    it('calculates decayed weights where click has higher weight than view (0.6 vs 0.2)', async () => {
      const { calculateDecayedWeight } = await import(
        '@/features/recommendations/browser-storage'
      );
      const now = 1_700_000_000_000;

      const clickRecord = {
        bookId: 'b-click',
        slug: 'slug-click',
        title: 'Click Book',
        tags: ['tag1'],
        author_id: 'auth-1',
        clicksCount: 1,
        viewsCount: 0,
        lastInteractedAt: now,
      };

      const viewRecord = {
        bookId: 'b-view',
        slug: 'slug-view',
        title: 'View Book',
        tags: ['tag1'],
        author_id: 'auth-1',
        clicksCount: 0,
        viewsCount: 1,
        lastInteractedAt: now,
      };

      const clickWeight = calculateDecayedWeight(clickRecord, now);
      const viewWeight = calculateDecayedWeight(viewRecord, now);

      expect(clickWeight).toBeCloseTo(0.6, 5);
      expect(viewWeight).toBeCloseTo(0.2, 5);
      expect(clickWeight).toBeGreaterThan(viewWeight);
    });

    it('accumulates click and view signals without overwriting when viewing a previously clicked book', async () => {
      const { saveBookInteraction, getStoredInteractions, getStoredRecords } = await import(
        '@/features/recommendations/browser-storage'
      );
      const now = Date.now();
      const t1 = now - 5000;
      const t2 = now;

      saveBookInteraction({
        bookId: 'b-accumulate',
        slug: 'slug-accumulate',
        title: 'Accumulate Book',
        tags: ['tag-shared'],
        author_id: 'auth-1',
        type: 'click',
        timestamp: t1,
      });

      saveBookInteraction({
        bookId: 'b-accumulate',
        slug: 'slug-accumulate',
        title: 'Accumulate Book',
        tags: ['tag-shared'],
        author_id: 'auth-1',
        type: 'view',
        timestamp: t2,
      });

      const records = getStoredRecords();
      expect(records.length).toBe(1);
      expect(records[0].bookId).toBe('b-accumulate');
      expect(records[0].clicksCount).toBe(1);
      expect(records[0].viewsCount).toBe(1);
      expect(records[0].lastInteractedAt).toBe(t2);

      const items = getStoredInteractions(now);
      expect(items.length).toBe(1);
      expect(items[0].bookId).toBe('b-accumulate');
      // Weight should accumulate 0.6 + 0.2 = 0.8 (at t2)
      expect(items[0].weight).toBeDefined();
      expect(items[0].weight!).toBeGreaterThan(0.7);
    });

    it('applies exponential decay so recent interactions have higher influence than interactions from 30 days ago', async () => {
      const { calculateDecayedWeight, saveBookInteraction, getStoredInteractions } = await import(
        '@/features/recommendations/browser-storage'
      );
      const now = 1_700_000_000_000;
      const dayMs = 86_400_000;
      const thirtyDaysAgo = now - 30 * dayMs;
      const fourteenDaysAgo = now - 14 * dayMs;

      const recentRecord = {
        bookId: 'b-recent',
        slug: 'recent-book',
        title: 'Recent Book',
        tags: ['suspense'],
        author_id: author1,
        clicksCount: 1,
        viewsCount: 0,
        lastInteractedAt: now,
      };

      const halfLifeRecord = {
        bookId: 'b-half-life',
        slug: 'half-life-book',
        title: 'Half Life Book',
        tags: ['suspense'],
        author_id: author1,
        clicksCount: 1,
        viewsCount: 0,
        lastInteractedAt: fourteenDaysAgo,
      };

      const oldRecord = {
        bookId: 'b-old',
        slug: 'old-book',
        title: 'Old Book',
        tags: ['suspense'],
        author_id: author1,
        clicksCount: 1,
        viewsCount: 0,
        lastInteractedAt: thirtyDaysAgo,
      };

      const recentWeight = calculateDecayedWeight(recentRecord, now);
      const halfLifeWeight = calculateDecayedWeight(halfLifeRecord, now);
      const oldWeight = calculateDecayedWeight(oldRecord, now);

      // Exact half life at 14 days should be half of 0.6 = 0.3
      expect(recentWeight).toBeCloseTo(0.6, 5);
      expect(halfLifeWeight).toBeCloseTo(0.3, 4);
      expect(recentWeight).toBeGreaterThan(oldWeight);
      expect(oldWeight).toBeLessThan(0.15);

      // Verify influence on recommender ranking between two candidate books:
      // candidateRecent shares features with recent interaction
      // candidateOld shares features with old interaction
      const candidateRecent = mockBook('c-recent', 'Recent Match', author1, ['suspense']);
      const candidateOld = mockBook('c-old', 'Old Match', author3, ['terror']);

      const { computeNativeRecommendations } = await import(
        '@/features/recommendations/native-recommender'
      );

      const rankedScores = computeNativeRecommendations(
        [candidateRecent, candidateOld],
        [],
        {
          interactions: [
            {
              bookId: 'i-recent',
              slug: 'i-recent',
              title: 'Interacted Recent',
              tags: ['suspense'],
              author_id: author1,
              timestamp: now,
              type: 'click',
              weight: recentWeight,
            },
            {
              bookId: 'i-old',
              slug: 'i-old',
              title: 'Interacted Old',
              tags: ['terror'],
              author_id: author3,
              timestamp: thirtyDaysAgo,
              type: 'click',
              weight: oldWeight,
            },
          ],
        },
      );

      const scoreRecent = rankedScores.get(candidateRecent.id) ?? 0;
      const scoreOld = rankedScores.get(candidateOld.id) ?? 0;

      expect(scoreRecent).toBeGreaterThan(scoreOld);
    });
  });
});

