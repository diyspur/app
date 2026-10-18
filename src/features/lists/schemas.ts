import { z } from 'zod';

export const listVisibilitySchema = z.enum(['private', 'public']);

export const createListSchema = z.object({
  title: z.string().trim().min(1, 'Dê um nome para sua lista.').max(80),
  description: z.string().trim().max(500).optional(),
  visibility: listVisibilitySchema.default('private'),
  isCollaborative: z.boolean().default(false),
}).strict();

export const manageListSchema = z.object({
  listId: z.string().uuid(),
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  visibility: listVisibilitySchema.optional(),
  isCollaborative: z.boolean().optional(),
}).strict();

export const addListItemSchema = z.object({
  listId: z.string().uuid(),
  bookId: z.string().uuid(),
}).strict();

export const removeListItemSchema = z.object({
  listId: z.string().uuid(),
  itemId: z.string().uuid(),
}).strict();

export const reorderListSchema = z.object({
  listId: z.string().uuid(),
  version: z.number().int().positive(),
  itemIds: z.array(z.string().uuid()).max(500),
}).strict();

export const inviteCollaboratorSchema = z.object({
  listId: z.string().uuid(),
  username: z.string().trim().min(2, 'Informe o nome de usuário.').max(30),
}).strict();

export const removeCollaboratorSchema = z.object({
  listId: z.string().uuid(),
  userId: z.string().uuid(),
}).strict();
