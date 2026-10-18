import type { BookReadingStatus } from '@/features/reading/schemas';
import type { Book } from '@/features/catalog/queries';

export interface UserReadingRecord {
  bookId: string;
  status: BookReadingStatus;
}

export interface FeatureVocabulary {
  tags: string[];
  authorIds: string[];
}

export interface RecommendationScore {
  bookId: string;
  score: number;
  isRecommended: boolean;
}

export interface RecommendationOptions {
  /**
   * Minimum cosine similarity score to qualify as an explicit recommendation badge.
   * Default: 0.15
   */
  recommendationThreshold?: number;
  /**
   * Weight multiplier for books currently being read (active engagement).
   * Default: 1.25
   */
  readingWeight?: number;
  /**
   * Weight multiplier for books already read (completed).
   * Default: 1.0
   */
  readWeight?: number;
  /**
   * Optional full details of books from reading history if not in current candidates list.
   */
  externalHistoryBooks?: Book[];
}

export type ScoredBook = Book & {
  readingStatus?: BookReadingStatus | null;
  isRecommended?: boolean;
  recommendationScore?: number;
};
