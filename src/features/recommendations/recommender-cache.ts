import type { BookReadingStatus } from '@/features/reading/schemas';

export interface CachedRankingMetadata {
  readingStatus?: BookReadingStatus | null;
  isRecommended?: boolean;
  recommendationScore?: number;
  recommendationReason?: string;
}

export interface CachedRanking {
  rankedBookIds: string[];
  total: number;
  timestamp: number;
  ttlMs: number;
  metaById?: Map<string, CachedRankingMetadata>;
}

export interface CachedRankingResult {
  rankedBookIds: string[];
  total: number;
  metaById?: Map<string, CachedRankingMetadata>;
}

export const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const MAX_CACHE_ENTRIES = 1000;

const rankingCache = new Map<string, CachedRanking>();

/**
 * Retrieves the cached ranked book IDs and total count for a given session key.
 * Returns null if the entry does not exist or has expired.
 */
export function getCachedRanking(key: string): CachedRankingResult | null {
  const entry = rankingCache.get(key);
  if (!entry) return null;

  const now = Date.now();
  if (now - entry.timestamp > entry.ttlMs) {
    rankingCache.delete(key);
    return null;
  }

  return {
    rankedBookIds: entry.rankedBookIds,
    total: entry.total,
    metaById: entry.metaById,
  };
}

/**
 * Stores ranked book IDs and total in the session cache with TTL.
 */
export function setCachedRanking(
  key: string,
  ids: string[],
  total: number,
  ttlMs: number = DEFAULT_TTL_MS,
  metaById?: Map<string, CachedRankingMetadata>,
): void {
  if (rankingCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = rankingCache.keys().next().value;
    if (oldestKey) {
      rankingCache.delete(oldestKey);
    }
  }

  rankingCache.set(key, {
    rankedBookIds: [...ids],
    total,
    timestamp: Date.now(),
    ttlMs: Math.max(0, ttlMs),
    metaById,
  });
}

/**
 * Invalidates all cache entries belonging to a specific user.
 */
export function invalidateUserRanking(userId: string): void {
  if (!userId) return;

  for (const key of rankingCache.keys()) {
    if (key === userId || key.startsWith(`${userId}:`)) {
      rankingCache.delete(key);
    }
  }
}

/**
 * Clears the entire recommender cache.
 */
export function clearRecommenderCache(): void {
  rankingCache.clear();
}

/**
 * Returns current number of cached sessions (useful for tests and monitoring).
 */
export function getRecommenderCacheSize(): number {
  return rankingCache.size;
}
