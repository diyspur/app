import { describe, expect, it, vi } from 'vitest';
import {
  cancelMeetingSchema,
  createMeetingSchema,
  updateMeetingSchema,
} from '@/features/meetings/schemas';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

describe('Meeting & Events Validation & Security (SDD 9 & 12.6)', () => {
  const validUUID = '123e4567-e89b-12d3-a456-426614174000';

  describe('createMeetingSchema', () => {
    it('accepts valid online meeting input', () => {
      const parsed = createMeetingSchema.safeParse({
        clubId: validUUID,
        bookId: validUUID,
        title: 'Discussão dos Capítulos 1 a 3',
        kind: 'online',
        scheduledAt: '2026-10-25T20:00:00.000Z',
        durationMin: 90,
        meetingUrl: 'https://meet.google.com/abc-defg-hij',
        spoilerPolicy: 'chapter',
        requestId: validUUID,
      });

      expect(parsed.success).toBe(true);
    });

    it('rejects non-HTTPS meeting URL (security requirement)', () => {
      const parsed = createMeetingSchema.safeParse({
        clubId: validUUID,
        bookId: validUUID,
        title: 'Discussão dos Capítulos 1 a 3',
        kind: 'online',
        scheduledAt: '2026-10-25T20:00:00.000Z',
        meetingUrl: 'http://meet.google.com/insecure',
        requestId: validUUID,
      });

      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues[0]?.message).toContain('HTTPS');
      }
    });

    it('rejects duration outside allowable range (15 to 480 min)', () => {
      const tooShort = createMeetingSchema.safeParse({
        clubId: validUUID,
        bookId: validUUID,
        title: 'Curto demais',
        scheduledAt: '2026-10-25T20:00:00.000Z',
        durationMin: 5,
        requestId: validUUID,
      });
      expect(tooShort.success).toBe(false);

      const tooLong = createMeetingSchema.safeParse({
        clubId: validUUID,
        bookId: validUUID,
        title: 'Longo demais',
        scheduledAt: '2026-10-25T20:00:00.000Z',
        durationMin: 600,
        requestId: validUUID,
      });
      expect(tooLong.success).toBe(false);
    });
  });

  describe('updateMeetingSchema & cancelMeetingSchema', () => {
    it('requires optimistic concurrency version >= 1', () => {
      const validUpdate = updateMeetingSchema.safeParse({
        meetingId: validUUID,
        version: 1,
        title: 'Novo Título do Encontro',
        scheduledAt: '2026-10-25T20:00:00.000Z',
      });
      expect(validUpdate.success).toBe(true);

      const invalidVersion = updateMeetingSchema.safeParse({
        meetingId: validUUID,
        version: 0,
        title: 'Novo Título do Encontro',
        scheduledAt: '2026-10-25T20:00:00.000Z',
      });
      expect(invalidVersion.success).toBe(false);
    });

    it('validates cancellation schema', () => {
      const validCancel = cancelMeetingSchema.safeParse({
        meetingId: validUUID,
        version: 2,
      });
      expect(validCancel.success).toBe(true);
    });
  });

  describe('Stable Meeting Idempotency Fingerprint (QA-22)', () => {
    it('produces identical fingerprint for identical payloads', async () => {
      const { computeMeetingFingerprint } = await import(
        '@/components/calendar/meeting-form'
      );

      const payload1 = {
        clubId: validUUID,
        bookId: validUUID,
        chapterId: null,
        title: 'Discussão Capítulos 1 a 3',
        kind: 'online',
        scheduledAt: '2026-10-25T20:00:00.000Z',
        durationMin: 60,
        meetingUrl: 'https://meet.google.com/abc-defg-hij',
        location: null,
        agenda: 'Pauta inicial',
        spoilerPolicy: 'chapter',
      };

      const payload2 = {
        ...payload1,
        title: '  Discussão Capítulos 1 a 3  ',
        meetingUrl: 'https://meet.google.com/abc-defg-hij  ',
        agenda: '  Pauta inicial  ',
      };

      const fp1 = computeMeetingFingerprint(payload1);
      const fp2 = computeMeetingFingerprint(payload2);

      expect(fp1).toBe(fp2);
    });

    it('produces distinct fingerprint when any logical field is modified', async () => {
      const { computeMeetingFingerprint } = await import(
        '@/components/calendar/meeting-form'
      );

      const base = {
        clubId: validUUID,
        bookId: validUUID,
        chapterId: null,
        title: 'Discussão Inicial',
        kind: 'online',
        scheduledAt: '2026-10-25T20:00:00.000Z',
        durationMin: 60,
        meetingUrl: 'https://meet.google.com/abc',
        location: null,
        agenda: null,
        spoilerPolicy: 'none',
      };

      const baseFp = computeMeetingFingerprint(base);

      // Modified title
      expect(computeMeetingFingerprint({ ...base, title: 'Outro Título' })).not.toBe(baseFp);
      // Modified date
      expect(computeMeetingFingerprint({ ...base, scheduledAt: '2026-10-26T20:00:00.000Z' })).not.toBe(baseFp);
      // Modified duration
      expect(computeMeetingFingerprint({ ...base, durationMin: 90 })).not.toBe(baseFp);
      // Modified kind
      expect(computeMeetingFingerprint({ ...base, kind: 'in_person' })).not.toBe(baseFp);
      // Modified spoiler policy
      expect(computeMeetingFingerprint({ ...base, spoilerPolicy: 'chapter' })).not.toBe(baseFp);
    });

    it('simulates retry logic: reuses requestId on unchanged payload, generates new on modified payload', async () => {
      const { computeMeetingFingerprint } = await import(
        '@/components/calendar/meeting-form'
      );

      let keyRef: { fingerprint: string; id: string } | null = null;

      function getOrCreateRequestId(payload: Parameters<typeof computeMeetingFingerprint>[0]) {
        const fp = computeMeetingFingerprint(payload);
        const id = keyRef?.fingerprint === fp ? keyRef.id : 'uuid-' + Math.random().toString(36).slice(2);
        keyRef = { fingerprint: fp, id };
        return id;
      }

      const payload = {
        clubId: validUUID,
        bookId: validUUID,
        chapterId: null,
        title: 'Discussão',
        kind: 'online',
        scheduledAt: '2026-10-25T20:00:00.000Z',
        durationMin: 60,
        meetingUrl: 'https://meet.google.com/abc',
        location: null,
        agenda: null,
        spoilerPolicy: 'none',
      };

      // First submit attempt
      const firstId = getOrCreateRequestId(payload);

      // Retry after network failure (identical payload)
      const retryId = getOrCreateRequestId(payload);
      expect(retryId).toBe(firstId);

      // User changes title and submits
      const changedId = getOrCreateRequestId({ ...payload, title: 'Discussão Modificada' });
      expect(changedId).not.toBe(firstId);
    });
  });

  describe('Semantic Layouts and CSS Integrity (QA-01, QA-23)', () => {
    it('defines all required semantic classes in global.css', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const cssPath = path.resolve(__dirname, '../../src/styles/global.css');
      const css = fs.readFileSync(cssPath, 'utf-8');

      const requiredClasses = [
        '.meeting-detail-layout',
        '.meeting-meta',
        '.meeting-context-tags',
        '.meeting-links',
        '.club-header-actions',
        '.meeting-management-actions',
        '.meeting-management',
        '.meeting-detail-card',
        '.meeting-details-body',
      ];

      for (const cls of requiredClasses) {
        expect(css).toContain(cls);
      }
    });

    it('ensures meeting and club hub files do not use orphan Tailwind utilities', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');

      const filesToCheck = [
        path.resolve(__dirname, '../../src/app/calendario/page.tsx'),
        path.resolve(__dirname, '../../src/app/eventos/[id]/page.tsx'),
        path.resolve(__dirname, '../../src/components/calendar/meeting-manage-actions.tsx'),
        path.resolve(__dirname, '../../src/app/clubes/[slug]/page.tsx'),
      ];

      const orphanUtilities = ['md:grid-cols-3', 'space-y-6', 'gap-2', 'text-xs', 'hover:underline'];

      for (const file of filesToCheck) {
        const content = fs.readFileSync(file, 'utf-8');
        for (const util of orphanUtilities) {
          expect(content).not.toContain(util);
        }
      }
    });

    it('ensures semantic classes are used in meeting detail and calendar pages', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');

      const calendarContent = fs.readFileSync(
        path.resolve(__dirname, '../../src/app/calendario/page.tsx'),
        'utf-8'
      );
      expect(calendarContent).toContain('meeting-context-tags');
      expect(calendarContent).toContain('meeting-links');

      const eventDetailContent = fs.readFileSync(
        path.resolve(__dirname, '../../src/app/eventos/[id]/page.tsx'),
        'utf-8'
      );
      expect(eventDetailContent).toContain('meeting-detail-layout');
      expect(eventDetailContent).toContain('meeting-details-body');
      expect(eventDetailContent).toContain('meeting-detail-card');
      expect(eventDetailContent).toContain('meeting-links');
      expect(eventDetailContent).toContain('meeting-meta');

      const manageActionsContent = fs.readFileSync(
        path.resolve(__dirname, '../../src/components/calendar/meeting-manage-actions.tsx'),
        'utf-8'
      );
      expect(manageActionsContent).toContain('meeting-management');
      expect(manageActionsContent).toContain('meeting-management-actions');

      const clubHubContent = fs.readFileSync(
        path.resolve(__dirname, '../../src/app/clubes/[slug]/page.tsx'),
        'utf-8'
      );
      expect(clubHubContent).toContain('club-header-actions');
      expect(clubHubContent).toContain('meeting-management-actions');
    });

    it('ensures club settings page has semantic h1 page-intro header (QA-23)', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');

      const configContent = fs.readFileSync(
        path.resolve(__dirname, '../../src/app/clubes/[slug]/configuracoes/page.tsx'),
        'utf-8'
      );

      expect(configContent).toContain('<header className="page-intro">');
      expect(configContent).toContain('<span className="eyebrow">Gestão do clube</span>');
      expect(configContent).toContain('<h1>Configurações de {club.name}</h1>');
    });

    it('renders MeetingManageActions with semantic CSS classes and without orphan classes', async () => {
      const React = await import('react');
      const { renderToStaticMarkup } = await import('react-dom/server');

      const { MeetingManageActions } = await import(
        '@/components/calendar/meeting-manage-actions'
      );

      const mockMeeting: any = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Discussão Semanal',
        scheduledAt: '2026-10-25T20:00:00.000Z',
        durationMin: 90,
        kind: 'online',
        status: 'scheduled',
        location: null,
        meetingUrl: 'https://meet.google.com/abc',
        agenda: 'Pauta geral',
        slidesUrl: null,
        spoilerPolicy: 'none',
        version: 1,
        updatedAt: '2026-10-18T00:00:00.000Z',
        createdBy: null,
        book: { id: 'book-1', slug: 'livro-1', title: 'Livro Teste', coverUrl: null },
        club: { id: 'club-1', slug: 'clube-1', name: 'Clube Teste', isPrivate: false, kind: 'standard' },
        chapter: null,
        attendeesCount: 5,
        userRsvp: true,
        canManage: true,
        viewerId: 'user-1',
      };

      const html = renderToStaticMarkup(
        React.createElement(MeetingManageActions, { meeting: mockMeeting })
      );

      expect(html).toContain('meeting-management');
      expect(html).toContain('meeting-management-actions');
      expect(html).not.toContain('gap-2');
      expect(html).not.toContain('gap-3');
      expect(html).not.toContain('space-y-6');
      expect(html).not.toContain('text-xs');
      expect(html).not.toContain('md:grid-cols-3');
    });
  });
});

