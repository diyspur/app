import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChapterProgress } from '@/components/chapters/chapter-progress';
import { QuizPanel } from '@/components/quiz/quiz-panel';
import { YouTubeFacade } from '@/components/youtube-facade';
import { HostPrompt } from '@/components/chapters/host-prompt';
import { DiscussionEntryButton } from '@/components/discussions/discussion-entry-button';
import { getChapters } from '@/features/catalog/queries';
import type { Metadata } from 'next';
import { chapterLabel, cleanChapterTitle } from '@/lib/chapter-label';
import { JsonLd } from '@/components/json-ld';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const result = await getChapters(id);
  if (!result) return { title: 'Capítulo não encontrado' };
  if ('locked' in result) {
    return {
      title: `${result.access.chapter_title} · Capítulo bloqueado`,
      robots: { index: false, follow: false },
    };
  }
  return {
    title: chapterLabel(result.chapter.title, result.chapter.number),
    description: result.chapter.summary ?? `Leitura guiada de ${chapterLabel(result.chapter.title, result.chapter.number)}.`,
  };
}

export default async function ChapterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getChapters(id);
  if (!result) notFound();

  if ('locked' in result) {
    return (
      <section className="container">
        <header className="page-intro">
          <span className="eyebrow">Leitura em sequência</span>
          <h1>{result.access.chapter_title}</h1>
          <p>
            Este capítulo é liberado depois da tentativa do quiz anterior, para manter a conversa
            sem spoilers.
          </p>
        </header>
        <div className="empty-state">
          <div className="empty-state-mark" aria-hidden="true">
            ▣
          </div>
          <h2>
            {result.signedIn
              ? 'Complete o capítulo anterior primeiro'
              : 'Entre para continuar a leitura'}
          </h2>
          <p>
            {result.signedIn
              ? 'Responda ao quiz do capítulo anterior. A tentativa fica registrada no seu histórico e libera o próximo passo.'
              : 'Crie uma conta ou entre para guardar seu progresso e desbloquear a sequência do clube.'}
          </p>
          <div className="empty-actions">
            <Link
              className="button button-small"
              href={
                result.signedIn
                  ? `/temporadas/${result.access.season_slug}`
                  : `/entrar?redirect=${encodeURIComponent(`/capitulos/${id}`)}`
              }
            >
              {result.signedIn ? 'Voltar à temporada' : 'Entrar para continuar'}
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const {
    chapter,
    season,
    book,
    progress,
    previous,
    next,
    questions,
    hostPrompt,
    hostPromptResult,
    hostPromptVote,
    signedIn,
  } = result;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://diyspur.vercel.app';
  const chapterSchema = {
    '@context': 'https://schema.org',
    '@type': 'LearningResource',
    name: `Segunda Tela: Capítulo ${chapter.number} — ${cleanChapterTitle(chapter.title, chapter.number)}`,
    description: chapter.summary ?? `Acompanhamento de leitura e debate do capítulo ${chapter.number} de ${book?.title ?? 'DIYSpur'}.`,
    url: `${siteUrl}/capitulos/${chapter.id}`,
    learningResourceType: 'DiscussionGuide',
    ...(book ? { isPartOf: { '@type': 'Book', name: book.title, url: `${siteUrl}/livros/${encodeURIComponent(book.slug)}` } } : {}),
  };

  const isSeasonTitleSameAsBook =
    Boolean(book && season && book.title.toLowerCase().trim() === season.title.toLowerCase().trim());
  const seasonBreadcrumbLabel = isSeasonTitleSameAsBook ? `Temporada ${season!.number}` : season?.title;

  return (
    <div className="container">
      <JsonLd data={chapterSchema} />
      <header className="page-intro chapter-intro">
        <nav className="breadcrumbs" aria-label="Trilha de navegação">
          <Link href="/livros">Livros</Link>
          {book && (
            <>
              <span aria-hidden="true">/</span>
              <Link href={`/livros/${book.slug}`}>{book.title}</Link>
            </>
          )}
          {season && (
            <>
              <span aria-hidden="true">/</span>
              <Link href={`/temporadas/${season.slug}`}>{seasonBreadcrumbLabel}</Link>
            </>
          )}
          <span aria-hidden="true">/</span>
          <span>Capítulo {chapter.number}</span>
        </nav>
        <span className="eyebrow">Capítulo {chapter.number}</span>
        <h1>{cleanChapterTitle(chapter.title, chapter.number)}</h1>
        <p>{chapter.reading_range ?? 'Um novo capítulo, uma nova conversa.'}</p>
      </header>

      <div className="chapter-layout">
        <section className="chapter-main">
          <YouTubeFacade videoUrl={chapter.youtube_url} title={chapter.title} />

          {chapter.summary && (
            <section className="section chapter-summary">
              <h2>Sobre este capítulo</h2>
              <p>{chapter.summary}</p>
            </section>
          )}

          {/* Botão Único de Conversa do Capítulo no Grupo Oficial */}
          <div style={{ marginBlock: '20px' }}>
            <DiscussionEntryButton
              mode="chapter"
              chapterId={chapter.id}
              label="Comentar no grupo"
              className="btn btn-primary"
            />
          </div>

          {/* Controle de Progresso do Capítulo */}
          <ChapterProgress
            chapterId={chapter.id}
            signedIn={signedIn}
            initialPercent={progress?.percent ?? 0}
            status={progress?.status}
          />

          {hostPrompt && hostPrompt.options.length > 0 && (
            <HostPrompt
              prompt={hostPrompt}
              results={hostPromptResult}
              selectedOption={hostPromptVote}
              signedIn={signedIn}
              chapterId={chapter.id}
            />
          )}

          <QuizPanel chapterId={chapter.id} questions={questions} signedIn={signedIn} />

          <nav className="chapter-navigation" aria-label="Navegação de capítulos">
            {previous ? (
              <Link className="chapter-nav-link" href={`/capitulos/${previous.id}`}>
                <span>← Capítulo anterior</span>
                <strong>{previous.title}</strong>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              next.canOpen ? (
                <Link
                  className="chapter-nav-link chapter-nav-next"
                  href={`/capitulos/${next.id}`}
                >
                  <span>Próximo capítulo →</span>
                  <strong>{next.title}</strong>
                </Link>
              ) : (
                <Link
                  className="chapter-nav-link chapter-nav-next"
                  href={`/temporadas/${season.slug}`}
                >
                  <span>Próximo capítulo bloqueado</span>
                  <strong>{next.title}</strong>
                  <small>Complete o quiz anterior para continuar</small>
                </Link>
              )
            ) : (
              <span className="field-hint">
                Você chegou ao capítulo mais recente desta temporada.
              </span>
            )}
          </nav>
        </section>

        <aside className="chapter-aside">
          <h2>Ao lado da leitura</h2>
          <p>
            {book ? <>Você está acompanhando “{book.title}”. </> : null}
            {season ? (
              <>
                {season.title} · capítulo {chapter.number}.{' '}
              </>
            ) : null}
            Continue no seu ritmo.
          </p>
          {book && (
            <p className="aside-link">
              <Link className="text-link" href={`/livros/${book.slug}`}>
                Sobre o livro →
              </Link>
            </p>
          )}
          {season && (
            <p className="aside-link">
              <Link className="text-link" href={`/temporadas/${season.slug}`}>
                Ver todos os capítulos da temporada →
              </Link>
            </p>
          )}
          <div className="notice" style={{ marginTop: '24px' }}>
            Seu progresso e suas respostas ficam privados por padrão, e o resultado é conferido
            antes de ser salvo.
          </div>
        </aside>
      </div>
    </div>
  );
}
