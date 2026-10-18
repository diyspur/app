import type { Book } from '@/features/catalog/queries';
import type { BookReadingStatus } from '@/features/reading/schemas';
import type {
  RecommendationOptions,
  ScoredBook,
} from './types';
import {
  rankCatalogBooksNative,
  computeNativeRecommendations,
  computeCosineSimilarity,
} from './native-recommender';
import {
  rankCatalogBooks,
  computeTensorFlowRecommendations,
} from './tensorflow-recommender';

export type RecommenderBackend = 'native' | 'tensorflow';

/**
 * Resolves active recommendation backend from environment variable or defaults to 'native'.
 */
export function getRecommenderBackend(): RecommenderBackend {
  const envBackend = process.env.RECOMMENDER_BACKEND?.toLowerCase();
  if (envBackend === 'tensorflow') {
    return 'tensorflow';
  }
  return 'native';
}

/**
 * Unified strategy adapter for catalog book ranking.
 * Delegates ranking to pure JS native engine or TensorFlow.js backend based on parameter or environment configuration.
 */
export function rankCatalog(
  books: Book[],
  userReadings?: Map<string, BookReadingStatus> | null,
  options?: RecommendationOptions,
  backend: RecommenderBackend = getRecommenderBackend(),
): ScoredBook[] {
  if (backend === 'tensorflow') {
    return rankCatalogBooks(books, userReadings, options);
  }
  return rankCatalogBooksNative(books, userReadings, options);
}

export {
  rankCatalogBooksNative,
  computeNativeRecommendations,
  computeCosineSimilarity,
  rankCatalogBooks,
  computeTensorFlowRecommendations,
};
