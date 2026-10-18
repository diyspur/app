'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { archiveJournalEntry, restoreJournalEntry } from '@/features/journal/actions';

export function JournalEntryActions({
  id,
  archived = false,
  onEdit,
  isEditing = false,
}: {
  id: string;
  archived?: boolean;
  onEdit?: () => void;
  isEditing?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState('');
  const router = useRouter();
  const action = archived ? restoreJournalEntry : archiveJournalEntry;

  function run() {
    setFeedback('');
    startTransition(async () => {
      const result = await action(id);
      setFeedback(result.message);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      {!archived && onEdit && (
        <button
          className="button button-quiet button-small"
          type="button"
          onClick={onEdit}
          disabled={pending}
        >
          {isEditing ? 'Cancelar' : 'Editar'}
        </button>
      )}
      <button
        className="button button-quiet button-small"
        type="button"
        onClick={run}
        disabled={pending}
      >
        {pending ? 'Salvando…' : archived ? 'Restaurar' : 'Arquivar'}
      </button>
      {feedback && (
        <p className="field-hint" role="status" aria-live="polite">
          {feedback}
        </p>
      )}
    </div>
  );
}
