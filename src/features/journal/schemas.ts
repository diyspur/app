import { z } from 'zod';

export function isValidCalendarDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export const journalDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de data inválido. Use AAAA-MM-DD.')
  .refine(isValidCalendarDate, {
    message: 'Data de leitura inexistente no calendário.',
  });

export const createJournalSchema = z
  .object({
    bookId: z.string().uuid('ID do livro inválido.'),
    chapterId: z.string().uuid().nullable().optional(),
    entryDate: journalDateSchema,
    title: z.string().trim().max(160, 'O título deve ter até 160 caracteres.'),
    body: z.string().trim().min(1, 'Escreva pelo menos algumas palavras sobre sua leitura.').max(20000),
    pageFrom: z.coerce.number().int().positive().nullable().optional(),
    pageTo: z.coerce.number().int().positive().nullable().optional(),
    percentAt: z.coerce.number().min(0).max(100).nullable().optional(),
    minutesRead: z.coerce.number().int().min(0).max(1440).nullable().optional(),
    isSpoiler: z.boolean().default(false),
  })
  .strict()
  .refine(
    (data) => {
      if (data.pageFrom && data.pageTo) {
        return data.pageTo >= data.pageFrom;
      }
      return true;
    },
    {
      message: 'A página final precisa ser maior ou igual à inicial.',
      path: ['pageTo'],
    }
  );

export const updateJournalSchema = z
  .object({
    id: z.string().uuid('ID do registro inválido.'),
    expectedVersion: z.coerce.number().int().positive().optional(),
    entryDate: journalDateSchema,
    title: z.string().trim().max(160, 'O título deve ter até 160 caracteres.'),
    body: z.string().trim().min(1, 'O corpo do registro não pode ficar vazio.').max(20000),
    pageFrom: z.coerce.number().int().positive().nullable().optional(),
    pageTo: z.coerce.number().int().positive().nullable().optional(),
    percentAt: z.coerce.number().min(0).max(100).nullable().optional(),
    minutesRead: z.coerce.number().int().min(0).max(1440).nullable().optional(),
    isSpoiler: z.boolean().default(false),
  })
  .strict()
  .refine(
    (data) => {
      if (data.pageFrom && data.pageTo) {
        return data.pageTo >= data.pageFrom;
      }
      return true;
    },
    {
      message: 'A página final precisa ser maior ou igual à inicial.',
      path: ['pageTo'],
    }
  );

export type CreateJournalInput = z.infer<typeof createJournalSchema>;
export type UpdateJournalInput = z.infer<typeof updateJournalSchema>;
