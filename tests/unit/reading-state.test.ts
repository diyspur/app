import { describe, expect, it } from 'vitest';
import {
  isValidReadingStatusTransition,
  setBookReadingSchema,
  type BookReadingStatus,
} from '@/features/reading/schemas';
import { getShelfStatusPresentation } from '@/features/reading/presentation';

describe('Canonical Reading State Transitions & Schemas (SDD 12.5)', () => {
  const validUUID = '123e4567-e89b-12d3-a456-426614174000';

  describe('setBookReadingSchema', () => {
    it('accepts valid status and requestId', () => {
      const parsed = setBookReadingSchema.safeParse({
        bookId: validUUID,
        status: 'reading',
        version: 1,
        requestId: validUUID,
      });

      expect(parsed.success).toBe(true);
    });

    it('rejects unknown status value', () => {
      const parsed = setBookReadingSchema.safeParse({
        bookId: validUUID,
        status: 'skimming',
        version: 1,
        requestId: validUUID,
      });

      expect(parsed.success).toBe(false);
    });

    it('requires non-negative version', () => {
      const parsed = setBookReadingSchema.safeParse({
        bookId: validUUID,
        status: 'read',
        version: -1,
        requestId: validUUID,
      });

      expect(parsed.success).toBe(false);
    });
  });

  describe('isValidReadingStatusTransition', () => {
    it('allows starting reading from null or want_to_read to want_to_read and reading', () => {
      expect(isValidReadingStatusTransition(null, 'want_to_read')).toBe(true);
      expect(isValidReadingStatusTransition(null, 'reading')).toBe(true);
      expect(isValidReadingStatusTransition('want_to_read', 'reading')).toBe(true);
      expect(isValidReadingStatusTransition('want_to_read', 'want_to_read')).toBe(true);
    });

    it('disallows jumping directly from unstarted/want_to_read to read', () => {
      expect(isValidReadingStatusTransition(null, 'read')).toBe(false);
      expect(isValidReadingStatusTransition('want_to_read', 'read')).toBe(false);
    });

    it('allows progression from reading to read or dnf', () => {
      expect(isValidReadingStatusTransition('reading', 'read')).toBe(true);
      expect(isValidReadingStatusTransition('reading', 'dnf')).toBe(true);
    });

    it('allows resuming reading from dnf', () => {
      expect(isValidReadingStatusTransition('dnf', 'reading')).toBe(true);
      expect(isValidReadingStatusTransition('dnf', 'want_to_read')).toBe(true);
    });

    it('allows re-reading a previously completed book', () => {
      expect(isValidReadingStatusTransition('read', 'reading')).toBe(true);
    });

    it('allows idempotent self-transitions', () => {
      const statuses: BookReadingStatus[] = ['want_to_read', 'reading', 'read', 'dnf'];
      for (const s of statuses) {
        expect(isValidReadingStatusTransition(s, s)).toBe(true);
      }
    });
  });

  describe('Shelf Status Presentation & Unification (QA-08)', () => {
    it('presents dnf status as "Abandonei/Não concluído"', () => {
      const presentation = getShelfStatusPresentation('dnf');
      expect(presentation.label).toBe('Abandonei/Não concluído');
      expect(presentation.badgeClass).toContain('status-pill');
    });

    it('presents all canonical reading statuses with appropriate labels', () => {
      expect(getShelfStatusPresentation('want_to_read').label).toBe('Quero ler');
      expect(getShelfStatusPresentation('reading').label).toBe('Em andamento');
      expect(getShelfStatusPresentation('read').label).toBe('Concluído');
    });

    it('falls back gracefully for unknown or null status', () => {
      expect(getShelfStatusPresentation(null).label).toBe('Sem status');
      expect(getShelfStatusPresentation('unknown_status').label).toBe('unknown_status');
    });
  });
});
