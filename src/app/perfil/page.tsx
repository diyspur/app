import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  getProfileOverview,
  type Achievement,
  type ProfileOverviewData,
  type ReadingHistoryItem,
} from '@/features/profile/queries';
import { memberLinks } from '@/lib/member-navigation';
import { getShelfStatusPresentation } from '@/features/reading/presentation';

export const metadata: Metadata = { title: 'Meu espaço', robots: { index: false, follow: false } };

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(date);
}

function formatMinutes(value: number): string {
  return `${value} min`;
}

function statusLabel(status: ReadingHistoryItem['status']): string {
  return getShelfStatusPresentation(status).label;
}

function MetricGrid({ metrics }: { metrics: Array<{ label: string; value: string | number }> }) {
  return (
    <dl className="metric-grid">
      {metrics.map((metric) => (
        <div className="metric-card" key={metric.label}>
          <dt className="field-hint">{metric.label}</dt>
          <dd className="metric-value">{metric.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function RecentReading({ items }: { items: ReadingHistoryItem[] }) {
  return (
    <section className="section" aria-labelledby="recent-reading-title">
      <div className="section-head">
        <div>
          <span className="eyebrow">Atividade</span>
          <h2 id="recent-reading-title">Sua leitura recente</h2>
        </div>
        <Link className="text-link" href="/historico">Ver histórico →</Link>
      </div>
      <div className="timeline">
        {items.map((item) => (
          <article className="timeline-row" key={item.id}>
            <div>
              <h3><Link href={`/capitulos/${item.chapter.id}`}>{item.chapter.title}</Link></h3>
              <p>
                <Link className="text-link" href={`/livros/${item.book.slug}`}>{item.book.title}</Link>
                {' · '}{item.season.title} · capítulo {item.chapter.number}
              </p>
            </div>
            <span className={`status-pill${item.status === 'read' ? '' : ' neutral'}`}>{statusLabel(item.status)}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function AchievementList({ achievements }: { achievements: Achievement[] }) {
  return (
    <section className="section" aria-labelledby="achievements-title">
      <div className="section-head">
        <div>
          <span className="eyebrow">Conquistas</span>
          <h2 id="achievements-title">O que você desbloqueou</h2>
        </div>
      </div>
      <div className="timeline">
        {achievements.map((achievement) => {
          const unlockedDate = formatDate(achievement.unlockedAt);
          return (
            <article className="timeline-row" key={`${achievement.id}-${achievement.unlockedAt}`}>
              <div>
                <h3>{achievement.title}</h3>
                <p>{achievement.description}</p>
                {unlockedDate && <p>Desbloqueada em <time dateTime={achievement.unlockedAt}>{unlockedDate}</time></p>}
              </div>
              {achievement.xp_reward !== null && <span className="status-pill">+{achievement.xp_reward} XP</span>}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function OverviewContent({ data }: { data: ProfileOverviewData }) {
  const { overview, xp, streak, quizAverage, achievements, recentHistory } = data;
  const overviewMetrics: Array<{ label: string; value: string | number }> = [];
  if (overview) {
    if (overview.books_read !== null) overviewMetrics.push({ label: 'Livros concluídos', value: overview.books_read });
    if (overview.books_reading !== null) overviewMetrics.push({ label: 'Livros em andamento', value: overview.books_reading });
    if (overview.books_want !== null) overviewMetrics.push({ label: 'Quero ler', value: overview.books_want });
    if (overview.books_dnf !== null) overviewMetrics.push({ label: 'Pausados', value: overview.books_dnf });
    if (overview.reading_days !== null) overviewMetrics.push({ label: 'Dias de leitura', value: overview.reading_days });
    if (overview.total_minutes !== null) overviewMetrics.push({ label: 'Tempo de leitura', value: formatMinutes(overview.total_minutes) });
    if (overview.read_today !== null) overviewMetrics.push({ label: 'Leituras hoje', value: overview.read_today });
  }
  const hasActivity = overviewMetrics.length > 0 || Boolean(xp || streak || quizAverage || achievements.length || recentHistory.length);

  return (
    <section className="member-card">
      <h2>Bem-vindo(a) ao seu clube</h2>
      <p>
        {data.profile?.bio
          ? data.profile.bio
          : hasActivity
            ? 'Leitor ativo no DIYSPUR.'
            : 'Quando sua leitura começar, este espaço vai acompanhar seu caminho e suas descobertas.'}
      </p>
      {data.profile?.level && <p>Nível: {data.profile.level}</p>}

      {!hasActivity && (
        <div className="empty-state">
          <div className="empty-state-mark" aria-hidden="true">⌁</div>
          <h3>Seu histórico começa com a próxima página</h3>
          <p>Ainda não há atividade de leitura disponível para exibir aqui.</p>
          <div className="empty-actions">
            <Link className="button button-small" href="/livros">Escolher uma leitura</Link>
          </div>
        </div>
      )}

      {overviewMetrics.length > 0 && (
        <section className="section" aria-labelledby="overview-title">
          <div className="section-head">
            <div>
              <span className="eyebrow">Visão geral</span>
              <h2 id="overview-title">Seu caminho de leitura</h2>
            </div>
          </div>
          <MetricGrid metrics={overviewMetrics} />
        </section>
      )}

      {(xp || streak) && (
        <section className="section" aria-labelledby="momentum-title">
          <div className="section-head">
            <div>
              <span className="eyebrow">Ritmo do clube</span>
              <h2 id="momentum-title">Constância que é sua</h2>
            </div>
          </div>
          <MetricGrid
            metrics={[
              ...(xp ? [
                { label: 'XP total', value: xp.total_xp },
                { label: 'XP da temporada', value: xp.season_xp },
              ] : []),
              ...(streak ? [
                { label: 'Sequência atual', value: streak.current_streak },
                { label: 'Maior sequência', value: streak.longest_streak },
              ] : []),
            ]}
          />
          {streak?.last_activity_at && (
            <p className="field-hint">
              Última atividade: <time dateTime={streak.last_activity_at}>{formatDate(streak.last_activity_at) ?? streak.last_activity_at}</time>
            </p>
          )}
        </section>
      )}

      {quizAverage && quizAverage.attempts_total > 0 && (
        <section className="section" aria-labelledby="quiz-momentum-title">
          <div className="section-head">
            <div>
              <span className="eyebrow">Quiz</span>
              <h2 id="quiz-momentum-title">Você está guardando a leitura</h2>
            </div>
          </div>
          <MetricGrid
            metrics={[
              { label: 'Tentativas', value: quizAverage.attempts_total },
              { label: 'Média', value: `${Math.round(quizAverage.average_percent)}%` },
              { label: 'Melhor resultado', value: `${Math.round(quizAverage.best_percent)}%` },
            ]}
          />
        </section>
      )}

      {recentHistory.length > 0 && <RecentReading items={recentHistory} />}
      {achievements.length > 0 && <AchievementList achievements={achievements} />}

      <section className="section" aria-labelledby="privacy-data-heading">
        <div className="section-head">
          <div>
            <span className="eyebrow">Transparência e LGPD</span>
            <h2 id="privacy-data-heading">Seus dados e privacidade</h2>
          </div>
        </div>
        <p className="field-hint" style={{ marginBottom: '12px' }}>
          Em conformidade com a Lei Geral de Proteção de Dados (Art. 18), você pode baixar a qualquer momento uma cópia integral das suas anotações, histórico e listas em formato estruturado.
        </p>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <a className="button button-small" href="/api/account/export" download>
            Exportar meus dados (JSON) ↓
          </a>
          <Link className="text-link" href="/privacidade">
            Política de privacidade →
          </Link>
        </div>
      </section>

      <div className="notice" style={{ marginTop: '20px' }}>
        Seus dados pessoais e seu progresso são protegidos pelas políticas de acesso do clube.
      </div>
      <div className="hero-actions">
        <Link className="button button-small" href="/livros">Escolher uma leitura</Link>
      </div>
    </section>
  );
}

export default async function ProfilePage() {
  const data = await getProfileOverview();
  if (!data) redirect('/entrar?redirect=/perfil');

  return (
    <section className="container">
      <header className="page-intro">
        <span className="eyebrow">Seu espaço de leitura</span>
        <h1>Olá, {data.profile?.display_name ?? 'leitor(a)'}.</h1>
        <p>Suas histórias, no seu tempo.</p>
      </header>
      <div className="member-grid">
        <nav className="member-nav" aria-label="Área pessoal">
          {memberLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={link.href === '/perfil' ? 'page' : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <OverviewContent data={data} />
      </div>
    </section>
  );
}
