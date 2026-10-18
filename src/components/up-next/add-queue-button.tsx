'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addToUpNext, removeFromUpNext } from '@/features/up-next/actions';

export function AddQueueButton({
  bookId,
  initialInQueue = false,
  signedIn = false,
}: {
  bookId: string;
  initialInQueue?: boolean;
  signedIn?: boolean;
}) {
  const [inQueue, setInQueue] = useState(initialInQueue);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const router = useRouter();

  function handleToggle() {
    if (!signedIn) {
      router.push(`/entrar?redirect=/minha-fila`);
      return;
    }

    setFeedback(null);
    startTransition(async () => {
      if (inQueue) {
        const res = await removeFromUpNext(bookId);
        if (res.ok) {
          setInQueue(false);
          setFeedback('Removido da sua fila.');
          router.refresh();
        } else {
          setFeedback(res.message);
        }
      } else {
        const res = await addToUpNext(bookId);
        if (res.ok) {
          setInQueue(true);
          setFeedback('Adicionado à sua fila de leitura!');
          router.refresh();
        } else {
          setFeedback(res.message);
        }
      }
    });
  }

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '4px' }}>
      <button
        type="button"
        className={`btn btn-sm ${inQueue ? 'btn-secondary' : 'btn-outline'}`}
        disabled={isPending}
        onClick={handleToggle}
        aria-pressed={inQueue}
      >
        {isPending ? 'Atualizando…' : inQueue ? '✓ Na sua fila de leitura' : '+ Adicionar à minha fila'}
      </button>
      {feedback && (
        <span
          style={{ fontSize: '0.8rem', color: inQueue ? 'var(--brand, #f59e0b)' : 'var(--text-secondary)' }}
          role="status"
        >
          {feedback}
        </span>
      )}
    </div>
  );
}
