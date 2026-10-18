'use client';

import { useState, useTransition } from 'react';
import {
  removeBookFromReadingList,
  restoreBookToReadingList,
  reorderReadingList,
  updateReadingList,
} from '@/features/lists/actions';
import { ListSharing, type ListCollaboratorItem } from './list-sharing';

type Item = { id: string; position: number };

export function ListManagement({
  listId,
  version,
  title,
  description,
  visibility = 'private',
  isCollaborative = false,
  isOwned = true,
  collaborators = [],
  items,
}: {
  listId: string;
  version: number;
  title: string;
  description: string | null;
  visibility?: 'private' | 'public' | 'unlisted';
  isCollaborative?: boolean;
  isOwned?: boolean;
  collaborators?: ListCollaboratorItem[];
  items: Item[];
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState('');
  const [busy, start] = useTransition();

  function edit(form: FormData) {
    start(async () => {
      const response = await updateReadingList({
        listId,
        title: form.get('title'),
        description: form.get('description'),
        ...(isOwned
          ? {
              visibility: form.get('visibility') === 'public' ? 'public' : 'private',
              isCollaborative: form.get('isCollaborative') === 'on',
            }
          : {}),
      });
      setResult(response.message);
    });
  }

  function move(index: number, direction: -1 | 1) {
    const next = [...items].sort((a, b) => a.position - b.position);
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    start(async () =>
      setResult(
        (
          await reorderReadingList({
            listId,
            version,
            itemIds: next.map((item) => item.id),
          })
        ).message
      )
    );
  }

  return (
    <div className="chapter-progress-actions">
      <button
        className="button button-quiet button-small"
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? 'Fechar gestão' : 'Gerenciar lista'}
      </button>
      {open && (
        <div className="member-card" style={{ marginTop: '0.75rem' }}>
          <form className="auth-form" action={edit}>
            <label>
              Nome
              <input className="field" name="title" defaultValue={title} required />
            </label>
            <label>
              Descrição
              <textarea
                className="field"
                name="description"
                defaultValue={description ?? ''}
                rows={3}
              />
            </label>
            {isOwned && (
              <>
                <label>
                  Visibilidade
                  <select
                    className="field"
                    name="visibility"
                    defaultValue={visibility === 'public' ? 'public' : 'private'}
                  >
                    <option value="private">Privada (apenas você e colaboradores)</option>
                    <option value="public">Pública (visível no perfil)</option>
                  </select>
                </label>
                <label className="checkbox-line">
                  <input
                    type="checkbox"
                    name="isCollaborative"
                    defaultChecked={isCollaborative}
                  />
                  <span>Permitir colaboração</span>
                </label>
              </>
            )}
            <button className="button button-small" disabled={busy}>
              {busy ? 'Salvando…' : 'Salvar lista'}
            </button>
          </form>

          {isOwned && (
            <ListSharing
              listId={listId}
              isOwned={isOwned}
              collaborators={collaborators}
            />
          )}

          {items.length > 1 && (
            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border-subtle, #333)' }}>
              <h4 style={{ margin: '0 0 0.5rem 0', font: '500 1rem var(--font-serif)' }}>Reordenar itens</h4>
              <div className="chapter-progress-actions">
                {items.map((item, index) => (
                  <span key={item.id}>
                    <button
                      className="button button-quiet button-small"
                      disabled={busy || index === 0}
                      onClick={() => move(index, -1)}
                      aria-label="Mover para cima"
                    >
                      ↑
                    </button>
                    <button
                      className="button button-quiet button-small"
                      disabled={busy || index === items.length - 1}
                      onClick={() => move(index, 1)}
                      aria-label="Mover para baixo"
                    >
                      ↓
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {result && <p className="action-feedback" role="status" style={{ marginTop: '0.75rem' }}>{result}</p>}
        </div>
      )}
    </div>
  );
}

export function RemoveListItemButton({
  listId,
  itemId,
}: {
  listId: string;
  itemId: string;
}) {
  const [removed, setRemoved] = useState(false);
  const [result, setResult] = useState('');
  const [busy, start] = useTransition();

  const run = (action: typeof removeBookFromReadingList) =>
    start(async () => {
      const response = await action({ listId, itemId });
      setResult(response.message);
      if (response.ok) setRemoved(action === removeBookFromReadingList);
    });

  return removed ? (
    <button
      className="button button-quiet button-small"
      type="button"
      disabled={busy}
      onClick={() => run(restoreBookToReadingList)}
    >
      Desfazer remoção
    </button>
  ) : (
    <button
      className="button button-quiet button-small"
      type="button"
      disabled={busy}
      onClick={() => run(removeBookFromReadingList)}
    >
      {result || (busy ? 'Removendo…' : 'Remover')}
    </button>
  );
}
