import { z } from 'zod';

export const goalSchema = z
  .object({
    id: z.string().uuid().optional(),
    title: z.string().trim().min(1).max(120).optional(),
    year: z.coerce.number().int().min(2020).max(2050),
    targetBooks: z.coerce.number().int().min(1, 'Mínimo de 1 livro.').max(365, 'Máximo de 365 livros por ano.').nullable().optional(),
    targetPages: z.coerce.number().int().min(1, 'Mínimo de 1 página.').max(50000, 'Máximo de 50.000 páginas por ano.').nullable().optional(),
    targetMinutes: z.coerce.number().int().min(1, 'Mínimo de 1 minuto.').max(500000, 'Máximo de 500.000 minutos por ano.').nullable().optional(),
    version: z.coerce.number().int().nonnegative().optional(),
  })
  .strict()
  .refine(
    (v) =>
      (v.targetBooks != null && v.targetBooks > 0) ||
      (v.targetPages != null && v.targetPages > 0) ||
      (v.targetMinutes != null && v.targetMinutes > 0),
    { message: 'Defina pelo menos um objetivo (livros, páginas ou minutos).' },
  )
  .refine(
    (v) => !v.id || v.version != null,
    { message: 'Versão da meta é obrigatória para atualização.', path: ['version'] },
  );

export type GoalInput = z.infer<typeof goalSchema>;
