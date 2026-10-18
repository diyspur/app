import * as tf from '@tensorflow/tfjs';
import type { Book } from '@/features/catalog/queries';
import type { BookReadingStatus } from '@/features/reading/schemas';
import type {
  FeatureVocabulary,
  RecommendationOptions,
  ScoredBook,
} from './types';

const DEFAULT_OPTIONS: Required<Omit<RecommendationOptions, 'externalHistoryBooks'>> = {
  recommendationThreshold: 0.15,
  readingWeight: 1.25,
  readWeight: 1.0,
};

/**
 * Builds normalized feature vocabulary from a list of books.
 */
export function buildFeatureVocabulary(books: Book[]): FeatureVocabulary {
  const tagSet = new Set<string>();
  const authorSet = new Set<string>();

  for (const book of books) {
    if (book.author_id) {
      authorSet.add(book.author_id);
    }
    if (Array.isArray(book.tags)) {
      for (const tag of book.tags) {
        const clean = tag.trim().toLowerCase();
        if (clean) tagSet.add(clean);
      }
    }
  }

  return {
    tags: Array.from(tagSet).sort(),
    authorIds: Array.from(authorSet).sort(),
  };
}

/**
 * Encodes a book into a numeric feature vector.
 */
export function vectorizeBook(book: Book, vocab: FeatureVocabulary): number[] {
  const vector: number[] = new Array(vocab.tags.length + vocab.authorIds.length).fill(0);

  // Author match feature (weighted 1.5 for high author affinity)
  if (book.author_id) {
    const authorIdx = vocab.authorIds.indexOf(book.author_id);
    if (authorIdx !== -1) {
      vector[vocab.tags.length + authorIdx] = 1.5;
    }
  }

  // Tag features
  if (Array.isArray(book.tags)) {
    for (const tag of book.tags) {
      const clean = tag.trim().toLowerCase();
      const tagIdx = vocab.tags.indexOf(clean);
      if (tagIdx !== -1) {
        vector[tagIdx] = 1.0;
      }
    }
  }

  return vector;
}

/**
 * Computes cosine similarity between candidate books and user reading history using TensorFlow.js.
 * All tensor allocations are executed inside tf.tidy() to prevent memory leaks.
 */
export function computeTensorFlowRecommendations(
  candidates: Book[],
  historyBooks: { book: Book; status: 'read' | 'reading' }[],
  options?: RecommendationOptions,
): Map<string, number> {
  const scoresMap = new Map<string, number>();

  if (!candidates.length || !historyBooks.length) {
    return scoresMap;
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };
  const allBooks = [...candidates, ...historyBooks.map((h) => h.book)];
  const vocab = buildFeatureVocabulary(allBooks);
  const featureDim = vocab.tags.length + vocab.authorIds.length;

  if (featureDim === 0) {
    return scoresMap;
  }

  // Construct user profile vector as weighted sum of read & reading books
  const userProfile = new Array<number>(featureDim).fill(0);
  let hasValidSignal = false;

  for (const item of historyBooks) {
    const weight = item.status === 'reading' ? opts.readingWeight : opts.readWeight;
    const bookVec = vectorizeBook(item.book, vocab);
    for (let i = 0; i < featureDim; i++) {
      if (bookVec[i] > 0) {
        userProfile[i] += bookVec[i] * weight;
        hasValidSignal = true;
      }
    }
  }

  if (!hasValidSignal) {
    return scoresMap;
  }

  const candidateVectors = candidates.map((b) => vectorizeBook(b, vocab));

  try {
    const scores = tf.tidy(() => {
      // User tensor: shape [1, featureDim]
      const userTensor = tf.tensor2d([userProfile], [1, featureDim]);
      // Candidates tensor: shape [numCandidates, featureDim]
      const candTensor = tf.tensor2d(candidateVectors, [candidates.length, featureDim]);

      // L2 Norm with epsilon to avoid division by zero
      const epsilon = 1e-7;
      const userNorm = tf.div(
        userTensor,
        tf.maximum(tf.norm(userTensor, 'euclidean', 1, true), epsilon),
      );
      const candNorm = tf.div(
        candTensor,
        tf.maximum(tf.norm(candTensor, 'euclidean', 1, true), epsilon),
      );

      // Cosine similarity: [numCandidates, featureDim] x [featureDim, 1] => [numCandidates, 1]
      const similarity = tf.matMul(candNorm, userNorm, false, true);

      return Array.from(similarity.dataSync());
    });

    candidates.forEach((candidate, idx) => {
      scoresMap.set(candidate.id, scores[idx] ?? 0);
    });
  } catch (error) {
    console.warn('[TensorFlow Recommender] Erro ao calcular afinidade vetorial:', error);
  }

  return scoresMap;
}

/**
 * Ranks catalog books according to user requirements:
 * 1. Top of the list: candidate books recommended by TensorFlow.js based on what was read or is being read.
 * 2. Unread candidate books without strong affinity follow.
 * 3. Bottom of the list: books already read ('read'), in progress ('reading'), or dropped ('dnf').
 */
export function rankCatalogBooks(
  books: Book[],
  userReadings?: Map<string, BookReadingStatus> | null,
  options?: RecommendationOptions,
): ScoredBook[] {
  if (!books.length) return [];

  const readings = userReadings ?? new Map<string, BookReadingStatus>();

  // If user has no reading history, return catalog in original order without badges
  if (readings.size === 0) {
    return books.map((book) => ({
      ...book,
      isRecommended: false,
    }));
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Partition into candidates (unread / want_to_read) vs bottom group (reading, read, dnf)
  const candidates: Book[] = [];
  const bottomGroup: Book[] = [];

  for (const book of books) {
    const status = readings.get(book.id);
    if (status === 'read' || status === 'reading' || status === 'dnf') {
      bottomGroup.push(book);
    } else {
      candidates.push(book);
    }
  }

  // Extract history books (read & reading) from the full book list or external details
  const historyMap = new Map<string, Book>();
  for (const book of books) {
    historyMap.set(book.id, book);
  }
  if (Array.isArray(options?.externalHistoryBooks)) {
    for (const book of options.externalHistoryBooks) {
      if (!historyMap.has(book.id)) {
        historyMap.set(book.id, book);
      }
    }
  }

  const historyBooks: { book: Book; status: 'read' | 'reading' }[] = [];
  for (const [bookId, status] of readings.entries()) {
    if (status === 'read' || status === 'reading') {
      const book = historyMap.get(bookId);
      if (book) {
        historyBooks.push({ book, status });
      }
    }
  }

  let scoredCandidates: ScoredBook[] = [];

  if (historyBooks.length > 0 && candidates.length > 0) {
    const scores = computeTensorFlowRecommendations(candidates, historyBooks, opts);

    scoredCandidates = candidates.map((book) => {
      const score = scores.get(book.id) ?? 0;
      const status = readings.get(book.id);
      return {
        ...book,
        readingStatus: status ?? undefined,
        recommendationScore: score,
        isRecommended: score >= opts.recommendationThreshold,
      };
    });

    // Sort candidates: highest score first; preserve original order on ties
    scoredCandidates.sort((a, b) => {
      const diff = (b.recommendationScore ?? 0) - (a.recommendationScore ?? 0);
      return Math.abs(diff) > 0.0001 ? diff : 0;
    });
  } else {
    scoredCandidates = candidates.map((book) => ({
      ...book,
      readingStatus: readings.get(book.id) ?? undefined,
      isRecommended: false,
    }));
  }

  // Map bottom group with their reading status
  const scoredBottomGroup: ScoredBook[] = bottomGroup.map((book) => {
    const status = readings.get(book.id);
    return {
      ...book,
      readingStatus: status ?? null,
      isRecommended: false,
    };
  });

  return [...scoredCandidates, ...scoredBottomGroup];
}
