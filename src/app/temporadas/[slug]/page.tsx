import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSeason } from '@/features/catalog/queries';
import { QueryState } from '@/components/query-state';
import { type QueryResult, querySuccess, queryFailure } from '@/lib/queries/result';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const result = await getSeason(slug);
  return result ? { title: result.season.title } : { title: 'Temporada não encontrada' };
}

function formatChapterTitle(title: string, chapterNumber: number): string {
  const regex = new RegExp(`^Cap[íi]tulo\\s+${chapterNumber}\\s*([—–:-])\\s*`, 'i');
  const cleaned = title.replace(regex, '').trim();
  return cleaned || title;
}

function formatReadingRange(readingRange: string | null, chapterNumber: number): string | null {
  if (!readingRange) return null;
  const regex = new RegExp(`^Cap[íi]tulo\\s+${chapterNumber}$`, 'i');
  if (regex.test(readingRange.trim())) {
    return null;
  }
  return readingRange;
}

function formatMilestoneTitle(title: string, position: number): string {
  const regex = new RegExp(`^Marco\\s+${position}\\s*([—–:-])\\s*`, 'i');
  const cleaned = title.replace(regex, '').trim();
  return cleaned || title;
}

export default async function SeasonPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await getSeason(slug);
  if (!result) notFound();

  const { season, book, chapters, chapterAccess, milestones } = result;
  const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]));

  const rawRows = chapterAccess.length
    ? chapterAccess
    : chapters.map((chapter) => ({
        chapter_id: chapter.id,
        chapter_number: chapter.number,
        chapter_title: chapter.title,
        reading_range: chapter.reading_range,
        published_at: chapter.published_at,
        can_open: false,
        requires_quiz: false,
        reason: 'access_check_unavailable',
      }));

  // Deduplicate chapters by ID and by chapter number
  const seenChapterIds = new Set<string>();
  const seenChapterNumbers = new Set<number>();
  const rows = rawRows.filter((row) => {
    if (seenChapterIds.has(row.chapter_id) || seenChapterNumbers.has(row.chapter_number)) {
      return false;
    }
    seenChapterIds.add(row.chapter_id);
    seenChapterNumbers.add(row.chapter_number);
    return true;
  });

  const hasAccessFailure = rawRows.some((r) => r.reason === 'access_check_unavailable');
  const chaptersResult: QueryResult<typeof rows> = hasAccessFailure
    ? queryFailure('unavailable', 'Instabilidade momentânea ao verificar permissões de acesso aos capítulos da temporada.')
    : querySuccess(rows);

  // Deduplicate milestones by ID
  const seenMilestoneIds = new Set<string>();
  const uniqueMilestones = milestones.filter((m) => {
    if (seenMilestoneIds.has(m.id)) return false;
    seenMilestoneIds.add(m.id);
    return true;
  });

  // Detect if milestones are an exact 1:1 auto-generated mirror of chapters
  const is1to1ChapterMilestones =
    uniqueMilestones.length > 0 &&
    uniqueMilestones.length === rows.length &&
    uniqueMilestones.every((m) => {
      return !m.chapter_from || !m.chapter_to || m.chapter_from === m.chapter_to;
    });

  const currentMilestone = uniqueMilestones.findIndex((milestone) => !milestone.completed);
  const showBreadcrumbSeason =
    book && book.title.toLowerCase().trim() === season.title.toLowerCase().trim();

  return (
    <div className="container">
      <header className="page-intro">
        <nav className="breadcrumbs" aria-label="Trilha de navegação">
          <Link href="/livros">Livros</Link>
          <span aria-hidden="true">/</span>
          {book && (
            <>
              <Link href={`/livros/${book.slug}`}>{book.title}</Link>
              <span aria-hidden="true">/</span>
            </>
          )}
          <span>{showBreadcrumbSeason ? `Temporada ${season.number}` : season.title}</span>
        </nav>
        <span className="eyebrow">Temporada {season.number}</span>
        <h1>{season.title}</h1>
        <p>{season.description ?? 'Uma leitura compartilhada, capítulo por capítulo.'}</p>
      </header>

      {/* Show milestone strip only when they represent multi-chapter grouped phases */}
      {uniqueMilestones.length > 0 && !is1to1ChapterMilestones && (
        <section className="milestone-strip section" aria-labelledby="milestones-title">
          <div className="section-head">
            <div>
              <span className="eyebrow">Ritmo coletivo</span>
              <h2 id="milestones-title">Progresso da temporada</h2>
            </div>
          </div>
          <div className="milestone-list">
            {uniqueMilestones.map((milestone, index) => (
              <article
                className={`milestone-card ${milestone.completed ? 'is-complete' : ''}`}
                key={milestone.id}
              >
                <span className="eyebrow">Marco {index + 1}</span>
                <h3>{formatMilestoneTitle(milestone.title, index + 1)}</h3>
                <p>
                  {milestone.description ??
                    (milestone.chapter_from && milestone.chapter_to
                      ? `Capítulos ${milestone.chapter_from}–${milestone.chapter_to}`
                      : 'Acompanhe a leitura do clube.')}
                </p>
                <span className="field-hint">
                  {milestone.completed
                    ? 'Concluído'
                    : index === currentMilestone
                      ? 'Você está aqui'
                      : 'Próximo marco'}
                </span>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="timeline section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Cronograma de leitura</span>
            <h2>Capítulos da temporada</h2>
          </div>
          {rows.length > 0 && (
            <span className="field-hint">
              {rows.length} capítulo{rows.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        <QueryState
          result={chaptersResult}
          emptyFallback={
            <div className="empty-state">
              <h2>Os capítulos serão publicados em breve</h2>
              <p>A temporada está sendo preparada pela equipe editorial.</p>
            </div>
          }
        >
          {(chapterRows) =>
            chapterRows.map((row, index) => {
              const chapter = chapterById.get(row.chapter_id);
              const title = formatChapterTitle(row.chapter_title, row.chapter_number);
              const range = formatReadingRange(row.reading_range, row.chapter_number);
              const formattedDate = row.published_at
                ? new Intl.DateTimeFormat('pt-BR', {
                    dateStyle: 'medium',
                    timeZone: 'America/Sao_Paulo',
                  }).format(new Date(row.published_at))
                : null;
              const subtitle = [range, formattedDate].filter(Boolean).join(' · ');

              return row.can_open && chapter ? (
                <Link
                  className="timeline-row"
                  href={`/capitulos/${chapter.id}`}
                  key={row.chapter_id}
                >
                  <div>
                    <span className="eyebrow">Capítulo {row.chapter_number}</span>
                    <h3>{title}</h3>
                    {subtitle ? <p>{subtitle}</p> : null}
                  </div>
                  <span className={`status-pill ${index === 0 ? '' : 'neutral'}`}>
                    {index === 0 ? 'Começar leitura' : 'Abrir capítulo'}
                  </span>
                </Link>
              ) : (
                <div
                  className="timeline-row"
                  key={row.chapter_id}
                  aria-label={`Capítulo ${row.chapter_number} bloqueado`}
                >
                  <div>
                    <span className="eyebrow">Capítulo {row.chapter_number}</span>
                    <h3>{title}</h3>
                    <p>Faça a tentativa do quiz anterior para continuar sem spoilers.</p>
                  </div>
                  <span className="status-pill neutral">Bloqueado</span>
                </div>
              );
            })
          }
        </QueryState>
      </section>
    </div>
  );
}
