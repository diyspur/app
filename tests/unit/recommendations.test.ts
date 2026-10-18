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
  normalizeVector,
  computeTensorFlowRecommendations,
  rankCatalogBooks,
} from '@/features/recommendations/tensorflow-recommender';
import {
  computeNativeRecommendations,
  rankCatalogBooksNative,
  applyMMR,
  formatRecommendationTag,
} from '@/features/recommendations/native-recommender';

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
        tagIdfMap: vocab.tagIdfMap,
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

    it('renders recommendation reason in BookCard when book.recommendationReason is present', async () => {
      const { BookCard } = await import('@/components/book-card');
      const recommendedBook = {
        ...bookA,
        isRecommended: true,
        recommendationReason: 'Do mesmo autor de Verity',
      };
      const card = BookCard({ book: recommendedBook });

      expect(card).toBeDefined();
      const children = card.props.children;
      // Index 3 is the reason paragraph
      const reasonParagraph = children.find(
        (child: any) => child?.props?.className === 'book-card-reason',
      );
      expect(reasonParagraph).toBeDefined();
      expect(reasonParagraph.props.children).toBe('Do mesmo autor de Verity');
      expect(reasonParagraph.props.title).toBe('Do mesmo autor de Verity');

      // The tag-recommended badge also contains the reason in its title and aria-label
      const tagsContainer = children.find(
        (child: any) => child?.props?.className === 'book-card-tags',
      );
      const recommendedBadge = tagsContainer.props.children.find(
        (child: any) => child?.props?.className?.includes('tag-recommended'),
      );
      expect(recommendedBadge.props.title).toBe('Do mesmo autor de Verity');
      expect(recommendedBadge.props['aria-label']).toContain('Do mesmo autor de Verity');
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
      const { calculateDecayedWeight } = await import(
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

  describe('TF-IDF Tag Weighting and Per-Book Vector Normalization (Task 3.2)', () => {
    it('computes correct smooth IDF weights in buildFeatureVocabulary for rare vs ubiquitous tags', () => {
      // Create a catalog with 20 books:
      // - 19 books have the ubiquitous tag "ficção" (df = 19)
      // - 1 book has the rare tag "distopia cyberpunk" (df = 1)
      const catalog20: Book[] = [];
      for (let i = 0; i < 19; i++) {
        catalog20.push(
          mockBook(`ubiq-${i}`, `Livro Ubíquo ${i}`, `author-${i}`, ['ficção', `genero-${i}`]),
        );
      }
      catalog20.push(
        mockBook('rare-0', 'Neuromancer Distópico', 'author-cyber', ['distopia cyberpunk']),
      );

      const vocab = buildFeatureVocabulary(catalog20);
      const N = 20;

      // IDF(t) = ln((1 + N) / (1 + df(t))) + 1
      const expectedIdfUbiq = Math.log((1 + N) / (1 + 19)) + 1; // ln(21 / 20) + 1 ~ 1.04879
      const expectedIdfRare = Math.log((1 + N) / (1 + 1)) + 1; // ln(21 / 2) + 1 ~ 3.351375

      const actualIdfUbiq = vocab.tagIdfMap.get('ficção');
      const actualIdfRare = vocab.tagIdfMap.get('distopia cyberpunk');

      expect(actualIdfUbiq).toBeDefined();
      expect(actualIdfRare).toBeDefined();
      expect(actualIdfUbiq).toBeCloseTo(expectedIdfUbiq, 5);
      expect(actualIdfRare).toBeCloseTo(expectedIdfRare, 5);

      // Rare tag has more than 3x the weight of ubiquitous tag
      expect(actualIdfRare!).toBeGreaterThan(actualIdfUbiq! * 3);
    });

    it('demonstrates that books sharing a rare tag receive higher recommendation affinity than books sharing only a ubiquitous tag', () => {
      // Catalog where "ficção" is present in 95% (19/20) of books
      // and "distopia cyberpunk" is rare (present in read book and candidateRare)
      const backgroundBooks: Book[] = [];
      for (let i = 0; i < 17; i++) {
        backgroundBooks.push(
          mockBook(`bg-${i}`, `Livro Fundo ${i}`, `auth-bg-${i}`, ['ficção', `bg-tag-${i}`]),
        );
      }

      // User has read a book containing both ficção and distopia cyberpunk
      const readBook = mockBook('read-book', 'Cyber Ficção', 'auth-read', [
        'ficção',
        'distopia cyberpunk',
      ]);

      // Candidate 1 shares only the rare tag "distopia cyberpunk"
      const candidateRare = mockBook('cand-rare', 'Distopia Pura', 'auth-cand-rare', [
        'distopia cyberpunk',
      ]);

      // Candidate 2 shares only the ubiquitous tag "ficção"
      const candidateUbiquitous = mockBook('cand-ubiq', 'Ficção Genérica', 'auth-cand-ubiq', [
        'ficção',
      ]);

      const candidates = [candidateRare, candidateUbiquitous, ...backgroundBooks];
      const historyBooks = [{ book: readBook, status: 'read' as const }];

      // Compute recommendations with TensorFlow.js recommender
      const tfScores = computeTensorFlowRecommendations(candidates, historyBooks);
      const tfRareScore = tfScores.get(candidateRare.id) ?? 0;
      const tfUbiqScore = tfScores.get(candidateUbiquitous.id) ?? 0;

      // Rare tag book MUST receive substantially higher score than ubiquitous tag book
      expect(tfRareScore).toBeGreaterThan(tfUbiqScore * 2);

      // Compute recommendations with Native JS recommender
      const nativeScores = computeNativeRecommendations(candidates, historyBooks);
      const nativeRareScore = nativeScores.get(candidateRare.id) ?? 0;
      const nativeUbiqScore = nativeScores.get(candidateUbiquitous.id) ?? 0;

      expect(nativeRareScore).toBeGreaterThan(nativeUbiqScore * 2);
      expect(Math.abs(nativeRareScore - tfRareScore)).toBeLessThanOrEqual(1e-5);
      expect(Math.abs(nativeUbiqScore - tfUbiqScore)).toBeLessThanOrEqual(1e-5);

      // In rankCatalogBooks, candidateRare must rank ahead of candidateUbiquitous
      const allBooks = [readBook, candidateUbiquitous, candidateRare, ...backgroundBooks];
      const userReadings = new Map<string, BookReadingStatus>([[readBook.id, 'read']]);
      const ranked = rankCatalogBooks(allBooks, userReadings);

      expect(ranked[0].id).toBe(candidateRare.id);
      expect(ranked[0].isRecommended).toBe(true);
    });

    it('demonstrates that books with many tags are normalized and do not skew the profile excessively compared to books with fewer tags', () => {
      // User has read two books:
      // Book 1 (focused): 2 niche tags
      // Book 2 (tag-stuffed): 20 broad tags
      const focusedTags = ['distopia-hardcore', 'ai-sentiente'];
      const stuffedTags = Array.from({ length: 20 }, (_, i) => `broad-topic-${i + 1}`);

      const bookFocused = mockBook('b-focused', 'Focused Book', 'auth-f', focusedTags);
      const bookStuffed = mockBook('b-stuffed', 'Tag Stuffed Book', 'auth-s', stuffedTags);

      // Candidate 1: matches the 2 niche tags of the focused book
      const candidateFocused = mockBook('c-focused', 'Focused Match', 'auth-cf', [
        'distopia-hardcore',
        'ai-sentiente',
      ]);

      // Candidate 2: matches 2 tags from the 20-tag stuffed book
      const candidateStuffed = mockBook('c-stuffed', 'Stuffed Partial Match', 'auth-cs', [
        'broad-topic-1',
        'broad-topic-2',
      ]);

      const candidates = [candidateFocused, candidateStuffed];
      const historyBooks = [
        { book: bookFocused, status: 'read' as const },
        { book: bookStuffed, status: 'read' as const },
      ];

      // Because bookStuffed was normalized (L2 norm = 1), each of its 20 tags has weight 1/sqrt(20) ~ 0.224.
      // Meanwhile, each of bookFocused's 2 tags has weight 1/sqrt(2) ~ 0.707.
      // Therefore, candidateFocused (matching 100% of bookFocused) receives much higher affinity
      // than candidateStuffed (matching only 10% of bookStuffed).
      const tfScores = computeTensorFlowRecommendations(candidates, historyBooks);
      const nativeScores = computeNativeRecommendations(candidates, historyBooks);

      const tfScoreFocused = tfScores.get(candidateFocused.id) ?? 0;
      const tfScoreStuffed = tfScores.get(candidateStuffed.id) ?? 0;
      const nativeScoreFocused = nativeScores.get(candidateFocused.id) ?? 0;
      const nativeScoreStuffed = nativeScores.get(candidateStuffed.id) ?? 0;

      expect(tfScoreFocused).toBeGreaterThan(tfScoreStuffed * 2);
      expect(nativeScoreFocused).toBeGreaterThan(nativeScoreStuffed * 2);
      expect(Math.abs(nativeScoreFocused - tfScoreFocused)).toBeLessThanOrEqual(1e-5);
      expect(Math.abs(nativeScoreStuffed - tfScoreStuffed)).toBeLessThanOrEqual(1e-5);
    });

    it('normalizes vectors to unit length (L2 norm = 1) with normalizeVector and vectorizeBook(..., true)', () => {
      // 3-4-5 Pythagorean triangle: [3, 4] norm is 5 -> [0.6, 0.8] with L2 norm = 1.0
      const vec = [3, 4];
      const normalized = normalizeVector(vec);

      expect(normalized[0]).toBeCloseTo(0.6, 5);
      expect(normalized[1]).toBeCloseTo(0.8, 5);

      const l2 = Math.sqrt(normalized[0] * normalized[0] + normalized[1] * normalized[1]);
      expect(l2).toBeCloseTo(1.0, 5);

      // Zero vector safely returns zero array without NaN
      const zeroNorm = normalizeVector([0, 0, 0, 0]);
      expect(zeroNorm).toEqual([0, 0, 0, 0]);
      expect(zeroNorm.some((v) => Number.isNaN(v))).toBe(false);

      // Sub-epsilon vectors also return zero array
      const tinyNorm = normalizeVector([1e-9, 1e-9]);
      expect(tinyNorm).toEqual([0, 0]);

      // vectorizeBook with normalize = true returns unit norm vector
      const vocab = buildFeatureVocabulary(sampleCatalog);
      const unitBookVec = vectorizeBook(bookA, vocab, true);
      const unitL2 = Math.sqrt(unitBookVec.reduce((sum, v) => sum + v * v, 0));
      expect(unitL2).toBeCloseTo(1.0, 5);

      // vectorizeBook with normalize = false returns unnormalized vector
      const rawBookVec = vectorizeBook(bookA, vocab, false);
      const rawL2 = Math.sqrt(rawBookVec.reduce((sum, v) => sum + v * v, 0));
      expect(rawL2).toBeGreaterThan(1.0);
    });
  });

  describe('MMR Diversity Reranking (Maximal Marginal Relevance) (Task 3.3)', () => {
    // Setup a scenario with monopoly risk:
    // User read bookA (author1, tags: ['Suspense', 'Thriller'])
    // Candidates contain 4 books by author1 (tags: ['Suspense'])
    // and 1 book by author2 (tags: ['Suspense', 'Mistério'])
    const auth1Cand1 = mockBook('c-a1', 'Auth1 Thriller 1', author1, ['Suspense', 'Thriller']);
    const auth1Cand2 = mockBook('c-a2', 'Auth1 Thriller 2', author1, ['Suspense', 'Thriller']);
    const auth1Cand3 = mockBook('c-a3', 'Auth1 Thriller 3', author1, ['Suspense', 'Thriller']);
    const auth1Cand4 = mockBook('c-a4', 'Auth1 Thriller 4', author1, ['Suspense', 'Thriller']);
    const auth2Cand1 = mockBook('c-b1', 'Auth2 Mystery 1', author2, ['Mistério']);

    const monopolyCatalog = [auth1Cand1, auth1Cand2, auth1Cand3, auth1Cand4, auth2Cand1];
    const userReadings = new Map<string, BookReadingStatus>([
      [bookA.id, 'reading'],
      [bookB.id, 'read'],
    ]);
    const historyBooks = [bookA, bookB];

    it('demonstrates monopoly without MMR (all author1 books come before author2)', () => {
      const ranked = rankCatalogBooksNative(monopolyCatalog, userReadings, {
        externalHistoryBooks: historyBooks,
        enableMMR: false,
      });

      // Without MMR, author1 bonus (reading status 1.25) causes all 4 author1 books to precede auth2Cand1
      expect(ranked.slice(0, 4).map((b) => b.id)).toEqual([
        auth1Cand1.id,
        auth1Cand2.id,
        auth1Cand3.id,
        auth1Cand4.id,
      ]);
      expect(ranked[4].id).toBe(auth2Cand1.id);
    });

    it('diversifies candidate list preventing single author or genre monopoly when enableMMR is true', () => {
      // With Native Engine
      const nativeRanked = rankCatalogBooksNative(monopolyCatalog, userReadings, {
        externalHistoryBooks: historyBooks,
        enableMMR: true,
        diversityLambda: 0.75,
      });

      // Position 0 is still the most relevant author1 book
      expect(nativeRanked[0].id).toBe(auth1Cand1.id);
      // But position 1 is diversified to author2 book because redundant author1 books receive similarity penalty
      expect(nativeRanked[1].id).toBe(auth2Cand1.id);

      // With TensorFlow Engine
      const tfRanked = rankCatalogBooks(monopolyCatalog, userReadings, {
        externalHistoryBooks: historyBooks,
        enableMMR: true,
        diversityLambda: 0.75,
      });

      expect(tfRanked[0].id).toBe(auth1Cand1.id);
      expect(tfRanked[1].id).toBe(auth2Cand1.id);
    });

    it('respects diversityLambda: lambda = 1.0 prioritizes relevance, lambda = 0.5 prioritizes diversity', () => {
      // lambda = 1.0: Pure relevance (no diversity penalty)
      const pureRelevance = rankCatalogBooksNative(monopolyCatalog, userReadings, {
        externalHistoryBooks: historyBooks,
        enableMMR: true,
        diversityLambda: 1.0,
      });
      expect(pureRelevance[4].id).toBe(auth2Cand1.id);

      // lambda = 0.5: Strong diversity
      const highDiversity = rankCatalogBooksNative(monopolyCatalog, userReadings, {
        externalHistoryBooks: historyBooks,
        enableMMR: true,
        diversityLambda: 0.5,
      });
      expect(highDiversity[1].id).toBe(auth2Cand1.id);
    });

    it('applyMMR handles edge cases gracefully (single item, empty list, all identical)', () => {
      const vocab = buildFeatureVocabulary([bookA, bookB]);
      const single = [{ ...bookA, recommendationScore: 0.9 }];
      expect(applyMMR(single, vocab)).toEqual(single);
      expect(applyMMR([], vocab)).toEqual([]);
    });
  });

  describe('Explainable Recommendations (recommendationReason) (Task 3.3)', () => {
    it('generates "Do mesmo autor de [Título]" when author is the dominant contributor from reading history', () => {
      // User read bookA ('Verity', author1, ['Suspense'])
      // Candidate bookE ('Gothic Mystery', author1, ['Gótico'])
      const userReadings = new Map<string, BookReadingStatus>([[bookA.id, 'read']]);
      const ranked = rankCatalogBooksNative([bookE], userReadings, {
        externalHistoryBooks: [bookA],
      });

      expect(ranked[0].isRecommended).toBe(true);
      expect(ranked[0].recommendationReason).toBe('Do mesmo autor de Verity');

      // Verify TensorFlow engine also yields identical reason
      const tfRanked = rankCatalogBooks([bookE], userReadings, {
        externalHistoryBooks: [bookA],
      });
      expect(tfRanked[0].recommendationReason).toBe('Do mesmo autor de Verity');
    });

    it('generates "Recomendado por afinidade com [Tag]" when dominant contributor is a shared tag', () => {
      // User read bookA ('Verity', author1, ['Suspense', 'Psicológico'])
      // Candidate bookB ('A Garota no Trem', author2, ['Suspense', 'Mistério'])
      // Author is different, so shared tag 'Suspense' dominates
      const userReadings = new Map<string, BookReadingStatus>([[bookA.id, 'read']]);
      const ranked = rankCatalogBooksNative([bookB], userReadings, {
        externalHistoryBooks: [bookA],
      });

      expect(ranked[0].isRecommended).toBe(true);
      expect(ranked[0].recommendationReason).toBe('Recomendado por afinidade com Suspense');

      const tfRanked = rankCatalogBooks([bookB], userReadings, {
        externalHistoryBooks: [bookA],
      });
      expect(tfRanked[0].recommendationReason).toBe('Recomendado por afinidade com Suspense');
    });

    it('generates "Com base no seu interesse em [Tag]" when recommendation is driven by browser interactions', () => {
      // User has no reading history, but interacted with a sci-fi book in browser
      const candidateSciFi = mockBook('c-sci', 'Duna', author3, ['Ficção Científica']);
      const ranked = rankCatalogBooksNative([candidateSciFi], null, {
        interactions: [
          {
            bookId: 'interacted-1',
            title: 'Fundação',
            slug: 'fundacao',
            tags: ['Ficção Científica'],
            author_id: author2,
            timestamp: Date.now(),
            type: 'click',
          },
        ],
      });

      expect(ranked[0].isRecommended).toBe(true);
      expect(ranked[0].recommendationReason).toBe('Com base no seu interesse em Ficção Científica');
    });

    it('does not attach recommendationReason to unrecommended books (score < threshold)', () => {
      // User read Romance bookD. bookC is 'It: A Coisa' (Terror), having ~0 similarity
      const userReadings = new Map<string, BookReadingStatus>([[bookD.id, 'read']]);
      const ranked = rankCatalogBooksNative([bookC], userReadings, {
        externalHistoryBooks: [bookD],
      });

      expect(ranked[0].isRecommended).toBe(false);
      expect(ranked[0].recommendationReason).toBeUndefined();
    });

    it('formatRecommendationTag formats multi-word tags with clean capitalization', () => {
      expect(formatRecommendationTag('suspense psicológico')).toBe('Suspense Psicológico');
      expect(formatRecommendationTag('  ficção científica  ')).toBe('Ficção Científica');
      expect(formatRecommendationTag('romance')).toBe('Romance');
      expect(formatRecommendationTag('')).toBe('');
    });
  });
});

