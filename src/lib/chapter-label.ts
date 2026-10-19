/**
 * Utilities for cleaning and formatting chapter titles and labels,
 * avoiding redundant prefixes like "Capítulo 1 · Capítulo 1 — O Início".
 */

export function cleanChapterTitle(title: string, chapterNumber?: number): string {
  if (!title) return '';
  let cleaned = title.trim();
  const prefixRegex = /^(?:cap[íi]tulo|cap\.?)\s*\d+\s*(?:[—–\-:·]\s*|\s+)/i;
  while (prefixRegex.test(cleaned)) {
    cleaned = cleaned.replace(prefixRegex, '').trim();
  }
  if (!cleaned) {
    return chapterNumber !== undefined ? `Capítulo ${chapterNumber}` : title.trim();
  }
  return cleaned;
}

export function chapterLabel(title: string, chapterNumber: number): string {
  const cleaned = cleanChapterTitle(title, chapterNumber);
  if (!cleaned || cleaned.toLowerCase() === `capítulo ${chapterNumber}`.toLowerCase()) {
    return `Capítulo ${chapterNumber}`;
  }
  return `Capítulo ${chapterNumber} · ${cleaned}`;
}
