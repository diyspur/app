'use client';

import { useState, useTransition, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { reorderUpNext, removeFromUpNext } from '@/features/up-next/actions';
import type { UpNextItem } from '@/features/up-next/queries';

export function QueueManagement({ initialItems }: { initialItems: UpNextItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState<UpNextItem[]>(initialItems);
  const [feedback, setFeedback] = useState('');
  const [busy, startTransition] = useTransition();

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;

    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    setItems(next);

    startTransition(async () => {
      const bookIds = next.map((it) => it.book_id);
      const res = await reorderUpNext(bookIds);
      if (!res.ok) {
        setFeedback(res.message);
        setItems(initialItems); // rollback
      } else {
        setFeedback('Fila reordenada.');
        router.refresh();
      }
    });
  }

  function handleRemove(bookId: string) {
    startTransition(async () => {
      const next = items.filter((it) => it.book_id !== bookId);
      setItems(next);
      const res = await removeFromUpNext(bookId);
      if (!res.ok) {
        setFeedback(res.message);
        setItems(initialItems);
      } else {
        setFeedback('Livro removido da fila.');
        router.refresh();
      }
    });
  }

  if (!items.length) {
    return (
      <div className="empty-state">
        <div className="empty-state-mark" aria-hidden="true">📚</div>
        <h2>Sua fila está vazia</h2>
        <p>Navegue pelo catálogo e escolha as histórias que você quer ler a seguir.</p>
        <div className="empty-actions">
          <Link className="button button-small" href="/livros">
            Descobrir livros
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="queue-management">
      {feedback && (
        <p className="action-feedback" role="status" style={{ marginBottom: '1rem' }}>
          {feedback}
        </p>
      )}

      <div className="timeline">
        {items.map((item, index) => {
          const book = item.book;
          if (!book) return null;
          return (
            <article className="member-card" key={item.book_id}>
              <div className="section-head" style={{ alignItems: 'flex-start' }}>
                <div>
                  <span className="eyebrow">Posição #{index + 1}</span>
                  <h3 style={{ margin: '0.25rem 0' }}>
                    <Link href={`/livros/${book.slug}`} className="text-link">
                      {book.title}
                    </Link>
                  </h3>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <div className="queue-reorder-buttons" style={{ display: 'flex', gap: '0.25rem' }}>
                    <button
                      className="button button-quiet button-small"
                      type="button"
                      disabled={busy || index === 0}
                      onClick={() => handleMove(index, -1)}
                      aria-label={`Mover "${book.title}" para cima`}
                    >
                      ↑
                    </button>
                    <button
                      className="button button-quiet button-small"
                      type="button"
                      disabled={busy || index === items.length - 1}
                      onClick={() => handleMove(index, 1)}
                      aria-label={`Mover "${book.title}" para baixo`}
                    >
                      ↓
                    </button>
                  </div>
                  <button
                    className="button button-quiet button-small"
                    type="button"
                    disabled={busy}
                    onClick={() => handleRemove(book.id)}
                    aria-label={`Remover "${book.title}" da fila`}
                  >
                    Remover
                  </button>
                </div>
              </div>

              {book.synopsis && <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>{book.synopsis}</p>}

              <p className="field-hint" style={{ marginTop: '0.75rem' }}>
                {book.total_pages ? `${book.total_pages} páginas` : 'Páginas não informadas'} · Adicionado em{' '}
                {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(item.added_at))}
              </p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
