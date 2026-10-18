import { z } from 'zod';

export const inviteEmailSchema = z
  .object({
    bookId: z.string().uuid('Identificador do livro inválido.'),
    email: z.string().trim().email('Informe um endereço de e-mail válido.').max(255),
  })
  .strict();
