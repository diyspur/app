import { describe, it, expect } from 'vitest';

describe('official club shape invariants', () => {
  it('identifies official club and prevents private toggle', () => {
    const officialClub = {
      id: 'c1',
      slug: 'grupo-oficial',
      version: 1,
      name: 'Grupo Oficial de Leitura',
      description: null,
      is_private: false,
      kind: 'official',
      current_season_id: null,
    };

    const isOfficial = officialClub.kind === 'official';
    expect(isOfficial).toBe(true);

    // If official, isPrivate is strictly false regardless of form input
    const formGetPrivate = 'on'; // user or malicious client tried to send private=on
    const resolvedIsPrivate = isOfficial ? false : formGetPrivate === 'on';
    expect(resolvedIsPrivate).toBe(false);
  });

  it('allows custom clubs to toggle privacy', () => {
    const customClub = {
      id: 'c2',
      slug: 'meu-clube',
      version: 1,
      name: 'Meu Clube',
      description: null,
      is_private: false,
      kind: 'custom',
      current_season_id: null,
    };

    const isOfficial = customClub.kind === 'official';
    expect(isOfficial).toBe(false);

    const formGetPrivate = 'on';
    const resolvedIsPrivate = isOfficial ? false : formGetPrivate === 'on';
    expect(resolvedIsPrivate).toBe(true);
  });
});
