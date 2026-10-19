import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MeetingManageActions } from '@/components/calendar/meeting-manage-actions';
import { MeetingRsvp } from '@/components/calendar/meeting-rsvp';
import { JsonLd } from '@/components/json-ld';
import { getMeetingDetail } from '@/features/meetings/queries';
import { getGoogleCalendarUrl, getMeetingEventSchema, sanitizeCalendarUrl } from '@/lib/calendar-links';
import { createServerSupabase } from '@/lib/supabase/clients';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const meeting = await getMeetingDetail(id);
  if (!meeting) {
    return { title: 'Encontro não encontrado | DIYSPUR' };
  }
  return {
    title: `${meeting.title} — Encontros | DIYSPUR`,
    description: `Participe do debate sobre "${meeting.book.title}". Horário de Brasília, confirmação de presença e links para Google Agenda e ICS.`,
    alternates: { canonical: `/eventos/${id}` },
  };
}

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const meeting = await getMeetingDetail(id);

  if (!meeting) {
    notFound();
  }

  // Se o encontro estiver associado a um livro, busca capítulos da temporada para edição
  let chapters: Array<{ id: string; number: number; title: string }> = [];
  if (meeting.canManage && meeting.book.id) {
    try {
      const supabase = await createServerSupabase();
      const { data } = await supabase
        .from('chapters')
        .select('id, number, title, seasons!inner(book_id)')
        .eq('seasons.book_id', meeting.book.id)
        .order('number');
      if (data) {
        chapters = data.map((ch) => ({
          id: ch.id,
          number: ch.number,
          title: ch.title,
        }));
      }
    } catch {
      chapters = [];
    }
  }

  const startDate = new Date(meeting.scheduledAt);
  const formattedDate = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(startDate);

  const safeMeetingUrl = sanitizeCalendarUrl(meeting.meetingUrl);

  const googleCalUrl = getGoogleCalendarUrl({
    id: meeting.id,
    title: meeting.title,
    scheduled_at: meeting.scheduledAt,
    duration_min: meeting.durationMin,
    agenda: meeting.agenda,
    location: meeting.location,
    meeting_url: meeting.meetingUrl,
    status: meeting.status,
    version: meeting.version,
    updated_at: meeting.updatedAt,
  });

  const eventSchema = getMeetingEventSchema({
    id: meeting.id,
    title: meeting.title,
    scheduled_at: meeting.scheduledAt,
    duration_min: meeting.durationMin,
    agenda: meeting.agenda,
    location: meeting.location,
    meeting_url: meeting.meetingUrl,
    status: meeting.status,
    version: meeting.version,
    updated_at: meeting.updatedAt,
  });

  const spoilerPolicyLabels: Record<string, string> = {
    none: 'Livre de Spoilers',
    chapter: meeting.chapter ? `Spoilers até o Capítulo ${meeting.chapter.number}` : 'Spoilers por capítulo',
    whole_book: 'Livro Completo (Spoilers liberados)',
  };

  const statusLabels: Record<string, { label: string; class: string }> = {
    scheduled: { label: 'Agendado', class: 'badge-scheduled' },
    live: { label: 'AO VIVO', class: 'badge-live' },
    done: { label: 'Concluído', class: 'badge-done' },
    cancelled: { label: 'Cancelado', class: 'badge-cancelled' },
  };

  const currentStatus = statusLabels[meeting.status] ?? {
    label: meeting.status,
    class: 'badge-scheduled',
  };

  return (
    <main id="main-content" className="shell-container page-stack">
      <JsonLd data={eventSchema as unknown as Record<string, unknown>} />

      <nav aria-label="Navegação estrutural" className="breadcrumbs">
        <Link href="/calendario" className="text-link">
          &larr; Voltar para o Calendário
        </Link>
      </nav>

      <header className="meeting-detail-header meeting-detail-card">
        <div className="meeting-meta">
          <span className={`status-badge ${currentStatus.class}`}>
            {currentStatus.label}
          </span>
          <span className="badge badge-outline">
            {meeting.kind === 'online'
              ? 'Online'
              : meeting.kind === 'in_person'
                ? 'Presencial'
                : 'Híbrido'}
          </span>
          <span className="badge badge-outline">
            {spoilerPolicyLabels[meeting.spoilerPolicy] ?? meeting.spoilerPolicy}
          </span>
        </div>

        <h1 style={{ marginBlock: 'var(--space-3)' }}>{meeting.title}</h1>

        <p style={{ marginBlock: 'var(--space-3)', color: 'var(--brand)', fontWeight: 'var(--weight-medium)' }}>
          <time dateTime={meeting.scheduledAt}>{formattedDate}</time> (Horário de Brasília)
          <span style={{ color: 'var(--text-tertiary)', fontWeight: 'normal', marginLeft: 'var(--space-2)' }}>
            &bull; Duração: {meeting.durationMin} min
          </span>
        </p>

        <div className="meeting-context-tags" style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-4)' }}>
          <div>
            <span className="field-hint" style={{ display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>
              Livro
            </span>
            {meeting.book.slug ? (
              <Link
                href={`/livros/${meeting.book.slug}`}
                className="text-link"
              >
                {meeting.book.title}
              </Link>
            ) : (
              <span>{meeting.book.title}</span>
            )}
          </div>

          {meeting.club ? (
            <div>
              <span className="field-hint" style={{ display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>
                Clube
              </span>
              <Link
                href={`/clubes/${meeting.club.slug}`}
                className="text-link"
              >
                {meeting.club.name}
              </Link>
            </div>
          ) : null}

          {meeting.chapter ? (
            <div>
              <span className="field-hint" style={{ display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>
                Capítulo em foco
              </span>
              <Link
                href={`/capitulos/${meeting.chapter.id}`}
                className="text-link"
              >
                Cap. {meeting.chapter.number}: {meeting.chapter.title}
              </Link>
            </div>
          ) : null}
        </div>
      </header>

      <section className="meeting-detail-layout">
        <div className="meeting-details-body">
          <article className="meeting-detail-card">
            <h2 style={{ marginBottom: 'var(--space-3)' }}>Sobre o Encontro</h2>
            {meeting.agenda ? (
              <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text-secondary)' }}>
                {meeting.agenda}
              </div>
            ) : (
              <p className="field-hint" style={{ fontStyle: 'italic' }}>
                Nenhuma pauta ou observação cadastrada para este encontro.
              </p>
            )}

            {safeMeetingUrl ? (
              <div style={{ marginTop: 'var(--space-6)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border)' }}>
                <h3 style={{ marginBottom: 'var(--space-2)' }}>Acesso à Transmissão Online</h3>
                <a
                  href={safeMeetingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="button button-primary"
                >
                  Entrar na chamada de vídeo &rarr;
                </a>
              </div>
            ) : null}

            {meeting.location ? (
              <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border)' }}>
                <h3 style={{ marginBottom: 'var(--space-1)' }}>Localização Física</h3>
                <p>{meeting.location}</p>
              </div>
            ) : null}
          </article>
        </div>

        <aside>
          <div className="meeting-detail-card">
            <MeetingRsvp
              meetingId={meeting.id}
              initialAttending={meeting.userRsvp}
              signedIn={Boolean(meeting.viewerId)}
              disabled={meeting.status === 'cancelled' || meeting.status === 'done'}
            />
            <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border)' }} className="field-hint">
              <strong>{meeting.attendeesCount}</strong> participante(s) confirmaram presença.
            </div>
          </div>

          <div className="meeting-detail-card">
            <h3 style={{ marginBottom: 'var(--space-3)' }}>Adicionar à sua Agenda</h3>
            <div className="meeting-links">
              <a
                href={googleCalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="button button-outline"
              >
                Google Agenda
              </a>
              <a
                href={`/api/ics/${meeting.id}`}
                download={`${meeting.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ics`}
                className="button button-outline"
              >
                Baixar .ICS (Apple / Outlook)
              </a>
            </div>
          </div>
        </aside>
      </section>

      {meeting.canManage ? (
        <MeetingManageActions meeting={meeting} chapters={chapters} />
      ) : null}
    </main>
  );
}
