'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { cancelClubMeetingAction } from '@/features/meetings/actions';
import type { MeetingDetailView } from '@/features/meetings/queries';
import { MeetingForm } from './meeting-form';

export interface MeetingManageActionsProps {
  meeting: MeetingDetailView;
  chapters?: Array<{ id: string; number: number; title: string }>;
}

export function MeetingManageActions({ meeting, chapters = [] }: MeetingManageActionsProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);

  function handleCancelMeeting() {
    setErrorMsg(null);
    startTransition(async () => {
      const res = await cancelClubMeetingAction({
        meetingId: meeting.id,
        version: meeting.version,
      });

      if (!res.ok) {
        setErrorMsg(res.message);
      } else {
        setShowConfirmCancel(false);
        router.refresh();
      }
    });
  }

  if (meeting.status === 'cancelled') {
    return (
      <div className="callout callout-warning">
        <p style={{ fontWeight: 600 }}>Este encontro foi cancelado pela moderação.</p>
      </div>
    );
  }

  return (
    <div className="meeting-management" style={{ marginTop: 'var(--space-6)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
        <div>
          <h3>Painel da Moderação</h3>
          <p className="field-hint">
            Gerencie as informações ou o status deste encontro.
          </p>
        </div>
        <div className="meeting-management-actions">
          <button
            type="button"
            className="button button-small button-outline"
            onClick={() => setIsEditing(!isEditing)}
            disabled={isPending}
          >
            {isEditing ? 'Fechar edição' : 'Editar encontro'}
          </button>
          {!showConfirmCancel ? (
            <button
              type="button"
              className="button button-small button-danger"
              onClick={() => setShowConfirmCancel(true)}
              disabled={isPending}
            >
              Cancelar encontro
            </button>
          ) : (
            <div className="meeting-management-actions">
              <button
                type="button"
                className="button button-small button-danger"
                onClick={handleCancelMeeting}
                disabled={isPending}
              >
                {isPending ? 'Cancelando...' : 'Confirmar cancelamento'}
              </button>
              <button
                type="button"
                className="button button-small button-outline"
                onClick={() => setShowConfirmCancel(false)}
                disabled={isPending}
              >
                Voltar
              </button>
            </div>
          )}
        </div>
      </div>

      {errorMsg ? (
        <div role="alert" className="error-banner" style={{ marginBottom: 'var(--space-4)' }}>
          {errorMsg}
        </div>
      ) : null}

      {isEditing ? (
        <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border)' }}>
          <MeetingForm
            mode="edit"
            clubId={meeting.club?.id ?? ''}
            bookId={meeting.book.id}
            bookTitle={meeting.book.title}
            chapters={chapters}
            initialData={{
              id: meeting.id,
              title: meeting.title,
              kind: meeting.kind,
              scheduledAt: meeting.scheduledAt,
              durationMin: meeting.durationMin,
              meetingUrl: meeting.meetingUrl,
              location: meeting.location,
              agenda: meeting.agenda,
              spoilerPolicy: meeting.spoilerPolicy,
              chapterId: meeting.chapter?.id ?? null,
              version: meeting.version,
            }}
            onSuccessRedirectHref={`/eventos/${meeting.id}`}
          />
        </div>
      ) : null}
    </div>
  );
}
