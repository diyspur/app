import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { getBooks, getUpcomingMeetings, getActiveSeason } from '@/features/catalog/queries';
import { getPublicPolls } from '@/features/polls/queries';
import { BookCard } from '@/components/book-card';
import { requireSession } from '@/lib/auth/session';
import { JsonLd } from '@/components/json-ld';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://diyspur.vercel.app';

export const metadata: Metadata = {
  title: 'Clube de Leitura Online & Segunda Tela Literária',
  description:
    'Participe de leituras coletivas com cronogramas semanais sugeridos, discussões capítulo a capítulo sem spoilers, encontros ao vivo e escolha democrática de livros.',
  keywords: [
    'clube de leitura',
    'clube do livro online',
    'leitura coletiva',
    'segunda tela de leitura',
    'ler livros juntos',
    'debates literarios sem spoiler',
    'cronograma de leitura semanal',
    'votacao de livros',
    'diyspur',
  ],
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'DIYSPUR — Clube de Leitura Online & Segunda Tela Literária',
    description:
      'Histórias ganham vida quando lidas juntas. Cronogramas sem pressa, proteção contra spoilers e debates periódicos para quem ama ler em comunidade.',
    url: siteUrl,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DIYSPUR — Clube de Leitura Online & Segunda Tela Literária',
    description:
      'Histórias ganham vida quando lidas juntas. Cronogramas sem pressa, proteção contra spoilers e debates periódicos.',
  },
};

const homeFaqItems = [
  {
    question: 'O DIYSPUR disponibiliza os livros para download em PDF ou e-book?',
    answer:
      'Não. O DIYSPUR é uma plataforma de acompanhamento e segunda tela literária. Cada leitor utiliza seu próprio exemplar físico, Kindle ou e-reader de preferência. Nós cuidamos do cronograma, da mediação e da comunidade.',
  },
  {
    question: 'Preciso pagar mensalidade para participar do clube?',
    answer:
      'Não. O cadastro, o acompanhamento dos cronogramas semanais, a participação nos clubes oficiais de cada livro e o acesso aos encontros ao vivo são 100% gratuitos.',
  },
  {
    question: 'Como funciona a proteção contra spoilers?',
    answer:
      'Todas as discussões são organizadas estritamente por capítulos. Comentários de trechos futuros contam com filtros e máscaras de proteção visual, garantindo que ninguém veja reviravoltas antes da hora.',
  },
  {
    question: 'O que acontece se eu atrasar a leitura da semana?',
    answer:
      'Você lê no seu próprio ritmo. Os cronogramas e encontros ao vivo servem de bússola coletiva, mas o conteúdo e os debates dos capítulos anteriores permanecem arquivados e organizados para quando você chegar lá.',
  },
];

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

  const heroCtaHref = signedIn ? '/perfil' : '/cadastro';
  const heroCtaLabel = signedIn ? 'Continuar minha leitura' : 'Entrar no clube gratuitamente';

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: homeFaqItems.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };

  const webPageSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${siteUrl}/#webpage`,
    url: siteUrl,
    name: 'DIYSPUR — Clube de Leitura Online & Segunda Tela Literária',
    description:
      'Cronogramas sem pressa, discussões capítulo a capítulo protegidas contra spoilers e encontros ao vivo para quem ama ler em comunidade.',
    inLanguage: 'pt-BR',
    isPartOf: {
      '@type': 'WebSite',
      '@id': `${siteUrl}/#website`,
      name: 'DIYSPUR',
      url: siteUrl,
    },
  };

  return (
    <>
      <JsonLd data={webPageSchema} />
      <JsonLd data={faqSchema} />

      {/* 1. Hero Section — Posicionamento Claro & Proposta de Valor */}
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
            background:
              'radial-gradient(ellipse at 50% 30%, color-mix(in srgb, var(--brand) 18%, transparent) 0%, color-mix(in srgb, #06b6d4 10%, transparent) 40%, transparent 70%)',
            filter: 'blur(45px)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
        <div className="container hero-copy relative z-10">
          <div className="hero-badge">
            <span className="badge-dot" aria-hidden="true" style={{ animation: 'pulseGlow 2.5s infinite' }} />
            CLUBE DE LEITURA COLETIVO & SEGUNDA TELA
          </div>
          <h1>
            Histórias ganham vida quando lidas <em>juntas.</em>
          </h1>
          <p className="hero-lede">
            Cronogramas semanais sem pressa, discussões capítulo a capítulo protegidas contra spoilers e encontros ao vivo para quem ama ler em comunidade.
          </p>
          <div className="hero-cta">
            <Link className="btn btn-primary btn-lg" href={heroCtaHref}>
              {heroCtaLabel} <span aria-hidden="true">↗</span>
            </Link>
            <Link className="btn btn-secondary btn-lg" href="/livros">
              Explorar acervo de livros <span aria-hidden="true">→</span>
            </Link>
          </div>
          <p className="hero-micro">
            Aberto a todos os leitores · Você lê no seu próprio exemplar físico, Kindle ou e-reader
          </p>
        </div>
      </section>

      {/* 2. Como Funciona — A Jornada de Leitura em 3 Passos */}
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
            <span className="step-number" aria-hidden="true">1</span>
            <h3 className="step-title">Escolha a Obra</h3>
            <p className="step-desc">
              Descubra a leitura coletiva do ciclo ou navegue no catálogo de livros com contexto editorial, avisos de conteúdo e cronograma sugerido.
            </p>
          </article>

          <article className="step-card">
            <span className="step-number" aria-hidden="true">2</span>
            <h3 className="step-title">Leia no Seu Ritmo</h3>
            <p className="step-desc">
              Leia no seu exemplar físico, Kindle ou e-reader. Use a plataforma para marcar capítulos concluídos no seu diário de leitura pessoal sem ansiedade.
            </p>
          </article>

          <article className="step-card">
            <span className="step-number" aria-hidden="true">3</span>
            <h3 className="step-title">Debata sem Spoilers</h3>
            <p className="step-desc">
              Converse em canais protegidos por capítulo no clube oficial de cada livro e participe dos encontros ao vivo para trocar teorias com a comunidade.
            </p>
          </article>
        </div>
      </section>

      {/* 3. Temporada em Destaque (Ciclo Ativo) */}
      <section id="temporada-destaque" className="section container">
        <div className="section-head">
          <div>
            <span className="eyebrow">Ciclo de Leitura em Andamento</span>
            <h2>Temporada em Destaque</h2>
            <p>A comunidade está reunida lendo e debatendo esta obra agora mesmo.</p>
          </div>
          {activeSeason?.season && (
            <Link className="text-link" href={`/temporadas/${activeSeason.season.slug}`}>
              Acessar cronograma da temporada <span aria-hidden="true">→</span>
            </Link>
          )}
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

      {/* 4. A Experiência de Segunda Tela — Recursos Reais */}
      <section className="section container">
        <div className="section-head" style={{ textAlign: 'center', alignItems: 'center' }}>
          <div>
            <span className="eyebrow">Experiência Canônica</span>
            <h2>A segunda tela para o seu livro</h2>
            <p>
              Você lê no seu exemplar impresso ou digital. O DIYSPUR conecta você às discussões da obra em tempo real.
            </p>
          </div>
        </div>

        <div className="hero-mockup" aria-label="Apresentação dos pilares da segunda tela">
          <div className="reader-second-screen">
            <div className="reader-screen-toolbar">
              <div className="reader-screen-identity">
                <span aria-hidden="true">📖</span>
                <span>DiySpur Reader · Ambiente de Leitura Coletiva</span>
              </div>
              <div className="reader-screen-badge">
                <span className="reader-screen-dot" aria-hidden="true" />
                Segunda Tela Ativa
              </div>
            </div>

            <div className="reader-screen-body">
              <div className="reader-screen-sidebar">
                <div className="mockup-book-badge">Estrutura Canônica</div>
                <div className="mockup-book-title" style={{ fontFamily: 'var(--font-serif)' }}>
                  {activeSeason?.book?.title ?? 'Leitura do Momento'}
                </div>
                <div className="mockup-chapter-row active">
                  <span>Capítulo da Semana</span>
                  <strong className="mockup-status-active">Liberado</strong>
                </div>
                <div className="mockup-chapter-row">
                  <span>Capítulo Seguinte</span>
                  <span className="mockup-status-muted">Bloqueado anti-spoiler</span>
                </div>
                <div className="mockup-chapter-row">
                  <span>Debate de Encerramento</span>
                  <span className="mockup-status-muted">Agenda ao vivo</span>
                </div>
              </div>

              <div className="reader-screen-main">
                <div>
                  <div className="spoiler-protection-banner" style={{ marginBottom: '16px' }}>
                    <span aria-hidden="true">🛡️</span>
                    <span>
                      <strong>Proteção ativa por design:</strong> Tópicos de capítulos futuros exigem confirmação de leitura para evitar revelações acidentais do enredo.
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                    <div style={{ padding: '12px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                      <strong style={{ display: 'block', fontSize: 'var(--text-body-sm)', color: 'var(--text-primary)', marginBottom: '4px' }}>
                        💬 Canais por Livro
                      </strong>
                      <span style={{ fontSize: 'var(--text-caption)', color: 'var(--text-secondary)' }}>
                        Espaços oficiais de discussão estruturados em #geral, #sem-spoilers e canais por capítulo.
                      </span>
                    </div>

                    <div style={{ padding: '12px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                      <strong style={{ display: 'block', fontSize: 'var(--text-body-sm)', color: 'var(--text-primary)', marginBottom: '4px' }}>
                        📝 Diário Pessoal
                      </strong>
                      <span style={{ fontSize: 'var(--text-caption)', color: 'var(--text-secondary)' }}>
                        Caderno privado para anotar citações marcantes e reflexões ao longo de cada trecho.
                      </span>
                    </div>
                  </div>
                </div>

                <div className="detail-pills" style={{ marginTop: '12px' }}>
                  <span className="status-pill">1 Livro = 1 Clube Oficial</span>
                  <span className="status-pill neutral">🎙️ Encontros com Google Agenda e iCal</span>
                </div>
              </div>
            </div>
          </div>
          <p className="field-hint" style={{ textAlign: 'center', marginTop: '14px' }}>
            Acompanhe a leitura semana a semana, comente sem medo e participe dos debates virtuais.
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
              <p className="field-hint">Novas datas de debate serão divulgadas em breve para o ciclo.</p>
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

      {/* 6. Catálogo / Biblioteca Geral */}
      <section className="section container">
        <div className="section-head">
          <div>
            <span className="eyebrow">Biblioteca</span>
            <h2>Histórias para ler em conjunto</h2>
            <p>Obras selecionadas com clubes oficiais e canais de discussão dedicados.</p>
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

      {/* 7. Comunidade Real & Rankings (Transparência de Leituras) */}
      <section className="section container">
        <div className="section-head" style={{ textAlign: 'center', alignItems: 'center' }}>
          <div>
            <span className="eyebrow">Comunidade & Engajamento</span>
            <h2>Um clube vivo, feito por quem ama literatura</h2>
            <p>Sem algoritmos voltados à distração: todo o engajamento é contextualizado ao redor de livros e pessoas reais.</p>
          </div>
        </div>

        <div className="feature-grid">
          <div className="cell">
            <span className="cell-icon" aria-hidden="true">📚</span>
            <h3 className="cell-title">Clubes Oficiais por Livro</h3>
            <p className="cell-body">
              Cada obra possui um grupo dedicado com tópicos por capítulo e mediação comunitária para trocas de perspectivas sem ruído.
            </p>
            <div style={{ marginTop: '16px' }}>
              <Link className="text-link" href="/clubes">
                Explorar clubes de leitura →
              </Link>
            </div>
          </div>

          <div className="cell">
            <span className="cell-icon" aria-hidden="true">🏆</span>
            <h3 className="cell-title">Rankings e Conquistas</h3>
            <p className="cell-body">
              Acompanhe os livros mais lidos, leituras ativas e o ranking de XP dos leitores mais participativos nas temporadas.
            </p>
            <div style={{ marginTop: '16px' }}>
              <Link className="text-link" href="/ranking">
                Ver rankings da comunidade →
              </Link>
            </div>
          </div>

          <div className="cell">
            <span className="cell-icon" aria-hidden="true">📅</span>
            <h3 className="cell-title">Encontros Virtuais com RSVP</h3>
            <p className="cell-body">
              Confirme presença nos debates ao vivo e sincronize datas diretamente com seu Google Agenda ou calendário preferido (RFC 5545).
            </p>
            <div style={{ marginTop: '16px' }}>
              <Link className="text-link" href="/calendario">
                Conferir agenda de debates →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 8. Perguntas Frequentes (FAQ Estruturado com SEO) */}
      <section className="section container">
        <div className="section-head" style={{ textAlign: 'center', alignItems: 'center' }}>
          <div>
            <span className="eyebrow">Dúvidas Frequentes</span>
            <h2>Tudo o que você precisa saber</h2>
            <p>Respostas claras e diretas sobre como participar do clube de leitura.</p>
          </div>
        </div>

        <div className="faq-grid">
          {homeFaqItems.map((faq, index) => (
            <details key={index} className="faq-item" open={index === 0}>
              <summary>
                <span>{faq.question}</span>
              </summary>
              <p className="faq-answer">{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      {/* 9. CTA Final de Adesão */}
      <section className="section container">
        <div className="community-invite-card">
          <span className="eyebrow" style={{ marginBottom: '8px' }}>Participe do Clube</span>
          <h2 style={{ fontSize: 'var(--text-display)', fontWeight: 'var(--weight-display)', margin: '8px 0 12px' }}>
            Seu próximo capítulo começa aqui.
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-body)', maxWidth: '540px', margin: '0 auto 24px' }}>
            Junte-se a leitores que desvendam cada obra em comunidade. Cronogramas sem pressa, discussões protegidas e debates ao vivo gratuitos.
          </p>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '16px' }}>
            <Link className="btn btn-primary btn-lg" href={heroCtaHref}>
              {heroCtaLabel} <span aria-hidden="true">↗</span>
            </Link>
            <Link className="btn btn-secondary btn-lg" href="/livros">
              Explorar acervo de livros
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
