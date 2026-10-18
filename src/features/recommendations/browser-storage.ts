import type { BookInteraction, StoredInteractionRecord } from './types';

export const BROWSER_INTERACTIONS_KEY = 'diyspur_book_memory_items';
export const MEMORY_ITEM_KEY = 'memoryItem';
const MAX_STORED_INTERACTIONS = 20;

function getStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== 'undefined' && (globalThis as unknown as { localStorage?: Storage }).localStorage) {
    return (globalThis as unknown as { localStorage: Storage }).localStorage;
  }
  return null;
}

/**
 * Calculates exponential time-decayed interaction weight.
 * Formula: weight = (clicksCount * 0.6 + viewsCount * 0.2) * exp(-ln(2) * max(0, now - lastInteractedAt) / (halfLifeDays * 86400 * 1000))
 * Default half-life: 14 days.
 */
export function calculateDecayedWeight(
  record: StoredInteractionRecord,
  now: number = Date.now(),
  halfLifeDays: number = 14,
): number {
  const baseWeight = record.clicksCount * 0.6 + record.viewsCount * 0.2;
  const deltaMs = Math.max(0, now - record.lastInteractedAt);
  const halfLifeMs = halfLifeDays * 86_400_000;
  const decay = Math.exp((-Math.LN2 * deltaMs) / halfLifeMs);
  return baseWeight * decay;
}

function parseRecord(raw: unknown): StoredInteractionRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.bookId !== 'string' || typeof r.slug !== 'string') return null;

  const clicksCount =
    typeof r.clicksCount === 'number'
      ? r.clicksCount
      : r.type === 'click'
        ? 1
        : 0;

  const viewsCount =
    typeof r.viewsCount === 'number'
      ? r.viewsCount
      : r.type === 'view'
        ? 1
        : 0;

  const lastInteractedAt =
    typeof r.lastInteractedAt === 'number'
      ? r.lastInteractedAt
      : typeof r.timestamp === 'number'
        ? r.timestamp
        : Date.now();

  const lastType =
    r.lastType === 'click' || r.lastType === 'view'
      ? r.lastType
      : r.type === 'click' || r.type === 'view'
        ? (r.type as 'click' | 'view')
        : undefined;

  return {
    bookId: r.bookId,
    slug: r.slug,
    title: typeof r.title === 'string' ? r.title : '',
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    author_id: typeof r.author_id === 'string' ? r.author_id : null,
    clicksCount,
    viewsCount,
    lastInteractedAt,
    ...(lastType ? { lastType } : {}),
  };
}

/**
 * Saves a book interaction (click or view) into browser localStorage (memoryItem).
 * Merges with existing record for the bookId (accumulating counts) and keeps the most recent items.
 */
export function saveBookInteraction(
  interaction: Omit<BookInteraction, 'timestamp'> & { timestamp?: number },
): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    const records = getStoredRecords();
    const existing = records.find((r) => r.bookId === interaction.bookId);

    const timestamp = interaction.timestamp ?? Date.now();
    const isClick = interaction.type === 'click';
    const isView = interaction.type === 'view';

    const tags =
      Array.isArray(interaction.tags) && interaction.tags.length > 0
        ? interaction.tags
        : (existing?.tags ?? (Array.isArray(interaction.tags) ? interaction.tags : []));

    const updatedRecord: StoredInteractionRecord = {
      bookId: interaction.bookId,
      slug: interaction.slug || (existing?.slug ?? ''),
      title: interaction.title || (existing?.title ?? ''),
      tags,
      author_id:
        interaction.author_id !== undefined
          ? interaction.author_id
          : (existing?.author_id ?? null),
      clicksCount: (existing?.clicksCount ?? 0) + (isClick ? 1 : 0),
      viewsCount: (existing?.viewsCount ?? 0) + (isView ? 1 : 0),
      lastInteractedAt: timestamp,
      lastType: interaction.type,
    };

    const remaining = records.filter((r) => r.bookId !== interaction.bookId);
    const updatedList = [updatedRecord, ...remaining].slice(0, MAX_STORED_INTERACTIONS);

    storage.setItem(BROWSER_INTERACTIONS_KEY, JSON.stringify(updatedList));

    // Save single latest item under 'memoryItem' for legacy/direct access
    const legacyItem: BookInteraction = {
      bookId: updatedRecord.bookId,
      slug: updatedRecord.slug,
      title: updatedRecord.title,
      tags: updatedRecord.tags,
      author_id: updatedRecord.author_id,
      timestamp: updatedRecord.lastInteractedAt,
      type: interaction.type,
      weight: calculateDecayedWeight(updatedRecord, timestamp),
    };
    storage.setItem(MEMORY_ITEM_KEY, JSON.stringify(legacyItem));
  } catch (err) {
    console.warn('[Recommendation Storage] Falha ao persistir interação no browser:', err);
  }
}

/**
 * Retrieves raw stored interaction records from browser memory.
 */
export function getStoredRecords(): StoredInteractionRecord[] {
  const storage = getStorage();
  if (!storage) {
    return [];
  }

  try {
    const raw = storage.getItem(BROWSER_INTERACTIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => parseRecord(item))
          .filter((item): item is StoredInteractionRecord => item !== null);
      }
    }

    // Fallback: check single memoryItem
    const singleRaw = storage.getItem(MEMORY_ITEM_KEY);
    if (singleRaw) {
      const single = parseRecord(JSON.parse(singleRaw));
      if (single) {
        return [single];
      }
    }
  } catch {
    // Ignore storage parse error
  }

  return [];
}

/**
 * Retrieves the stored book interactions from browser memory with decayed weights.
 */
export function getStoredInteractions(now: number = Date.now()): BookInteraction[] {
  const records = getStoredRecords();

  return records.map((record) => {
    const type: 'click' | 'view' =
      record.lastType ?? (record.clicksCount > 0 ? 'click' : 'view');

    const interaction: BookInteraction = {
      bookId: record.bookId,
      slug: record.slug,
      title: record.title,
      tags: record.tags,
      author_id: record.author_id,
      timestamp: record.lastInteractedAt,
      type,
      weight: calculateDecayedWeight(record, now),
    };

    return interaction;
  });
}

/**
 * Clears stored book interactions.
 */
export function clearStoredInteractions(): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(BROWSER_INTERACTIONS_KEY);
    storage.removeItem(MEMORY_ITEM_KEY);
  } catch {
    // Ignore storage error
  }
}
