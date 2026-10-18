'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { addBookToReadingList } from '@/features/lists/actions';
import type { UserEditableList } from '@/features/lists/queries';

export function AddBookToList({
  bookId,
  userLists,
  signedIn,
}: {
  bookId: string;
  userLists: UserEditableList[];
  signedIn: boolean;
}) {
  const [selectedListId, setSelectedListId] = useState<string>(userLists[0]?.id || '');
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const router = useRouter();

  if (!signedIn) {
    return (
      <Link href="/entrar?redirect=/listas" className="btn btn-outline btn-sm">
        + Salvar em uma lista
      </Link>
    );
  }

  if (userLists.length === 0) {
    return (
      <Link href="/listas" className="btn btn-outline btn-sm">
        + Criar lista de leitura
      </Link>
    );
  }

  function handleAdd() {
    if (!selectedListId) return;
    setFeedback(null);
    startTransition(async () => {
      const res = await addBookToReadingList({ listId: selectedListId, bookId });
      setFeedback(res);
      if (res.ok) {
        setTimeout(() => {
          setIsOpen(false);
          setFeedback(null);
        }, 1500);
        router.refresh();
      }
    });
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        + Salvar em lista
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            zIndex: 50,
            minWidth: '260px',
            padding: '16px',
            borderRadius: '8px',
            background: 'var(--surface-1, #1a1e27)',
            border: '1px solid var(--border-subtle, rgba(255,255,255,0.15))',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
          }}
        >
          <span style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
            Escolha uma lista:
          </span>
          <select
            className="field"
            value={selectedListId}
            onChange={(e) => setSelectedListId(e.target.value)}
            style={{ width: '100%', marginBottom: '12px' }}
          >
            {userLists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              className="button button-small"
              disabled={isPending || !selectedListId}
              onClick={handleAdd}
            >
              {isPending ? 'Salvando…' : 'Salvar'}
            </button>
            <button
              type="button"
              className="button button-small button-quiet"
              onClick={() => setIsOpen(false)}
            >
              Cancelar
            </button>
          </div>

          {feedback && (
            <p
              style={{
                fontSize: '0.8rem',
                marginTop: '8px',
                color: feedback.ok ? 'var(--brand, #f59e0b)' : 'var(--danger, #ef4444)',
              }}
              role="status"
            >
              {feedback.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
