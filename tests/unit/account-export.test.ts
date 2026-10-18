import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/account/export/route';
import { createServerSupabase } from '@/lib/supabase/clients';

vi.mock('@/lib/supabase/clients', () => ({
  createServerSupabase: vi.fn(),
}));

describe('Account Data Export (QA-11)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects unauthenticated requests with 401', async () => {
    vi.mocked(createServerSupabase).mockResolvedValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({ data: null, error: new Error('no session') }),
      },
    } as any);

    const response = await GET();
    expect(response.status).toBe(401);
  });

  it('returns valid JSON with schema-aligned projections and complete status', async () => {
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'user-1' }, error: null }),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
          is: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      }),
    });

    vi.mocked(createServerSupabase).mockResolvedValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: { sub: 'user-1' } },
          error: null,
        }),
      },
      from: mockFrom,
    } as any);

    const response = await GET();
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.account.id).toBe('user-1');
    expect(json.status).toBe('complete');
    expect(json).toHaveProperty('readingGoals');
    expect(json).toHaveProperty('communityMessages');
    expect(json).toHaveProperty('channelConsents');
  });
});
