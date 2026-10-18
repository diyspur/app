import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { getBooks, getUpcomingMeetings, getActiveSeason } from '@/features/catalog/queries';
import { getPublicPolls } from '@/features/polls/queries';
import { BookCard } from '@/components/book-card';
import { requireSession } from '@/lib/auth/session';

export const metadata: Metadata = {
  alternates: {
    canonical: '/',
  },
};

export default async function HomePage() {
  const [books, meetings, activeSeason, polls, session] = await Promise.all([
    getBooks(),
    getUpcomingMeetings(4),
    getActiveSeason(),
    getPublicPolls(),
    requireSession(),
  ]);

  const signedIn = Boolean(session);
  const activePoll = polls[0];

  return (
    <>
      {/* 1. Hero Section — Mission Control da Leitura Coletiva */}
      <section className="hero relative overflow-hidden">
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '-15%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'min(860px, 100vw)',
            height: '380px',
            background: 'radial-gradient(ellipse at 50% 30%, color-mix(in srgb, var(--brand) 18%, transparent) 0%, color-mix(in srgb, #06b6d4 10%, transparent) 40%, transparent 70%)',
            filter: 'blur(45px)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
        <div className="container hero-copy relative z-10">
          <div className="hero-badge">
            <span className="badge-dot" aria-hidden="true" style={{ animation: 'pulseGlow 2.5s infinite' }} />
            O CLUBE DE LEITURA COLETIVO · SEGUNDA TELA
          </div>
          <h1>
            Histórias ganham vida quando lidas <em>juntas.</em>
          </h1>
          <p className="hero-lede">
            Cronogramas sem pressa, discussões capítulo a capítulo e encontros ao vivo para quem ama ler em comunidade.
          </p>
          <div className="hero-cta">
            <Link className="btn btn-primary btn-lg" href="#temporada-destaque">
              Começar a ler junto <span aria-hidden="true">↗</span>
            </Link>
            <Link className="btn btn-secondary btn-lg" href="/livros">
              Explorar acervo de livros <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <p className="hero-micro">
            Aberto a todos os leitores · Sem mensalidade obrigatória · 100% colaborativo
          </p>
        </div>
      </section>

      {/* 2. Seção "Como Funciona o DIYSPUR em 3 Passos" */}
      <section id="como-funciona" className="steps-section container">
        <div className="section-head" style={{ textAlign: 'center', alignItems: 'center' }}>
          <div>
            <span className="eyebrow">Simples, leve e acolhedor</span>
            <h2>Como funciona o DIYSPUR</h2>
            <p>Três passos para nunca mais ler um livro no isolamento.</p>
          </div>
        </div>

        <div className="steps-grid">
          <article className="step-card">
            <span className="step-number">1</span>
            <h3 className="step-title">Escolha a Temporada</h3>
            <p className="step-desc">
              Descubra a leitura coletiva do momento com cronograma semanal sugerido, metas de leitura e contexto editorial sem pressa.
            </p>
          </article>

          <article className="step-card">
            <span className="step-number">2</span>
            <h3 className="step-title">Leia no Seu Ritmo</h3>
            <p className="step-desc">
              Acompanhe os capítulos semana a semana, marque seus avanços no diário e teste reflexões com quizzes rápidos sem ansiedade.
            </p>
          </article>

          <article className="step-card">
            <span className="step-number">3</span>
            <h3 className="step-title">Debata Sem Spoilers</h3>
            <p className="step-desc">
              Converse trecho a trecho com comentários protegidos e encontre o clube em debates virtuais ao vivo para trocar teorias.
            </p>
          </article>
        </div>
      </section>

      {/* 3. Temporada em Destaque (Season Spotlight) */}
      <section id="temporada-destaque" className="section container">
        <div className="section-head">
          <div>
            <span className="eyebrow">Ciclo de Leitura em Andamento</span>
            <h2>Temporada em Destaque</h2>
            <p>A comunidade está reunida lendo e debatendo esta obra agora mesmo.</p>
          </div>
        </div>

        {activeSeason?.season ? (
          <div className="season-spotlight-card">
            <div className="season-spotlight-cover">
              {activeSeason.season.cover_url || activeSeason.book?.cover_url ? (
                <Image
                  src={(activeSeason.season.cover_url || activeSeason.book?.cover_url)!}
                  alt={`Capa do livro ${activeSeason.book?.title ?? activeSeason.season.title}`}
                  width={240}
                  height={348}
                  priority
                />
              ) : (
                <div className="cover-placeholder">
                  {activeSeason.book?.title ?? activeSeason.season.title}
                </div>
              )}
            </div>

            <div className="season-spotlight-content">
              <div className="detail-pills">
                <span className="status-pill">Temporada {activeSeason.season.number} · Em andamento</span>
                {activeSeason.nextMeeting && (
                  <span className="status-pill neutral">Encontro ao vivo marcado</span>
                )}
              </div>

              <h3 style={{ fontSize: 'var(--text-display-lg)', fontWeight: 'var(--weight-display)', margin: '4px 0' }}>
                {activeSeason.book?.title ?? activeSeason.season.title}
              </h3>

              <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-body)', margin: '0 0 12px' }}>
                {activeSeason.season.description ?? 'Acompanhe a leitura coletiva semana a semana com o clube.'}
              </p>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-caption)', color: 'var(--text-tertiary)', marginBottom: '4px' }}>
                  <span>Progresso do ciclo</span>
                  <span>{activeSeason.publishedChapters} de {activeSeason.totalChapters} capítulos liberados</span>
                </div>
                <div className="season-progress-bar-wrap">
                  <div
                    className="season-progress-bar-fill"
                    style={{
                      width: `${activeSeason.totalChapters ? Math.min(100, Math.round((activeSeason.publishedChapters / activeSeason.totalChapters) * 100)) : 20}%`,
                    }}
                  />
                </div>
              </div>

              {activeSeason.nextMeeting && (
                <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
                  🎙️ <strong>Próximo debate:</strong>{' '}
                  {new Intl.DateTimeFormat('pt-BR', {
                    dateStyle: 'full',
                    timeStyle: 'short',
                    timeZone: 'America/Sao_Paulo',
                  }).format(new Date(activeSeason.nextMeeting.scheduled_at))}{' '}
                  (horário de Brasília)
                </p>
              )}

              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '12px' }}>
                <Link className="btn btn-primary" href={`/temporadas/${activeSeason.season.slug}`}>
                  Acompanhar temporada <span aria-hidden="true">↗</span>
                </Link>
                {activeSeason.book && (
                  <Link className="btn btn-secondary" href={`/livros/${activeSeason.book.slug}`}>
                    Ver ficha do livro
                  </Link>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="notice">
            A temporada do próximo ciclo será anunciada em breve.{' '}
            <Link className="text-link" href="/livros">
              Explore os livros disponíveis →
            </Link>
          </div>
        )}
      </section>

      {/* 4. Segunda Tela do Leitor — Demonstração */}
      <section className="section container">
        <div className="section-head" style={{ textAlign: 'center', alignItems: 'center' }}>
          <div>
            <span className="eyebrow">Exemplo ilustrativo da experiência</span>
            <h2>Segunda tela para quem ama ler</h2>
            <p>Seja com livro físico, Kindle ou Kobo: o DiySpur é seu espaço de debate e acompanhamento seguro.</p>
          </div>
        </div>

        <div className="hero-mockup" aria-label="Demonstração da experiência de segunda tela">
          <div className="reader-second-screen">
            <div className="reader-screen-toolbar">
              <div className="reader-screen-identity">
                <span aria-hidden="true">📖</span>
                <span>DiySpur Reader · Segunda Tela de Leitura</span>
              </div>
              <div className="reader-screen-badge">
                <span className="reader-screen-dot" aria-hidden="true" />
                Exemplo ilustrativo · Demonstração
              </div>
            </div>

            <div className="reader-screen-body">
              <div className="reader-screen-sidebar">
                <div className="mockup-book-badge">Demonstração</div>
                <div className="mockup-book-title" style={{ fontFamily: 'var(--font-serif)' }}>
                  Livro do seu clube
                </div>
                <div className="mockup-chapter-row active">
                  <span>Capítulo 1 · Início do Ciclo</span>
                  <strong className="mockup-status-active">Em leitura</strong>
                </div>
                <div className="mockup-chapter-row">
                  <span>Capítulo 2 · Aprofundamento</span>
                  <span className="mockup-status-muted">Capítulo seguinte</span>
                </div>
                <div className="mockup-chapter-row">
                  <span>Capítulo 3 · Clímax & Teorias</span>
                  <span className="mockup-status-muted">Capítulo final</span>
                </div>
              </div>

              <div className="reader-screen-main">
                <div>
                  <div className="spoiler-protection-banner" style={{ marginBottom: '16px' }}>
                    <span aria-hidden="true">🛡️</span>
                    <span><strong>Proteção ativa contra spoilers:</strong> Discussões de capítulos futuros ficam ocultas até a data combinada.</span>
                  </div>

                  <div className="mockup-quote-box">
                    <p className="mockup-quote-text">
                      “A verdadeira viagem de descobrimento não consiste em procurar novas paisagens, mas em ter novos olhos.”
                    </p>
                    <span className="mockup-quote-author">
                      — Destaque compartilhado no debate do capítulo 1
                    </span>
                  </div>
                </div>

                <div className="detail-pills">
                  <span className="status-pill">Discussão aberta</span>
                  <span className="status-pill neutral">🎙️ Debate ao vivo agendado</span>
                </div>
              </div>
            </div>
          </div>
          <p className="field-hint" style={{ textAlign: 'center', marginTop: '14px' }}>
            Acompanhe o ritmo semana a semana, comente sem medo de spoilers e participe dos debates ao vivo.
          </p>
        </div>
      </section>

      {/* 5. Próximos Encontros e Votação Popular (Grid 2 Colunas) */}
      <section className="section container">
        <div className="home-split-grid">
          {/* Coluna A: Calendário de Encontros */}
          <div className="cell" style={{ padding: 'var(--space-6)', borderRadius: 'var(--radius-card)', background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
            <div className="section-head" style={{ marginBottom: '16px' }}>
              <div>
                <span className="eyebrow">Agenda</span>
                <h3 style={{ fontSize: 'var(--text-title)', fontWeight: 'var(--weight-display)' }}>Próximos debates ao vivo</h3>
              </div>
              <Link className="text-link" href="/calendario">
                Ver todos →
              </Link>
            </div>

            {meetings.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {meetings.slice(0, 2).map((meeting) => (
                  <Link className="meeting-row" key={meeting.id} href="/calendario">
                    <div>
                      <h4 style={{ fontSize: 'var(--text-body)', fontWeight: 'var(--weight-semibold)', margin: 0 }}>
                        {meeting.title}
                      </h4>
                      <p style={{ fontSize: 'var(--text-caption)', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                        {new Intl.DateTimeFormat('pt-BR', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                          timeZone: 'America/Sao_Paulo',
                        }).format(new Date(meeting.scheduled_at))}{' '}
                        · horário de Brasília
                      </p>
                    </div>
                    <span className="status-pill">
                      {meeting.status === 'live' ? 'AO VIVO' : 'Agendado'}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="field-hint">Novas datas serão agendadas em breve para o ciclo.</p>
            )}
          </div>

          {/* Coluna B: Votação da Próxima Leitura */}
          <div className="cell" style={{ padding: 'var(--space-6)', borderRadius: 'var(--radius-card)', background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
            <div className="section-head" style={{ marginBottom: '16px' }}>
              <div>
                <span className="eyebrow">Escolha Coletiva</span>
                <h3 style={{ fontSize: 'var(--text-title)', fontWeight: 'var(--weight-display)' }}>Próxima leitura do clube</h3>
              </div>
              <Link className="text-link" href="/votacao">
                {activePoll ? 'Votar na próxima leitura →' : 'Ver resultados anteriores →'}
              </Link>
            </div>

            {activePoll ? (
              <div>
                <h4 style={{ fontSize: 'var(--text-body)', fontWeight: 'var(--weight-semibold)', marginBottom: '8px' }}>
                  {activePoll.title}
                </h4>
                <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  A comunidade decide democraticamente o que vamos ler a seguir. Participe com seu voto.
                </p>
                <Link className="btn btn-primary btn-sm" href="/votacao">
                  Votar na enquete ativa ↗
                </Link>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  A próxima votação de leitura será aberta ao final do ciclo atual. Leitores cadastrados votam gratuitamente.
                </p>
                <Link className="btn btn-secondary btn-sm" href="/votacao">
                  Ver histórico de votações
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 6. Prova Social e Depoimentos */}
      <section className="section container">
        <div className="section-head" style={{ textAlign: 'center', alignItems: 'center' }}>
          <div>
            <span className="eyebrow">Comunidade</span>
            <h2>Quem lê junto, lê mais longe</h2>
            <p>O que nossos leitores dizem sobre participar das temporadas.</p>
          </div>
        </div>

        <div className="testimonials-grid">
          <div className="testimonial-card">
            <p className="testimonial-quote">
              “Sempre abandonava livros densos no meio. Ter encontros marcados e o cronograma semana a semana me fez finalmente terminar leituras desafiadoras.”
            </p>
            <div className="testimonial-author">
              <div className="testimonial-avatar">C</div>
              <div className="testimonial-meta">
                <span className="testimonial-name">Camila S.</span>
                <span className="testimonial-role">Leitora desde a Temporada 1</span>
              </div>
            </div>
          </div>

          <div className="testimonial-card">
            <p className="testimonial-quote">
              “O melhor do DIYSPUR é poder comentar sem medo de spoiler. Eu leio no meu ritmo e sei que ninguém vai estragar o final antes da hora.”
            </p>
            <div className="testimonial-author">
              <div className="testimonial-avatar">F</div>
              <div className="testimonial-meta">
                <span className="testimonial-name">Felipe M.</span>
                <span className="testimonial-role">Participante dos debates ao vivo</span>
              </div>
            </div>
          </div>

          <div className="testimonial-card">
            <p className="testimonial-quote">
              “A sensação de debater um plot twist incrível logo depois de ler o capítulo com outras pessoas é imbatível. Parece um clube de amigos de verdade.”
            </p>
            <div className="testimonial-author">
              <div className="testimonial-avatar">L</div>
              <div className="testimonial-meta">
                <span className="testimonial-name">Larissa R.</span>
                <span className="testimonial-role">Membro do clube</span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <Link className="btn btn-secondary btn-sm" href="/ranking">
            Ver ranking da comunidade de leitores ↗
          </Link>
        </div>
      </section>

      {/* 7. Catálogo / Biblioteca Geral */}
      <section className="section container">
        <div className="section-head">
          <div>
            <span className="eyebrow">Biblioteca</span>
            <h2>Histórias para encontrar</h2>
            <p>Obras selecionadas para debater, se emocionar e dividir perspectivas.</p>
          </div>
          <Link className="text-link" href="/livros">
            Ver catálogo completo <span aria-hidden="true">→</span>
          </Link>
        </div>

        {books.length ? (
          <div className="book-grid">
            {books.slice(0, 4).map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-mark" aria-hidden="true">✳</div>
            <h3>Novas histórias estão a caminho</h3>
            <p>
              Estamos preparando a próxima seleção do clube. Enquanto isso, venha conhecer os leitores e as conversas em andamento.
            </p>
            <div className="empty-actions">
              <Link className="btn btn-secondary btn-sm" href="/comunidade">
                Explorar a comunidade
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* 8. Membership & CTA Final de Adesão */}
      <section className="section container">
        <div className="community-invite-card">
          <span className="eyebrow" style={{ marginBottom: '8px' }}>Comunidade Aberta</span>
          <h2 style={{ fontSize: 'var(--text-display)', fontWeight: 'var(--weight-display)', margin: '8px 0 12px' }}>
            Seu próximo capítulo começa aqui.
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-body)', maxWidth: '540px', margin: '0 auto 24px' }}>
            Junte-se a leitores que desvendam cada obra em comunidade. Cronogramas sem pressa, debates protegidos contra spoilers e encontros ao vivo gratuitos.
          </p>

          <div className="community-invite-features">
            <span className="community-feature-tag">✦ Cronogramas semanais sugeridos</span>
            <span className="community-feature-tag">✦ Proteção contra spoilers</span>
            <span className="community-feature-tag">✦ Encontros virtuais periódicos</span>
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '24px' }}>
            <Link className="btn btn-primary btn-lg" href={signedIn ? '/perfil' : '/cadastro'}>
              {signedIn ? 'Continuar minha leitura' : 'Entrar no clube gratuitamente'} <span aria-hidden="true">↗</span>
            </Link>
            <Link className="btn btn-secondary btn-lg" href="/livros">
              Explorar acervo de livros
            </Link>
          </div>

          <p style={{ fontSize: 'var(--text-caption)', color: 'var(--text-tertiary)', marginTop: '20px' }}>
            ✓ Gratuito para todos os leitores · Sem mensalidade obrigatória · Participe no seu ritmo
          </p>
        </div>
      </section>
    </>
  );
}
