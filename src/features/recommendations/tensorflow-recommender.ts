import * as tf from '@tensorflow/tfjs';
import type { Book } from '@/features/catalog/queries';
import type { BookReadingStatus } from '@/features/reading/schemas';
import type {
  FeatureVocabulary,
  IndexedVocabulary,
  RecommendationOptions,
  ScoredBook,
  BookInteraction,
} from './types';
import {
  applyMMR,
  generateRecommendationReason,
  type ReasonGenerationContext,
} from './native-recommender';

const DEFAULT_OPTIONS: Required<Omit<RecommendationOptions, 'externalHistoryBooks' | 'interactions'>> = {
  recommendationThreshold: 0.15,
  readingWeight: 1.25,
  readWeight: 1.0,
  interactionWeight: 0.8,
  enableMMR: false,
  diversityLambda: 0.75,
};

/**
 * Builds normalized feature vocabulary from a list of books with O(1) indexed maps
 * and TF-IDF Inverse Document Frequency weights for tags.
 */
export function buildFeatureVocabulary(books: Book[]): IndexedVocabulary {
  const tagSet = new Set<string>();
  const authorSet = new Set<string>();
  const tagDfMap = new Map<string, number>();
  const N = books.length;

  for (const book of books) {
    if (book.author_id) {
      authorSet.add(book.author_id);
    }
    if (Array.isArray(book.tags)) {
      const bookTags = new Set<string>();
      for (const tag of book.tags) {
        const clean = tag.trim().toLowerCase();
        if (clean) bookTags.add(clean);
      }
      for (const clean of bookTags) {
        tagSet.add(clean);
        tagDfMap.set(clean, (tagDfMap.get(clean) ?? 0) + 1);
      }
    }
  }

  const tags = Array.from(tagSet).sort();
  const authorIds = Array.from(authorSet).sort();
  const tagIndexMap = new Map<string, number>(tags.map((t, i) => [t, i]));
  const authorIndexMap = new Map<string, number>(authorIds.map((a, i) => [a, i]));

  const tagIdfMap = new Map<string, number>();
  for (const tag of tags) {
    const df = tagDfMap.get(tag) ?? 0;
    // Smooth IDF formula: ln((1 + N) / (1 + df)) + 1
    const idf = Math.log((1 + N) / (1 + df)) + 1;
    tagIdfMap.set(tag, idf);
  }

  return {
    tags,
    authorIds,
    tagIndexMap,
    authorIndexMap,
    tagIdfMap,
  };
}

/**
 * Normalizes a numeric vector to unit length (L2 norm = 1).
 * Returns a new zero-filled array if the norm is below epsilon to prevent division by zero.
 */
export function normalizeVector(vector: number[], epsilon = 1e-7): number[] {
  let sumSq = 0;
  for (let i = 0; i < vector.length; i++) {
    sumSq += vector[i] * vector[i];
  }
  const norm = Math.sqrt(sumSq);
  if (norm <= epsilon) {
    return new Array(vector.length).fill(0);
  }
  const normalized = new Array<number>(vector.length);
  for (let i = 0; i < vector.length; i++) {
    normalized[i] = vector[i] / norm;
  }
  return normalized;
}

/**
 * Encodes a book into a numeric feature vector using O(1) index map lookups.
 * Tags are weighted by their IDF (Inverse Document Frequency).
 * Optionally normalizes the resulting vector to unit length (L2 norm = 1).
 */
export function vectorizeBook(
  book: Book,
  vocab: FeatureVocabulary,
  normalize = false,
): number[] {
  const vector: number[] = new Array(vocab.tags.length + vocab.authorIds.length).fill(0);

  // Author match feature (weighted 1.5 for high author affinity)
  if (book.author_id) {
    const authorIdx = vocab.authorIndexMap
      ? (vocab.authorIndexMap.get(book.author_id) ?? -1)
      : vocab.authorIds.indexOf(book.author_id);
    if (authorIdx !== -1) {
      vector[vocab.tags.length + authorIdx] = 1.5;
    }
  }

  // Tag features weighted by IDF
  if (Array.isArray(book.tags)) {
    for (const tag of book.tags) {
      const clean = tag.trim().toLowerCase();
      const tagIdx = vocab.tagIndexMap
        ? (vocab.tagIndexMap.get(clean) ?? -1)
        : vocab.tags.indexOf(clean);
      if (tagIdx !== -1) {
        vector[tagIdx] = vocab.tagIdfMap?.get(clean) ?? 1.0;
      }
    }
  }

  return normalize ? normalizeVector(vector) : vector;
}

export interface TensorFlowRecommendationDetails {
  scores: Map<string, number>;
  reasons: Map<string, string>;
  vocab: IndexedVocabulary;
  normalizedUserProfile: number[];
  candidateVectors: Map<string, number[]>;
}

/**
 * Computes recommendations and feature breakdown details using TensorFlow.js for explanation and MMR reranking.
 */
export function computeTensorFlowRecommendationsWithDetails(
  candidates: Book[],
  historyBooks: { book: Book; status: 'read' | 'reading' }[],
  options?: RecommendationOptions,
): TensorFlowRecommendationDetails {
  const scores = new Map<string, number>();
  const reasons = new Map<string, string>();
  const candidateVectorsMap = new Map<string, number[]>();
  const emptyVocab: IndexedVocabulary = {
    tags: [],
    authorIds: [],
    tagIndexMap: new Map(),
    authorIndexMap: new Map(),
    tagIdfMap: new Map(),
  };

  const interactions = options?.interactions ?? [];

  if (!candidates.length || (!historyBooks.length && !interactions.length)) {
    return {
      scores,
      reasons,
      vocab: emptyVocab,
      normalizedUserProfile: [],
      candidateVectors: candidateVectorsMap,
    };
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };

  const interactionBooks: Book[] = interactions.map((i) => ({
    id: i.bookId,
    title: i.title,
    slug: i.slug,
    author_id: i.author_id ?? '',
    tags: Array.isArray(i.tags) ? i.tags : [],
    cover_url: null,
    isbn13: null,
    language: null,
    synopsis: null,
    total_chapters: null,
    total_pages: null,
    publication_year: null,
    amazon_url: null,
    publisher: null,
    translator: null,
    publication_date: null,
    content_rating: null,
    edition_number: null,
    format: null,
    width_mm: null,
    height_mm: null,
    depth_mm: null,
  }));

  const allBooks = [...candidates, ...historyBooks.map((h) => h.book), ...interactionBooks];
  const vocab = buildFeatureVocabulary(allBooks);
  const featureDim = vocab.tags.length + vocab.authorIds.length;

  if (featureDim === 0) {
    return {
      scores,
      reasons,
      vocab,
      normalizedUserProfile: [],
      candidateVectors: candidateVectorsMap,
    };
  }

  const userProfile = new Array<number>(featureDim).fill(0);
  const historyWeightVector = new Array<number>(featureDim).fill(0);
  const interactionWeightVector = new Array<number>(featureDim).fill(0);
  let hasValidSignal = false;

  for (const item of historyBooks) {
    const weight = item.status === 'reading' ? opts.readingWeight : opts.readWeight;
    const bookVec = vectorizeBook(item.book, vocab, true);
    for (let i = 0; i < featureDim; i++) {
      if (bookVec[i] > 0) {
        const val = bookVec[i] * weight;
        userProfile[i] += val;
        historyWeightVector[i] += val;
        hasValidSignal = true;
      }
    }
  }

  if (interactions.length > 0) {
    for (let idx = 0; idx < interactions.length; idx++) {
      const interaction = interactions[idx];
      const b = interactionBooks[idx];
      const interactionWeight = interaction.weight ?? opts.interactionWeight;
      const bookVec = vectorizeBook(b, vocab, true);
      for (let i = 0; i < featureDim; i++) {
        if (bookVec[i] > 0) {
          const val = bookVec[i] * interactionWeight;
          userProfile[i] += val;
          interactionWeightVector[i] += val;
          hasValidSignal = true;
        }
      }
    }
  }

  if (!hasValidSignal) {
    return {
      scores,
      reasons,
      vocab,
      normalizedUserProfile: [],
      candidateVectors: candidateVectorsMap,
    };
  }

  const normalizedUserProfile = normalizeVector(userProfile);
  const candidateVectors = candidates.map((b) => vectorizeBook(b, vocab));
  candidates.forEach((c, idx) => {
    candidateVectorsMap.set(c.id, candidateVectors[idx]);
  });

  try {
    const rawScores = tf.tidy(() => {
      // User tensor: shape [1, featureDim]
      const userTensor = tf.tensor2d([normalizedUserProfile], [1, featureDim]);
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
      scores.set(candidate.id, rawScores[idx] ?? 0);
    });
  } catch (error) {
    console.warn('[TensorFlow Recommender] Erro ao calcular afinidade vetorial:', error);
  }

  const reasonCtx: ReasonGenerationContext = {
    vocab,
    normalizedUserProfile,
    historyWeightVector,
    interactionWeightVector,
    historyBooks,
    interactions,
  };

  for (let idx = 0; idx < candidates.length; idx++) {
    const candidate = candidates[idx];
    const score = scores.get(candidate.id) ?? 0;
    if (score >= opts.recommendationThreshold) {
      const reason = generateRecommendationReason(candidate, candidateVectors[idx], reasonCtx);
      reasons.set(candidate.id, reason);
    }
  }

  return {
    scores,
    reasons,
    vocab,
    normalizedUserProfile,
    candidateVectors: candidateVectorsMap,
  };
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
  return computeTensorFlowRecommendationsWithDetails(candidates, historyBooks, options).scores;
}

/**
 * Ranks catalog books according to user requirements:
 * 1. Top of the list: candidate books recommended by TensorFlow.js based on what was read or is being read or interacted with in browser.
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
  const hasInteractions = Boolean(options?.interactions && options.interactions.length > 0);

  // If user has no reading history and no browser interactions, return catalog in original order without badges
  if (readings.size === 0 && !hasInteractions) {
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

  if ((historyBooks.length > 0 || hasInteractions) && candidates.length > 0) {
    const details = computeTensorFlowRecommendationsWithDetails(candidates, historyBooks, opts);
    const { scores, reasons, vocab } = details;

    scoredCandidates = candidates.map((book) => {
      const score = scores.get(book.id) ?? 0;
      const status = readings.get(book.id);
      const isRecommended = score >= opts.recommendationThreshold;
      return {
        ...book,
        readingStatus: status ?? undefined,
        recommendationScore: score,
        isRecommended,
        recommendationReason: isRecommended ? reasons.get(book.id) : undefined,
      };
    });

    const shouldApplyMMR =
      options?.enableMMR === true ||
      (options?.diversityLambda !== undefined && options?.enableMMR !== false);
    const lambda = opts.diversityLambda;

    if (shouldApplyMMR) {
      const recommended = scoredCandidates.filter((b) => b.isRecommended);
      const unrecommended = scoredCandidates.filter((b) => !b.isRecommended);

      unrecommended.sort((a, b) => {
        const diff = (b.recommendationScore ?? 0) - (a.recommendationScore ?? 0);
        return Math.abs(diff) > 0.0001 ? diff : 0;
      });

      const diversifiedRecommended = applyMMR(recommended, vocab, {
        diversityLambda: lambda,
      });

      scoredCandidates = [...diversifiedRecommended, ...unrecommended];
    } else {
      // Sort candidates: highest score first; preserve original order on ties
      scoredCandidates.sort((a, b) => {
        const diff = (b.recommendationScore ?? 0) - (a.recommendationScore ?? 0);
        return Math.abs(diff) > 0.0001 ? diff : 0;
      });
    }
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
