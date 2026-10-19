import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isValidCalendarDate,
  createJournalSchema,
  updateJournalSchema,
} from '@/features/journal/schemas';
import { createJournalEntry, updateJournalEntry } from '@/features/journal/actions';
import * as sessionModule from '@/lib/auth/session';

vi.mock('@/lib/auth/session', () => ({
  requireSession: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('Journal Actions & Schemas (QA-22, QA-24)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Calendar Date Validation', () => {
    it('accepts real calendar dates', () => {
      expect(isValidCalendarDate('2026-01-15')).toBe(true);
      expect(isValidCalendarDate('2026-12-31')).toBe(true);
      expect(isValidCalendarDate('2024-02-29')).toBe(true); // 2024 is leap year
    });

    it('rejects impossible calendar dates (QA-22)', () => {
      expect(isValidCalendarDate('2026-02-31')).toBe(false); // Feb 31 does not exist
      expect(isValidCalendarDate('2026-02-29')).toBe(false); // 2026 is not leap year
      expect(isValidCalendarDate('2026-04-31')).toBe(false); // April has 30 days
      expect(isValidCalendarDate('2026-06-31')).toBe(false); // June has 30 days
      expect(isValidCalendarDate('2026-13-01')).toBe(false); // Month 13
      expect(isValidCalendarDate('not-a-date')).toBe(false);
    });
  });

  describe('Journal Zod Schemas', () => {
    it('validates creation payload with valid page range', () => {
      const valid = {
        bookId: '11111111-1111-4111-a111-111111111111',
        entryDate: '2026-10-18',
        title: 'Reflexões Capítulo 1',
        body: 'Anotações sobre a leitura.',
        pageFrom: 1,
        pageTo: 25,
        minutesRead: 30,
        isSpoiler: false,
      };
      const result = createJournalSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('rejects inverted page range (pageTo < pageFrom)', () => {
      const invalid = {
        bookId: '11111111-1111-4111-a111-111111111111',
        entryDate: '2026-10-18',
        title: 'Páginas invertidas',
        body: 'Teste de validação.',
        pageFrom: 50,
        pageTo: 20,
        isSpoiler: false,
      };
      const result = createJournalSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('maior ou igual');
      }
    });

    it('validates update payload with expectedVersion', () => {
      const validUpdate = {
        id: '22222222-2222-4222-a222-222222222222',
        expectedVersion: 2,
        entryDate: '2026-10-18',
        title: 'Título Editado',
        body: 'Texto corrigido.',
        pageFrom: 10,
        pageTo: 30,
        isSpoiler: true,
      };
      const result = updateJournalSchema.safeParse(validUpdate);
      expect(result.success).toBe(true);
    });
  });

  describe('Journal Server Actions', () => {
    it('rejects createJournalEntry when unauthenticated', async () => {
      vi.mocked(sessionModule.requireSession).mockResolvedValueOnce(null);

      const res = await createJournalEntry({
        bookId: '11111111-1111-4111-a111-111111111111',
        entryDate: '2026-10-18',
        title: 'Meu Registro',
        body: 'Conteúdo...',
        isSpoiler: false,
      });

      expect(res.ok).toBe(false);
      expect(res.code).toBe('unauthenticated');
    });

    it('rejects updateJournalEntry with impossible calendar date', async () => {
      const res = await updateJournalEntry({
        id: '22222222-2222-4222-a222-222222222222',
        entryDate: '2026-02-31',
        title: 'Data Inválida',
        body: 'Texto...',
        isSpoiler: false,
      });

      expect(res.ok).toBe(false);
      expect(res.code).toBe('validation');
    });

    it('performs atomic update when authenticated and version matches', async () => {
      const maybeSingleMock = vi.fn().mockResolvedValue({
        data: { id: '22222222-2222-4222-a222-222222222222' },
        error: null,
      });
      const selectMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
      const eqVersionMock = vi.fn().mockReturnValue({ select: selectMock });
      const eqUserMock = vi.fn().mockReturnValue({ eq: eqVersionMock });
      const eqIdMock = vi.fn().mockReturnValue({ eq: eqUserMock });
      const updateMock = vi.fn().mockReturnValue({ eq: eqIdMock });

      vi.mocked(sessionModule.requireSession).mockResolvedValueOnce({
        userId: 'user-abc',
        client: {
          from: vi.fn().mockReturnValue({
            update: updateMock,
          }),
        },
      } as any);

      const res = await updateJournalEntry({
        id: '22222222-2222-4222-a222-222222222222',
        expectedVersion: 1,
        entryDate: '2026-10-18',
        title: 'Atualizado',
        body: 'Nova reflexão',
        isSpoiler: false,
      });

      expect(res.ok).toBe(true);
      expect(res.message).toContain('atualizado');
      expect(eqIdMock).toHaveBeenCalledWith('id', '22222222-2222-4222-a222-222222222222');
      expect(eqUserMock).toHaveBeenCalledWith('user_id', 'user-abc');
      expect(eqVersionMock).toHaveBeenCalledWith('version', 1);
    });
  });

  describe('Book dictionary resolution beyond 100-limit (QA-12)', () => {
    it('returns empty array when bookIds is empty', async () => {
      const { getBooksByIds } = await import('@/features/journal/queries');
      const res = await getBooksByIds([]);
      expect(res).toEqual([]);
    });

    it('deduplicates book IDs and filters empty strings', async () => {
      const { getBooksByIds } = await import('@/features/journal/queries');
      const inMock = vi.fn().mockResolvedValue({
        data: [{ id: 'b-1', title: 'Dom Casmurro' }],
        error: null,
      });
      const selectMock = vi.fn().mockReturnValue({ in: inMock });
      const mockClient = {
        from: vi.fn().mockReturnValue({ select: selectMock }),
      };

      const res = await getBooksByIds(['b-1', 'b-1', ''], mockClient as any);
      expect(mockClient.from).toHaveBeenCalledWith('books');
      expect(selectMock).toHaveBeenCalledWith('id,title');
      expect(inMock).toHaveBeenCalledWith('id', ['b-1']);
      expect(res).toEqual([{ id: 'b-1', title: 'Dom Casmurro' }]);
    });

    it('resolves book titles beyond the first 100 catalog books in bookMap', async () => {
      const { getBooksByIds } = await import('@/features/journal/queries');
      // Simulate top 100 books from rawBooks (books 1 to 100)
      const top100Books = Array.from({ length: 100 }, (_, i) => ({
        id: `book-${i + 1}`,
        title: `Livro ${i + 1}`,
      }));

      // Simulate a journal entry referencing book-105 (beyond top 100)
      const entries = [
        { id: 'entry-1', book_id: 'book-105', title: 'Reflexões' },
        { id: 'entry-2', book_id: 'book-5', title: 'Notas' },
      ];

      const referencedBookIds = Array.from(new Set(entries.map((e) => e.book_id)));

      const mockClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [
                { id: 'book-105', title: 'Memórias Póstumas de Brás Cubas' },
                { id: 'book-5', title: 'Livro 5' },
              ],
              error: null,
            }),
          }),
        }),
      };

      const referencedBooks = await getBooksByIds(referencedBookIds, mockClient as any);

      // Decoupled dictionary population logic from page.tsx
      const bookMap = new Map<string, string>(top100Books.map((b) => [b.id, b.title]));
      for (const book of referencedBooks) {
        bookMap.set(book.id, book.title);
      }

      // Verify that book-105 does NOT fall back to 'Livro' but has its actual title
      expect(bookMap.get('book-105')).toBe('Memórias Póstumas de Brás Cubas');
      expect(bookMap.get('book-5')).toBe('Livro 5');
    });

    it('gracefully handles database errors and returns empty array', async () => {
      const { getBooksByIds } = await import('@/features/journal/queries');
      const mockClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'db error' },
            }),
          }),
        }),
      };

      const res = await getBooksByIds(['b-999'], mockClient as any);
      expect(res).toEqual([]);
    });
  });
});
