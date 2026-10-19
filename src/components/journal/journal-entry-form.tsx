'use client';

import { useState, useEffect, useTransition, type FormEvent } from 'react';
import { createJournalEntry } from '@/features/journal/actions';
import { localDateInputValue } from '@/lib/reading-date';

export function JournalEntryForm({
  books,
}: {
  books: { id: string; title: string }[];
}) {
  const [busy, startTransition] = useTransition();
  const [feedback, setFeedback] = useState('');
  const [entryDate, setEntryDate] = useState('');

  useEffect(() => {
    setEntryDate(localDateInputValue());
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const d = new FormData(form);
    startTransition(async () => {
      const result = await createJournalEntry({
        bookId: d.get('bookId'),
        chapterId: null,
        entryDate: d.get('entryDate'),
        title: d.get('title'),
        body: d.get('body'),
        pageFrom: d.get('pageFrom') || null,
        pageTo: d.get('pageTo') || null,
        percentAt: d.get('percentAt') || null,
        minutesRead: d.get('minutesRead') || null,
        isSpoiler: d.get('isSpoiler') === 'on',
      });
      setFeedback(result.message);
      if (result.ok) {
        form.reset();
        setEntryDate(localDateInputValue());
      }
    });
  }

  return (
    <form className="member-card auth-form" onSubmit={submit}>
      <div>
        <span className="eyebrow">Registro privado</span>
        <h2>Como foi a leitura?</h2>
        <p className="field-hint">
          Este registro começa privado. Nada é publicado sem uma decisão explícita de compartilhamento.
        </p>
      </div>

      <div className="field-group">
        <label htmlFor="journal-book">Livro</label>
        <select className="field" id="journal-book" name="bookId" required defaultValue="">
          <option value="" disabled>
            Escolha um livro
          </option>
          {books.map((book) => (
            <option key={book.id} value={book.id}>
              {book.title}
            </option>
          ))}
        </select>
      </div>

      <div className="field-group">
        <label htmlFor="journal-date">Data da leitura</label>
        <input
          className="field"
          id="journal-date"
          type="date"
          name="entryDate"
          value={entryDate}
          onChange={(e) => setEntryDate(e.target.value)}
          required
        />
      </div>

      <div className="field-group">
        <label htmlFor="journal-title">
          Título <span className="field-hint">(opcional)</span>
        </label>
        <input className="field" id="journal-title" name="title" maxLength={160} />
      </div>

      <div className="field-group">
        <label htmlFor="journal-body">Anotações</label>
        <textarea
          className="field"
          id="journal-body"
          name="body"
          rows={6}
          maxLength={20000}
          required
          placeholder="O que ficou reverberando depois da leitura?"
        />
      </div>

      <div className="form-row-2">
        <div className="field-group">
          <label htmlFor="journal-from">Página inicial</label>
          <input className="field" id="journal-from" name="pageFrom" type="number" min="1" />
        </div>
        <div className="field-group">
          <label htmlFor="journal-to">Página final</label>
          <input className="field" id="journal-to" name="pageTo" type="number" min="1" />
        </div>
      </div>

      <div className="form-row-2">
        <div className="field-group">
          <label htmlFor="journal-minutes">Minutos lidos</label>
          <input
            className="field"
            id="journal-minutes"
            name="minutesRead"
            type="number"
            min="0"
            max="1440"
          />
        </div>
        <div className="field-group">
          <label htmlFor="journal-percent">Progresso (%)</label>
          <input
            className="field"
            id="journal-percent"
            name="percentAt"
            type="number"
            min="0"
            max="100"
            step="0.01"
          />
        </div>
      </div>

      <label className="checkbox-line">
        <input type="checkbox" name="isSpoiler" /> Este registro contém spoiler
      </label>

      <button className="button" type="submit" disabled={busy}>
        {busy ? 'Salvando…' : 'Salvar no diário'}
      </button>

      {feedback && <p className="action-feedback" role="status">{feedback}</p>}
    </form>
  );
}
