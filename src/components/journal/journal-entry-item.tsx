'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { JournalEntry } from '@/features/journal/queries';
import { updateJournalEntry } from '@/features/journal/actions';
import { JournalEntryActions } from './journal-entry-actions';

export function JournalEntryItem({
  entry,
  bookTitle,
}: {
  entry: JournalEntry;
  bookTitle: string;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFeedback('');
    setBusy(true);
    const form = e.currentTarget;
    const d = new FormData(form);

    const result = await updateJournalEntry({
      id: entry.id,
      expectedVersion: entry.version,
      entryDate: d.get('entryDate'),
      title: d.get('title'),
      body: d.get('body'),
      pageFrom: d.get('pageFrom') || null,
      pageTo: d.get('pageTo') || null,
      percentAt: d.get('percentAt') || null,
      minutesRead: d.get('minutesRead') || null,
      isSpoiler: d.get('isSpoiler') === 'on',
    });

    setBusy(false);
    setFeedback(result.message);
    if (result.ok) {
      setEditing(false);
      router.refresh();
    }
  }

  if (editing) {
    return (
      <article className="member-card">
        <form onSubmit={handleSubmit}>
          <div className="section-head">
            <span className="eyebrow">Editando registro</span>
            <button
              type="button"
              className="button button-quiet button-small"
              onClick={() => setEditing(false)}
            >
              Cancelar
            </button>
          </div>

          <div className="field-group" style={{ marginTop: '12px' }}>
            <label htmlFor={`edit-date-${entry.id}`}>Data da leitura</label>
            <input
              className="field"
              id={`edit-date-${entry.id}`}
              type="date"
              name="entryDate"
              defaultValue={entry.entry_date}
              required
            />
          </div>

          <div className="field-group">
            <label htmlFor={`edit-title-${entry.id}`}>
              Título <span className="field-hint">(opcional)</span>
            </label>
            <input
              className="field"
              id={`edit-title-${entry.id}`}
              name="title"
              maxLength={160}
              defaultValue={entry.title ?? ''}
            />
          </div>

          <div className="field-group">
            <label htmlFor={`edit-body-${entry.id}`}>Anotações</label>
            <textarea
              className="field"
              id={`edit-body-${entry.id}`}
              name="body"
              rows={5}
              maxLength={20000}
              required
              defaultValue={entry.body}
            />
          </div>

          <div className="form-row-2">
            <div className="field-group">
              <label htmlFor={`edit-from-${entry.id}`}>Página inicial</label>
              <input
                className="field"
                id={`edit-from-${entry.id}`}
                name="pageFrom"
                type="number"
                min="1"
                defaultValue={entry.page_from ?? ''}
              />
            </div>
            <div className="field-group">
              <label htmlFor={`edit-to-${entry.id}`}>Página final</label>
              <input
                className="field"
                id={`edit-to-${entry.id}`}
                name="pageTo"
                type="number"
                min="1"
                defaultValue={entry.page_to ?? ''}
              />
            </div>
          </div>

          <div className="form-row-2">
            <div className="field-group">
              <label htmlFor={`edit-minutes-${entry.id}`}>Minutos lidos</label>
              <input
                className="field"
                id={`edit-minutes-${entry.id}`}
                name="minutesRead"
                type="number"
                min="0"
                max="1440"
                defaultValue={entry.minutes_read ?? ''}
              />
            </div>
            <div className="field-group">
              <label htmlFor={`edit-percent-${entry.id}`}>Progresso (%)</label>
              <input
                className="field"
                id={`edit-percent-${entry.id}`}
                name="percentAt"
                type="number"
                min="0"
                max="100"
                step="0.01"
                defaultValue={entry.percent_at ?? ''}
              />
            </div>
          </div>

          <label className="checkbox-line" style={{ margin: '12px 0' }}>
            <input
              type="checkbox"
              name="isSpoiler"
              defaultChecked={entry.is_spoiler}
            />{' '}
            Este registro contém spoiler
          </label>

          {feedback && (
            <p
              className="field-hint"
              role="status"
              aria-live="polite"
              style={{ color: 'var(--brand)', marginBottom: '12px' }}
            >
              {feedback}
            </p>
          )}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="button button-small button-dark" type="submit" disabled={busy}>
              {busy ? 'Salvando…' : 'Salvar alterações'}
            </button>
            <button
              className="button button-small button-quiet"
              type="button"
              onClick={() => setEditing(false)}
            >
              Cancelar
            </button>
          </div>
        </form>
      </article>
    );
  }

  return (
    <article className="member-card">
      <div className="section-head">
        <span className="eyebrow">
          {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(
            new Date(`${entry.entry_date}T12:00:00`),
          )}
        </span>
        <JournalEntryActions
          id={entry.id}
          archived={Boolean(entry.archived_at)}
          onEdit={() => setEditing(true)}
          isEditing={editing}
        />
      </div>
      <h3>{entry.title || bookTitle || 'Registro de leitura'}</h3>
      <p style={{ whiteSpace: 'pre-wrap' }}>{entry.body}</p>
      <p className="field-hint">
        {bookTitle ?? 'Livro'}
        {entry.page_from ? ` · páginas ${entry.page_from}${entry.page_to ? `–${entry.page_to}` : ''}` : ''}
        {entry.minutes_read ? ` · ${entry.minutes_read} min` : ''}
        {entry.is_spoiler ? ' · spoiler marcado' : ''}
        {entry.archived_at ? ' · arquivado' : ''}
      </p>
    </article>
  );
}
