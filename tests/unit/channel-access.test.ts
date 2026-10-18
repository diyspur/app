import { describe, it, expect } from 'vitest';
import {
  channelAccessReasonSchema,
  resolveChannelAccessState,
  type ChannelAccessReason,
} from '@/features/discussions/access';

describe('Channel Access Reason and Resolution (QA-04)', () => {
  it('validates the canonical SQL channel access reasons', () => {
    const validReasons: ChannelAccessReason[] = [
      'ok',
      'unauthenticated',
      'not_member',
      'banned',
      'chapter_locked',
      'chapter_unread',
      'consent_required',
    ];

    for (const reason of validReasons) {
      const parsed = channelAccessReasonSchema.safeParse(reason);
      expect(parsed.success).toBe(true);
    }

    const invalid = channelAccessReasonSchema.safeParse('spoiler_consent_required');
    expect(invalid.success).toBe(false);
  });

  it('resolves consent_required to a spoiler consent requirement', () => {
    const state = resolveChannelAccessState('consent_required', false, false);
    expect(state.kind).toBe('consent_required');
    expect(state.requiresConsent).toBe(true);
    expect(state.actionLabel).toContain('spoilers');
  });

  it('resolves chapter_unread to advice to read the chapter first', () => {
    const state = resolveChannelAccessState('chapter_unread', true, false);
    expect(state.kind).toBe('chapter_unread');
    expect(state.requiresConsent).toBe(false);
    expect(state.message).toContain('capítulo');
  });

  it('resolves not_member to membership invitation', () => {
    const state = resolveChannelAccessState('not_member', false, false);
    expect(state.kind).toBe('not_member');
    expect(state.canInteract).toBe(false);
  });

  it('resolves ok to accessible channel state', () => {
    const state = resolveChannelAccessState('ok', true, true);
    expect(state.kind).toBe('accessible');
    expect(state.canInteract).toBe(true);
    expect(state.requiresConsent).toBe(false);
  });
});
