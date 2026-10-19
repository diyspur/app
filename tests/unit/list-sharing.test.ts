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

  it('validates collaborator invitation username and normalizes @usuario to lowercase', () => {
    const validWithAt = inviteCollaboratorSchema.safeParse({
      listId: '123e4567-e89b-12d3-a456-426614174000',
      username: '@Maria_Leitora',
    });
    expect(validWithAt.success).toBe(true);
    if (validWithAt.success) {
      expect(validWithAt.data.username).toBe('maria_leitora');
    }

    const validWithoutAt = inviteCollaboratorSchema.safeParse({
      listId: '123e4567-e89b-12d3-a456-426614174000',
      username: 'MARIA_LEITORA',
    });
    expect(validWithoutAt.success).toBe(true);
    if (validWithoutAt.success) {
      expect(validWithoutAt.data.username).toBe('maria_leitora');
    }
  });

  it('rejects collaborator usernames with %, spaces, or special characters (QA-18)', () => {
    const invalidInputs = [
      '%usuario%',
      'maria%',
      '%leitor',
      '@user%name',
      'admin%',
      'maria leitora',
      '@maria leitora',
      'user name',
      'user!name',
      'user-name',
      'user.name',
      'user$name',
      '@user#name',
    ];

    for (const username of invalidInputs) {
      const parsed = inviteCollaboratorSchema.safeParse({
        listId: '123e4567-e89b-12d3-a456-426614174000',
        username,
      });
      expect(parsed.success).toBe(false);
    }
  });

  it('rejects collaborator usernames shorter than 3 or longer than 24 characters', () => {
    const invalidLengths = ['a', 'ab', '@ab', 'a'.repeat(25), '@' + 'a'.repeat(25)];
    for (const username of invalidLengths) {
      const parsed = inviteCollaboratorSchema.safeParse({
        listId: '123e4567-e89b-12d3-a456-426614174000',
        username,
      });
      expect(parsed.success).toBe(false);
    }
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
