import { z } from 'zod';

export const goalSchema = z
  .object({
    id: z.string().uuid().optional(),
    title: z.string().trim().min(1).max(120).optional(),
    year: z.coerce.number().int().min(2020).max(2050),
    targetBooks: z.coerce.number().int().positive().max(1000).nullable().optional(),
    targetPages: z.coerce.number().int().positive().max(1000000).nullable().optional(),
    targetMinutes: z.coerce.number().int().positive().max(1000000).nullable().optional(),
    version: z.coerce.number().int().nonnegative().optional(),
  })
  .strict()
  .refine(
    (v) =>
      (v.targetBooks != null && v.targetBooks > 0) ||
      (v.targetPages != null && v.targetPages > 0) ||
      (v.targetMinutes != null && v.targetMinutes > 0),
    { message: 'Defina pelo menos um objetivo (livros, páginas ou minutos).' },
  );

export type GoalInput = z.infer<typeof goalSchema>;
