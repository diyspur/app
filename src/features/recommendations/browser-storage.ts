import type { BookInteraction } from './types';

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
 * Saves a book interaction (click or view) into browser localStorage (memoryItem).
 * Deduplicates by bookId and keeps the most recent items.
 */
export function saveBookInteraction(
  interaction: Omit<BookInteraction, 'timestamp'> & { timestamp?: number },
): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    const item: BookInteraction = {
      bookId: interaction.bookId,
      slug: interaction.slug,
      title: interaction.title,
      tags: Array.isArray(interaction.tags) ? interaction.tags : [],
      author_id: interaction.author_id ?? null,
      timestamp: interaction.timestamp ?? Date.now(),
      type: interaction.type,
    };

    // Save single latest item under 'memoryItem' for legacy/direct access
    storage.setItem(MEMORY_ITEM_KEY, JSON.stringify(item));

    // Save to list
    const existing = getStoredInteractions();
    const filtered = existing.filter((i) => i.bookId !== item.bookId);
    const updated = [item, ...filtered].slice(0, MAX_STORED_INTERACTIONS);

    storage.setItem(BROWSER_INTERACTIONS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('[Recommendation Storage] Falha ao persistir interação no browser:', err);
  }
}

/**
 * Retrieves the stored book interactions from browser memory.
 */
export function getStoredInteractions(): BookInteraction[] {
  const storage = getStorage();
  if (!storage) {
    return [];
  }

  try {
    const raw = storage.getItem(BROWSER_INTERACTIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (i) => i && typeof i.bookId === 'string' && typeof i.slug === 'string',
        );
      }
    }

    // Fallback: check single memoryItem
    const singleRaw = storage.getItem(MEMORY_ITEM_KEY);
    if (singleRaw) {
      const single = JSON.parse(singleRaw);
      if (single && typeof single.bookId === 'string') {
        return [single];
      }
    }
  } catch {
    // Ignore storage parse error
  }

  return [];
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
