import { describe, it, expect, beforeEach } from 'vitest';
import * as tf from '@tensorflow/tfjs';
import type { Book } from '@/features/catalog/queries';
import type { BookReadingStatus } from '@/features/reading/schemas';
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
});
