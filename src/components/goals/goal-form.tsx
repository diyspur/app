'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setReadingGoal, archiveReadingGoal } from '@/features/goals/actions';
import type { ReadingGoal } from '@/features/goals/queries';

export function GoalForm({
  goal,
  year,
  onFinished,
}: {
  goal: ReadingGoal | null;
  year: number;
  onFinished?: () => void;
}) {
  const [busy, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const router = useRouter();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    const form = new FormData(event.currentTarget);
    const title = form.get('title') as string;
    const targetBooks = form.get('targetBooks');
    const targetPages = form.get('targetPages');
    const targetMinutes = form.get('targetMinutes');

    startTransition(async () => {
      const result = await setReadingGoal({
        id: goal?.id,
        title: title || 'Minha meta de leitura',
        year,
        targetBooks: targetBooks ? Number(targetBooks) : null,
        targetPages: targetPages ? Number(targetPages) : null,
        targetMinutes: targetMinutes ? Number(targetMinutes) : null,
        version: goal?.version,
      });
      setFeedback(result);
      if (result.ok) {
        router.refresh();
        onFinished?.();
      }
    });
  }

  function handleArchive() {
    if (!goal) return;
    if (!confirm('Deseja realmente arquivar esta meta?')) return;
    setFeedback(null);
    startTransition(async () => {
      const result = await archiveReadingGoal(goal.id, goal.version);
      setFeedback(result);
      if (result.ok) {
        router.refresh();
        onFinished?.();
      }
    });
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor={`goal-title-${goal?.id || 'new'}`}>Título da Meta</label>
        <input
          id={`goal-title-${goal?.id || 'new'}`}
          name="title"
          type="text"
          maxLength={120}
          className="field"
          placeholder="Ex: Ler mais não-ficção em 2026"
          defaultValue={goal?.title ?? ''}
          required
        />
      </div>

      <div className="form-group">
        <label htmlFor={`targetBooks-${goal?.id || 'new'}`}>Meta de Livros lidos em {year}</label>
        <input
          id={`targetBooks-${goal?.id || 'new'}`}
          name="targetBooks"
          type="number"
          min="1"
          max="365"
          className="field"
          placeholder="Ex: 12"
          defaultValue={goal?.target_books ?? ''}
        />
        <span className="field-hint">Quantos livros você planeja concluir ao longo do ano.</span>
      </div>

      <div className="form-group">
        <label htmlFor={`targetPages-${goal?.id || 'new'}`}>Meta de Páginas lidas</label>
        <input
          id={`targetPages-${goal?.id || 'new'}`}
          name="targetPages"
          type="number"
          min="1"
          max="50000"
          className="field"
          placeholder="Ex: 3000"
          defaultValue={goal?.target_pages ?? ''}
        />
        <span className="field-hint">Calculado a partir dos registros do seu diário de leitura.</span>
      </div>

      <div className="form-group">
        <label htmlFor={`targetMinutes-${goal?.id || 'new'}`}>Meta de Minutos dedicados</label>
        <input
          id={`targetMinutes-${goal?.id || 'new'}`}
          name="targetMinutes"
          type="number"
          min="1"
          max="500000"
          className="field"
          placeholder="Ex: 6000"
          defaultValue={goal?.target_minutes ?? ''}
        />
        <span className="field-hint">Minutos de leitura anotados no seu diário.</span>
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '12px' }}>
        <button className="button button-small" type="submit" disabled={busy}>
          {busy ? 'Salvando…' : goal ? 'Atualizar meta' : 'Criar nova meta'}
        </button>
        {goal && (
          <button
            type="button"
            className="button button-small button-quiet"
            disabled={busy}
            onClick={handleArchive}
            style={{ color: 'var(--danger, #ef4444)' }}
          >
            Arquivar
          </button>
        )}
      </div>

      {feedback && (
        <p className={`action-feedback ${feedback.ok ? 'success' : 'error'}`} role="status">
          {feedback.message}
        </p>
      )}
    </form>
  );
}
