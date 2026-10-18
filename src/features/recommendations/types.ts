import type { BookReadingStatus } from '@/features/reading/schemas';
import type { Book } from '@/features/catalog/queries';

export interface UserReadingRecord {
  bookId: string;
  status: BookReadingStatus;
}

export interface FeatureVocabulary {
  tags: string[];
  authorIds: string[];
  tagIndexMap?: Map<string, number>;
  authorIndexMap?: Map<string, number>;
  tagIdfMap?: Map<string, number>;
}

export interface IndexedVocabulary extends FeatureVocabulary {
  tags: string[];
  authorIds: string[];
  tagIndexMap: Map<string, number>;
  authorIndexMap: Map<string, number>;
  tagIdfMap: Map<string, number>;
}

export interface RecommendationScore {
  bookId: string;
  score: number;
  isRecommended: boolean;
  reason?: string;
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
  /**
   * Weight multiplier for books interacted with (clicked/viewed).
   * Default: 0.8
   */
  interactionWeight?: number;
  /**
   * Books recently viewed or clicked by the user stored in browser memory.
   */
  interactions?: BookInteraction[];
  /**
   * Enables Maximal Marginal Relevance (MMR) diversity reranking.
   * Default: false
   */
  enableMMR?: boolean;
  /**
   * Diversity parameter lambda for MMR in [0, 1].
   * 1.0 = pure relevance, 0.0 = maximal diversity.
   * Default: 0.75
   */
  diversityLambda?: number;
}

export interface StoredInteractionRecord {
  bookId: string;
  slug: string;
  title: string;
  tags: string[];
  author_id: string | null;
  clicksCount: number;
  viewsCount: number;
  lastInteractedAt: number;
  lastType?: 'click' | 'view';
}

export interface BookInteraction {
  bookId: string;
  slug: string;
  title: string;
  tags?: string[] | null;
  author_id?: string | null;
  timestamp: number;
  type: 'click' | 'view';
  weight?: number;
}

export type ScoredBook = Book & {
  readingStatus?: BookReadingStatus | null;
  isRecommended?: boolean;
  recommendationScore?: number;
  recommendationReason?: string;
};
