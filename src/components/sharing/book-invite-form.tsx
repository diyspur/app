'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { sendBookInvitation } from '@/features/book-invitations/actions';

export function BookInviteForm({
  bookId,
  bookTitle,
}: {
  bookId: string;
  bookTitle: string;
}) {
  const [email, setEmail] = useState('');
  const [busy, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setFeedback(null);
    startTransition(async () => {
      const res = await sendBookInvitation({ bookId, email });
      setFeedback(res);
      if (res.ok) {
        setEmail('');
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: '16px' }}>
      <label htmlFor="invite-email" style={{ display: 'block', fontSize: '0.9rem', marginBottom: '6px' }}>
        E-mail do amigo para ler <strong>{bookTitle}</strong> em companhia:
      </label>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <input
          id="invite-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="amigo@exemplo.com"
          className="field"
          style={{ flex: 1, minWidth: '220px' }}
          required
        />
        <button type="submit" className="button button-small" disabled={busy || !email}>
          {busy ? 'Enviando…' : 'Enviar convite'}
        </button>
      </div>

      {feedback && (
        <p
          style={{
            fontSize: '0.85rem',
            marginTop: '8px',
            color: feedback.ok ? 'var(--brand, #f59e0b)' : 'var(--danger, #ef4444)',
          }}
          role="status"
        >
          {feedback.message}
        </p>
      )}
    </form>
  );
}
