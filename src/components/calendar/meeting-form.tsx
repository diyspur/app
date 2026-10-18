'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { createClubMeetingAction, updateClubMeetingAction } from '@/features/meetings/actions';

export interface MeetingFormProps {
  mode: 'create' | 'edit';
  clubId: string;
  bookId: string;
  bookTitle?: string;
  chapters?: Array<{ id: string; number: number; title: string }>;
  initialData?: {
    id: string;
    title: string;
    kind: 'online' | 'in_person' | 'hybrid';
    scheduledAt: string;
    durationMin: number;
    meetingUrl: string | null;
    location: string | null;
    agenda: string | null;
    spoilerPolicy: string;
    chapterId: string | null;
    version: number;
  };
  onSuccessRedirectHref?: string;
}

function toLocalDatetimeString(isoString?: string): string {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  return `${yyyy}-${MM}-${dd}T${hh}:${mm}`;
}

export function MeetingForm({
  mode,
  clubId,
  bookId,
  bookTitle,
  chapters = [],
  initialData,
  onSuccessRedirectHref,
}: MeetingFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [title, setTitle] = useState(initialData?.title ?? '');
  const [kind, setKind] = useState<'online' | 'in_person' | 'hybrid'>(initialData?.kind ?? 'online');
  const [scheduledAt, setScheduledAt] = useState(
    initialData?.scheduledAt ? toLocalDatetimeString(initialData.scheduledAt) : '',
  );
  const [durationMin, setDurationMin] = useState(initialData?.durationMin ?? 60);
  const [meetingUrl, setMeetingUrl] = useState(initialData?.meetingUrl ?? '');
  const [location, setLocation] = useState(initialData?.location ?? '');
  const [agenda, setAgenda] = useState(initialData?.agenda ?? '');
  const [spoilerPolicy, setSpoilerPolicy] = useState<'none' | 'chapter' | 'whole_book'>(
    (initialData?.spoilerPolicy as 'none' | 'chapter' | 'whole_book') ?? 'none',
  );
  const [chapterId, setChapterId] = useState<string>(initialData?.chapterId ?? '');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!title.trim() || title.trim().length < 3) {
      setErrorMsg('O título deve conter pelo menos 3 caracteres.');
      return;
    }

    if (!scheduledAt) {
      setErrorMsg('Informe a data e horário do encontro.');
      return;
    }

    const scheduledDate = new Date(scheduledAt);
    if (Number.isNaN(scheduledDate.getTime())) {
      setErrorMsg('Data e horário inválidos.');
      return;
    }

    if (meetingUrl.trim()) {
      const trimmedUrl = meetingUrl.trim();
      if (!trimmedUrl.startsWith('https://')) {
        setErrorMsg('O link do encontro deve usar HTTPS obrigatoriamente.');
        return;
      }
      try {
        new URL(trimmedUrl);
      } catch {
        setErrorMsg('Link de videoconferência inválido.');
        return;
      }
    }

    const isoScheduledAt = scheduledDate.toISOString();

    startTransition(async () => {
      if (mode === 'create') {
        const res = await createClubMeetingAction({
          clubId,
          bookId,
          chapterId: chapterId ? chapterId : null,
          title: title.trim(),
          kind,
          scheduledAt: isoScheduledAt,
          durationMin,
          meetingUrl: meetingUrl.trim() || null,
          location: location.trim() || null,
          agenda: agenda.trim() || null,
          spoilerPolicy,
          requestId: crypto.randomUUID(),
        });

        if (!res.ok) {
          setErrorMsg(res.message);
        } else {
          setSuccessMsg(res.message);
          const target = onSuccessRedirectHref ?? (res.meetingId ? `/eventos/${res.meetingId}` : '/calendario');
          router.push(target);
          router.refresh();
        }
      } else if (mode === 'edit' && initialData) {
        const res = await updateClubMeetingAction({
          meetingId: initialData.id,
          version: initialData.version,
          chapterId: chapterId ? chapterId : null,
          title: title.trim(),
          kind,
          scheduledAt: isoScheduledAt,
          durationMin,
          meetingUrl: meetingUrl.trim() || null,
          location: location.trim() || null,
          agenda: agenda.trim() || null,
          spoilerPolicy,
        });

        if (!res.ok) {
          setErrorMsg(res.message);
        } else {
          setSuccessMsg(res.message);
          const target = onSuccessRedirectHref ?? `/eventos/${initialData.id}`;
          router.push(target);
          router.refresh();
        }
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="meeting-form" noValidate>
      {bookTitle ? (
        <div className="field-group">
          <span className="field-label">Livro vinculado</span>
          <p className="field-value font-medium">{bookTitle}</p>
        </div>
      ) : null}

      <div className="field-group">
        <label htmlFor="meeting-title" className="field-label">
          Título do encontro <span aria-hidden="true">*</span>
        </label>
        <input
          id="meeting-title"
          type="text"
          className="field"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex: Discussão dos capítulos 1 a 3"
          maxLength={120}
          required
          disabled={isPending}
        />
      </div>

      <div className="form-grid">
        <div className="field-group">
          <label htmlFor="meeting-kind" className="field-label">
            Modalidade
          </label>
          <select
            id="meeting-kind"
            className="field"
            value={kind}
            onChange={(e) => setKind(e.target.value as 'online' | 'in_person' | 'hybrid')}
            disabled={isPending}
          >
            <option value="online">Online (remoto)</option>
            <option value="in_person">Presencial</option>
            <option value="hybrid">Híbrido</option>
          </select>
        </div>

        <div className="field-group">
          <label htmlFor="meeting-spoiler" className="field-label">
            Política de spoilers
          </label>
          <select
            id="meeting-spoiler"
            className="field"
            value={spoilerPolicy}
            onChange={(e) => setSpoilerPolicy(e.target.value as 'none' | 'chapter' | 'whole_book')}
            disabled={isPending}
          >
            <option value="none">Sem spoilers (introdução / boas-vindas)</option>
            <option value="chapter">Até o capítulo selecionado</option>
            <option value="whole_book">Livro completo (spoilers liberados)</option>
          </select>
        </div>
      </div>

      <div className="form-grid">
        <div className="field-group">
          <label htmlFor="meeting-date" className="field-label">
            Data e horário <span aria-hidden="true">*</span>
          </label>
          <input
            id="meeting-date"
            type="datetime-local"
            className="field"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            required
            disabled={isPending}
          />
        </div>

        <div className="field-group">
          <label htmlFor="meeting-duration" className="field-label">
            Duração estimada (minutos)
          </label>
          <input
            id="meeting-duration"
            type="number"
            className="field"
            value={durationMin}
            onChange={(e) => setDurationMin(Number(e.target.value))}
            min={15}
            max={480}
            step={15}
            disabled={isPending}
          />
        </div>
      </div>

      {chapters.length > 0 ? (
        <div className="field-group">
          <label htmlFor="meeting-chapter" className="field-label">
            Capítulo em foco (opcional)
          </label>
          <select
            id="meeting-chapter"
            className="field"
            value={chapterId}
            onChange={(e) => setChapterId(e.target.value)}
            disabled={isPending}
          >
            <option value="">Nenhum capítulo específico</option>
            {chapters.map((ch) => (
              <option key={ch.id} value={ch.id}>
                Capítulo {ch.number}: {ch.title}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {(kind === 'online' || kind === 'hybrid') && (
        <div className="field-group">
          <label htmlFor="meeting-url" className="field-label">
            Link de videoconferência (Google Meet, Zoom, Teams...)
          </label>
          <input
            id="meeting-url"
            type="url"
            className="field"
            value={meetingUrl}
            onChange={(e) => setMeetingUrl(e.target.value)}
            placeholder="https://meet.google.com/..."
            maxLength={500}
            disabled={isPending}
          />
          <span className="field-hint">Deve iniciar com https:// para segurança dos participantes.</span>
        </div>
      )}

      {(kind === 'in_person' || kind === 'hybrid') && (
        <div className="field-group">
          <label htmlFor="meeting-location" className="field-label">
            Local físico
          </label>
          <input
            id="meeting-location"
            type="text"
            className="field"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Ex: Biblioteca Central - Sala de Estudos 2"
            maxLength={250}
            disabled={isPending}
          />
        </div>
      )}

      <div className="field-group">
        <label htmlFor="meeting-agenda" className="field-label">
          Pauta / Observações (opcional)
        </label>
        <textarea
          id="meeting-agenda"
          className="field"
          value={agenda}
          onChange={(e) => setAgenda(e.target.value)}
          placeholder="Tópicos de discussão, perguntas norteadoras..."
          maxLength={2000}
          rows={3}
          disabled={isPending}
        />
      </div>

      {errorMsg ? (
        <div role="alert" className="error-banner">
          {errorMsg}
        </div>
      ) : null}

      {successMsg ? (
        <div role="status" className="success-banner">
          {successMsg}
        </div>
      ) : null}

      <div className="form-actions" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1.25rem' }}>
        <button type="submit" className="button button-small" disabled={isPending}>
          {isPending
            ? 'Salvando...'
            : mode === 'create'
              ? 'Agendar encontro'
              : 'Salvar alterações'}
        </button>
        <button
          type="button"
          className="button button-small button-quiet"
          disabled={isPending}
          onClick={() => {
            if (onSuccessRedirectHref) {
              router.push(onSuccessRedirectHref);
            } else {
              router.back();
            }
          }}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
