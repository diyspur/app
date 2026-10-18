'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { inviteListCollaborator, removeListCollaborator } from '@/features/lists/actions';

export type ListCollaboratorItem = {
  userId: string;
  username: string | null;
  displayName: string | null;
  canEdit: boolean;
};

export function ListSharing({
  listId,
  isOwned,
  collaborators = [],
}: {
  listId: string;
  isOwned: boolean;
  collaborators?: ListCollaboratorItem[];
}) {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, startTransition] = useTransition();

  if (!isOwned) {
    return null;
  }

  function handleInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!username.trim()) return;

    startTransition(async () => {
      const res = await inviteListCollaborator({
        listId,
        username: username.trim(),
      });
      setFeedback(res.message);
      if (res.ok) {
        setUsername('');
        router.refresh();
      }
    });
  }

  function handleRemove(userId: string) {
    startTransition(async () => {
      const res = await removeListCollaborator({
        listId,
        userId,
      });
      setFeedback(res.message);
      if (res.ok) {
        router.refresh();
      }
    });
  }

  return (
    <div className="list-sharing-section" style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--color-border-subtle, #333)' }}>
      <h4 style={{ margin: '0 0 0.5rem 0', font: '500 1rem var(--font-serif)' }}>Colaboradores da lista</h4>
      <p className="field-hint" style={{ marginBottom: '0.75rem' }}>
        Colaboradores podem adicionar e organizar livros nesta lista de leitura.
      </p>

      <form onSubmit={handleInvite} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input
          className="field"
          style={{ flex: '1 1 200px' }}
          placeholder="Nome de usuário (@leitor)"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={busy}
          aria-label="Nome de usuário para convidar como colaborador"
        />
        <button className="button button-small" type="submit" disabled={busy || !username.trim()}>
          {busy ? 'Adicionando…' : 'Adicionar colaborador'}
        </button>
      </form>

      {collaborators.length > 0 ? (
        <ul className="timeline" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {collaborators.map((c) => (
            <li
              key={c.userId}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.5rem 0',
                borderBottom: '1px solid var(--color-border-subtle, #222)',
              }}
            >
              <div>
                <strong>{c.displayName ?? c.username ?? 'Leitor'}</strong>
                {c.username && <span className="field-hint" style={{ marginLeft: '0.5rem' }}>@{c.username}</span>}
              </div>
              <button
                className="button button-quiet button-small"
                type="button"
                disabled={busy}
                onClick={() => handleRemove(c.userId)}
                aria-label={`Remover @${c.username ?? 'colaborador'}`}
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="field-hint">Nenhum colaborador adicionado ainda.</p>
      )}

      {feedback && <p className="action-feedback" role="status" style={{ marginTop: '0.5rem' }}>{feedback}</p>}
    </div>
  );
}
