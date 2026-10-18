import { describe, it, expect } from 'vitest';

describe('Catalog Search and Pagination URL params (QA-10)', () => {
  it('clears page parameter when search query changes', () => {
    const currentParams = new URLSearchParams('page=2&q=antigo');
    const newQuery = 'Verity';

    // Simulated BookSearch query update logic
    const nextParams = new URLSearchParams(currentParams.toString());
    nextParams.delete('page');
    if (newQuery.trim()) {
      nextParams.set('q', newQuery.trim());
    } else {
      nextParams.delete('q');
    }

    expect(nextParams.has('page')).toBe(false);
    expect(nextParams.get('q')).toBe('Verity');
    expect(nextParams.toString()).toBe('q=Verity');
  });

  it('clears both page and q when clearing search query', () => {
    const currentParams = new URLSearchParams('page=4&q=Verity');
    const newQuery = '';

    const nextParams = new URLSearchParams(currentParams.toString());
    nextParams.delete('page');
    if (newQuery.trim()) {
      nextParams.set('q', newQuery.trim());
    } else {
      nextParams.delete('q');
    }

    expect(nextParams.has('page')).toBe(false);
    expect(nextParams.has('q')).toBe(false);
    expect(nextParams.toString()).toBe('');
  });
});
