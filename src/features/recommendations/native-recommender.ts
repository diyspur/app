import type { Book } from '@/features/catalog/queries';
import type { BookReadingStatus } from '@/features/reading/schemas';
import type {
  FeatureVocabulary,
  IndexedVocabulary,
  RecommendationOptions,
  ScoredBook,
  BookInteraction,
} from './types';

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

/**
 * Computes cosine similarity between two numeric vectors in pure JavaScript without external dependencies.
 */
export function computeCosineSimilarity(vecA: number[], vecB: number[], epsilon = 1e-7): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(vecA.length, vecB.length);

  for (let i = 0; i < len; i++) {
    const a = vecA[i];
    const b = vecB[i];
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > epsilon ? dot / denom : 0;
}

/**
 * Formats a tag string for user-facing recommendation badges.
 * Capitalizes the first character of each word.
 */
export function formatRecommendationTag(tag: string): string {
  if (!tag) return tag;
  const trimmed = tag.trim();
  return trimmed
    .split(/\s+/)
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : ''))
    .join(' ');
}

export interface ReasonGenerationContext {
  vocab: FeatureVocabulary;
  normalizedUserProfile: number[];
  historyWeightVector: number[];
  interactionWeightVector: number[];
  historyBooks?: { book: Book; status: 'read' | 'reading' }[];
  interactions?: BookInteraction[];
}

/**
 * Generates an explainable recommendation reason based on the feature with the highest
 * inner product contribution between the book vector and the user profile.
 */
export function generateRecommendationReason(
  candidate: Book,
  candidateVector: number[],
  ctx: ReasonGenerationContext,
): string {
  const {
    vocab,
    normalizedUserProfile,
    historyWeightVector,
    interactionWeightVector,
    historyBooks,
    interactions,
  } = ctx;
  const numTags = vocab.tags.length;
  const numAuthors = vocab.authorIds.length;
  const totalDim = numTags + numAuthors;

  let maxContrib = -1;
  let maxIdx = -1;

  for (let i = 0; i < totalDim; i++) {
    const candidateVal = candidateVector[i];
    const userVal = normalizedUserProfile[i];
    if (candidateVal > 0 && userVal > 0) {
      const contrib = candidateVal * userVal;
      if (contrib > maxContrib) {
        maxContrib = contrib;
        maxIdx = i;
      }
    }
  }

  if (maxIdx === -1 || maxContrib <= 0) {
    return 'Recomendado com base nas suas leituras';
  }

  // Author match dominant
  if (maxIdx >= numTags) {
    const authorId = vocab.authorIds[maxIdx - numTags];
    const matchingHistoryBook = historyBooks?.find((h) => h.book.author_id === authorId)?.book;
    if (matchingHistoryBook?.title) {
      return `Do mesmo autor de ${matchingHistoryBook.title}`;
    }
    const matchingInteraction = interactions?.find((it) => it.author_id === authorId);
    if (matchingInteraction?.title) {
      return `Do mesmo autor de ${matchingInteraction.title}`;
    }
    return 'Do mesmo autor de suas leituras';
  }

  // Tag match dominant
  const rawTag = vocab.tags[maxIdx];
  const matchingCandidateTag = candidate.tags?.find((t) => t.trim().toLowerCase() === rawTag);
  const displayTag = formatRecommendationTag(matchingCandidateTag ?? rawTag);

  const historyWeight = historyWeightVector[maxIdx] ?? 0;
  const interactionWeight = interactionWeightVector[maxIdx] ?? 0;

  if (interactionWeight > historyWeight) {
    return `Com base no seu interesse em ${displayTag}`;
  }

  return `Recomendado por afinidade com ${displayTag}`;
}

/**
 * Reranks candidate books using Maximal Marginal Relevance (MMR) greedy selection:
 * b* = argmax_{b in C \ S} [ lambda * sim(b, u) - (1 - lambda) * max_{s in S} sim(b, s) ]
 *
 * Balances relevance to user profile with diversity across recommended items,
 * preventing a single author or genre from dominating all top positions.
 */
export function applyMMR(
  candidates: ScoredBook[],
  vocab: FeatureVocabulary,
  options?: {
    diversityLambda?: number;
  },
): ScoredBook[] {
  if (candidates.length <= 1) return [...candidates];

  const lambda = Math.max(0, Math.min(1, options?.diversityLambda ?? 0.75));

  // Pre-vectorize and normalize candidates
  const candidateVectors = new Map<string, number[]>();
  for (const c of candidates) {
    candidateVectors.set(c.id, vectorizeBook(c, vocab, true));
  }

  const remaining = [...candidates];
  const selected: ScoredBook[] = [];
  const maxSimToSelected = new Map<string, number>();
  for (const c of remaining) {
    maxSimToSelected.set(c.id, 0);
  }

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      const simUser = candidate.recommendationScore ?? 0;
      const maxSimSelected = maxSimToSelected.get(candidate.id) ?? 0;
      const mmrScore = lambda * simUser - (1 - lambda) * maxSimSelected;

      if (mmrScore > bestScore + 1e-6) {
        bestScore = mmrScore;
        bestIdx = i;
      } else if (Math.abs(mmrScore - bestScore) <= 1e-6) {
        // Tie-breaker: higher user relevance first, then preserve initial candidate order
        const currentBestSim = remaining[bestIdx].recommendationScore ?? 0;
        if (simUser > currentBestSim + 1e-6) {
          bestScore = mmrScore;
          bestIdx = i;
        }
      }
    }

    const [chosen] = remaining.splice(bestIdx, 1);
    selected.push(chosen);

    const chosenVec = candidateVectors.get(chosen.id);
    if (chosenVec) {
      for (const rem of remaining) {
        const remVec = candidateVectors.get(rem.id);
        if (remVec) {
          const sim = computeCosineSimilarity(remVec, chosenVec);
          const currentMax = maxSimToSelected.get(rem.id) ?? 0;
          if (sim > currentMax) {
            maxSimToSelected.set(rem.id, sim);
          }
        }
      }
    }
  }

  return selected;
}

export interface NativeRecommendationDetails {
  scores: Map<string, number>;
  reasons: Map<string, string>;
  vocab: IndexedVocabulary;
  normalizedUserProfile: number[];
  candidateVectors: Map<string, number[]>;
}

/**
 * Computes recommendations and feature breakdown details for explanation and MMR reranking.
 */
export function computeNativeRecommendationsWithDetails(
  candidates: Book[],
  historyBooks: { book: Book; status: 'read' | 'reading' }[],
  options?: RecommendationOptions,
): NativeRecommendationDetails {
  const scores = new Map<string, number>();
  const reasons = new Map<string, string>();
  const candidateVectors = new Map<string, number[]>();
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
      candidateVectors,
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
      candidateVectors,
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
      candidateVectors,
    };
  }

  const normalizedUserProfile = normalizeVector(userProfile);

  const reasonCtx: ReasonGenerationContext = {
    vocab,
    normalizedUserProfile,
    historyWeightVector,
    interactionWeightVector,
    historyBooks,
    interactions,
  };

  for (const candidate of candidates) {
    const candidateVec = vectorizeBook(candidate, vocab);
    candidateVectors.set(candidate.id, candidateVec);
    const score = computeCosineSimilarity(candidateVec, normalizedUserProfile);
    scores.set(candidate.id, score);

    if (score >= opts.recommendationThreshold) {
      const reason = generateRecommendationReason(candidate, candidateVec, reasonCtx);
      reasons.set(candidate.id, reason);
    }
  }

  return {
    scores,
    reasons,
    vocab,
    normalizedUserProfile,
    candidateVectors,
  };
}

/**
 * Computes cosine similarity between candidate books and user reading history using pure JavaScript float operations.
 * Allocates zero tensors and runs synchronously with microsecond latency.
 */
export function computeNativeRecommendations(
  candidates: Book[],
  historyBooks: { book: Book; status: 'read' | 'reading' }[],
  options?: RecommendationOptions,
): Map<string, number> {
  return computeNativeRecommendationsWithDetails(candidates, historyBooks, options).scores;
}

/**
 * Ranks catalog books according to user requirements using pure JS engine:
 * 1. Top of the list: candidate books recommended based on what was read, is being read, or interacted with.
 * 2. Unread candidate books without strong affinity follow.
 * 3. Bottom of the list: books already read ('read'), in progress ('reading'), or dropped ('dnf').
 */
export function rankCatalogBooksNative(
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
    const details = computeNativeRecommendationsWithDetails(candidates, historyBooks, opts);
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
