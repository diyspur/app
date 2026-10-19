import type { Metadata } from 'next';
import Link from 'next/link';

import { MeetingRsvp } from '@/components/calendar/meeting-rsvp';
import { JsonLd } from '@/components/json-ld';
import { createServerSupabase } from '@/lib/supabase/clients';
import { getMeetings } from '@/features/catalog/queries';
import { getMeetingRsvpMap } from '@/features/meetings/rsvp-actions';
import { getMeetingState, type MeetingState } from '@/features/meetings/state';
import { getGoogleCalendarUrl, getMeetingEventSchema } from '@/lib/calendar-links';

export const metadata: Metadata = {
  title: 'Encontros — Calendário do Clube | DIYSPUR',
  description: 'Acompanhe a agenda dos debates ao vivo do DIYSPUR com horários de Brasília, confirmação de presença (RSVP) e exportação para Google Agenda e .ics.',
  alternates: { canonical: '/calendario' },
};

export default async function CalendarPage() {
  const [meetings, claimsResult] = await Promise.all([
    getMeetings(),
    (async () => {
      try {
        const supabase = await createServerSupabase();
        return await supabase.auth.getClaims();
      } catch {
        return null;
      }
    })(),
  ]);

  const signedIn = typeof claimsResult?.data?.claims?.sub === 'string';
  const userId = claimsResult?.data?.claims?.sub ?? null;

  let managedClubs: Array<{ slug: string; name: string }> = [];
  if (signedIn && userId) {
    try {
      const supabase = await createServerSupabase();
      const { data } = await supabase
        .from('user_club_members')
        .select('club_id, role, user_clubs!inner(slug, name)')
        .eq('user_id', userId)
        .in('role', ['owner', 'moderator']);
      if (data) {
        managedClubs = (data as unknown as Array<{ user_clubs: { slug: string; name: string } }>).map(
          (m) => ({
            slug: m.user_clubs.slug,
            name: m.user_clubs.name,
          }),
        );
      }
    } catch {
      managedClubs = [];
    }
  }

  const rsvps = signedIn ? await getMeetingRsvpMap(meetings.map((meeting) => meeting.id)) : {};
  const now = Date.now();
  const getState = (meeting: typeof meetings[number]): MeetingState => getMeetingState(meeting, now);
  const upcoming = meetings.filter((meeting) => ['live', 'upcoming'].includes(getState(meeting)));
  const finished = meetings.filter((meeting) => getState(meeting) === 'finished');
  const cancelled = meetings.filter((meeting) => getState(meeting) === 'cancelled');
  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo',
    }).format(date);

  const renderMeeting = (meeting: typeof meetings[number]) => {
    const date = new Date(meeting.scheduled_at);
    const state = getState(meeting);
    const label =
      state === 'live'
        ? 'AO VIVO'
        : state === 'finished'
          ? 'ENCERRADO'
          : state === 'cancelled'
            ? 'CANCELADO'
            : 'PRÓXIMO';

    return (
      <article className="meeting-row calendar-card" key={meeting.id}>
        <div className="calendar-date">
          <strong>
            {new Intl.DateTimeFormat('pt-BR', { day: '2-digit', timeZone: 'America/Sao_Paulo' }).format(date)}
          </strong>
          <span>
            {new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'America/Sao_Paulo' }).format(date)}
          </span>
        </div>
        <div style={{ flex: 1 }}>
          <h3>
            <Link href={`/eventos/${meeting.id}`}>
              {meeting.title}
            </Link>
          </h3>
          <div className="meeting-context-tags">
            {meeting.books?.title && (
              <Link href={`/livros/${meeting.books.slug}`} className="badge badge-secondary">
                📖 {meeting.books.title}
              </Link>
            )}
            {meeting.user_clubs?.name && (
              <Link href={`/clubes/${meeting.user_clubs.slug}`} className="badge badge-secondary">
                👥 {meeting.user_clubs.name}
              </Link>
            )}
          </div>
          <p>
            {formatDate(date)}
            {meeting.duration_min ? ` · ${meeting.duration_min} min` : ''} · horário de Brasília
          </p>
          {meeting.agenda && <p>{meeting.agenda}</p>}
          <div className="meeting-links">
            <Link href={`/eventos/${meeting.id}`} className="text-link">
              Ver detalhes do encontro &rarr;
            </Link>
            {meeting.meeting_url && /^https:\/\//i.test(meeting.meeting_url) && !['finished', 'cancelled'].includes(state) ? (
              <a className="text-link" href={meeting.meeting_url} target="_blank" rel="noopener noreferrer">
                Entrar na transmissão ↗
              </a>
            ) : null}
          </div>
          {state !== 'cancelled' && (
            <div style={{ marginTop: 'var(--space-3)' }}>
              <MeetingRsvp
                meetingId={meeting.id}
                initialAttending={rsvps[meeting.id] ?? null}
                signedIn={signedIn}
                disabled={state === 'finished'}
              />
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gap: 8, justifyItems: 'end', alignContent: 'start' }}>
          <span className={`status-pill${state === 'finished' || state === 'cancelled' ? ' neutral' : ''}`}>
            {label}
          </span>
          {state === 'cancelled' && <span className="field-hint">Este encontro foi cancelado.</span>}
          {state !== 'cancelled' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
              <a
                className="text-link"
                href={getGoogleCalendarUrl(meeting)}
                target="_blank"
                rel="noopener noreferrer"
                title="Adicionar evento diretamente ao Google Agenda"
              >
                Google Agenda ↗
              </a>
              <a
                className="text-link"
                href={`/api/ics/${meeting.id}`}
                title="Baixar arquivo iCalendar .ics"
              >
                Arquivo .ics ↓
              </a>
            </div>
          )}
        </div>
      </article>
    );
  };

  return (
    <section className="container">
      {upcoming.length > 0 && (
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@graph': upcoming.map((m) => getMeetingEventSchema(m)),
          }}
        />
      )}

      <header className="page-intro">
        <span className="eyebrow">Ler é o começo</span>
        <h1>
          Tem conversa<br />
          <em>marcada.</em>
        </h1>
        <p>Encontros para dividir impressões, ouvir outros pontos de vista e descobrir novas camadas das histórias.</p>
        {managedClubs.length > 0 && (
          <div style={{ marginTop: 'var(--space-4)' }}>
            <Link
              href={`/clubes/${managedClubs[0].slug}/eventos/novo`}
              className="button button-small button-primary"
            >
              + Agendar encontro em {managedClubs[0].name}
            </Link>
          </div>
        )}
      </header>

      {upcoming.length ? (
        <section className="meeting-list section" style={{ paddingTop: 10 }} aria-labelledby="upcoming-meetings">
          <div className="section-head">
            <div>
              <span className="eyebrow">Agenda</span>
              <h2 id="upcoming-meetings">Próximos encontros</h2>
            </div>
          </div>
          {upcoming.map(renderMeeting)}
        </section>
      ) : (
        <div className="empty-state">
          <div className="empty-state-mark" aria-hidden="true">
            ◷
          </div>
          <h2>Os próximos encontros estão sendo combinados</h2>
          <p>Quando a próxima data for confirmada, você encontra tudo aqui — livro, horário e como participar.</p>
          <div className="empty-actions">
            <Link className="button button-dark button-small" href="/livros">
              Ver leituras do clube
            </Link>
          </div>
        </div>
      )}

      {finished.length > 0 && (
        <section className="meeting-list section" style={{ paddingTop: 10 }} aria-labelledby="finished-meetings">
          <div className="section-head">
            <div>
              <span className="eyebrow">Memória do clube</span>
              <h2 id="finished-meetings">Encontros encerrados</h2>
            </div>
          </div>
          {finished.map(renderMeeting)}
        </section>
      )}

      {cancelled.length > 0 && (
        <section className="meeting-list section" style={{ paddingTop: 10 }} aria-labelledby="cancelled-meetings">
          <div className="section-head">
            <div>
              <span className="eyebrow">Agenda atualizada</span>
              <h2 id="cancelled-meetings">Encontros cancelados</h2>
            </div>
          </div>
          {cancelled.map(renderMeeting)}
        </section>
      )}
    </section>
  );
}
