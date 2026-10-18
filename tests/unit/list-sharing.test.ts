import { describe, it, expect } from 'vitest';
import {
  createListSchema,
  manageListSchema,
  inviteCollaboratorSchema,
  removeCollaboratorSchema,
} from '@/features/lists/schemas';

describe('reading list schemas (QA-13)', () => {
  it('validates list creation with default private visibility and isCollaborative false', () => {
    const valid = createListSchema.safeParse({
      title: 'Minha Lista de Ficção',
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.visibility).toBe('private');
      expect(valid.data.isCollaborative).toBe(false);
    }
  });

  it('validates list creation with explicit public visibility and collaborative flag', () => {
    const valid = createListSchema.safeParse({
      title: 'Lista Coletiva 2026',
      description: 'Lendo com o grupo',
      visibility: 'public',
      isCollaborative: true,
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.visibility).toBe('public');
      expect(valid.data.isCollaborative).toBe(true);
    }
  });

  it('rejects empty title or title longer than 80 characters', () => {
    expect(createListSchema.safeParse({ title: '' }).success).toBe(false);
    expect(createListSchema.safeParse({ title: 'a'.repeat(81) }).success).toBe(false);
  });

  it('validates updating list visibility and collaboration', () => {
    const valid = manageListSchema.safeParse({
      listId: '123e4567-e89b-12d3-a456-426614174000',
      title: 'Lista Atualizada',
      visibility: 'public',
      isCollaborative: true,
    });
    expect(valid.success).toBe(true);
  });

  it('validates collaborator invitation username', () => {
    const valid = inviteCollaboratorSchema.safeParse({
      listId: '123e4567-e89b-12d3-a456-426614174000',
      username: 'maria_leitora',
    });
    expect(valid.success).toBe(true);

    const invalid = inviteCollaboratorSchema.safeParse({
      listId: '123e4567-e89b-12d3-a456-426614174000',
      username: 'a',
    });
    expect(invalid.success).toBe(false);
  });

  it('validates collaborator removal by UUID', () => {
    const valid = removeCollaboratorSchema.safeParse({
      listId: '123e4567-e89b-12d3-a456-426614174000',
      userId: '223e4567-e89b-12d3-a456-426614174001',
    });
    expect(valid.success).toBe(true);

    const invalid = removeCollaboratorSchema.safeParse({
      listId: '123e4567-e89b-12d3-a456-426614174000',
      userId: 'not-a-uuid',
    });
    expect(invalid.success).toBe(false);
  });
});
