import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth/session';
import { getUserReadingGoals } from '@/features/goals/queries';
import { GoalForm } from '@/components/goals/goal-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Metas de leitura',
  description: 'Defina e acompanhe seus objetivos anuais de leitura.',
};

export default async function GoalsPage() {
  const session = await requireSession();
  if (!session) redirect('/entrar?redirect=/metas');

  const currentYear = new Date().getFullYear();
  const { goals, error } = await getUserReadingGoals(session.userId, currentYear);

  return (
    <section className="container">
      <header className="page-intro">
        <span className="eyebrow">Objetivos</span>
        <h1>
          Seu ritmo de leitura em <em>{currentYear}.</em>
        </h1>
        <p>Defina metas personalizadas para o seu ano e acompanhe o progresso derivado das suas leituras e diários.</p>
      </header>

      {error && (
        <div className="notice" role="alert" style={{ marginBottom: '20px' }}>
          Não foi possível carregar o progresso anual no momento.
        </div>
      )}

      <div className="goal-layout">
        <section aria-labelledby="goals-config-heading" className="member-card">
          <div className="section-head">
            <div>
              <span className="eyebrow">Suas Metas</span>
              <h2 id="goals-config-heading">Metas do ano {currentYear}</h2>
            </div>
          </div>

          {goals.length === 0 ? (
            <div style={{ marginBottom: '24px' }}>
              <p className="field-hint">Você ainda não tem metas ativas para este ano. Crie sua primeira meta abaixo!</p>
              <GoalForm goal={null} year={currentYear} />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {goals.map(({ goal }) => (
                <div
                  key={goal.id}
                  style={{
                    padding: '20px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
                    background: 'var(--surface-2, rgba(255,255,255,0.03))',
                  }}
                >
                  <h3 style={{ margin: '0 0 12px', fontSize: '1.1rem' }}>{goal.title}</h3>
                  <GoalForm goal={goal} year={currentYear} />
                </div>
              ))}

              <div
                style={{
                  padding: '20px',
                  borderRadius: '8px',
                  border: '1px dashed var(--border-subtle, rgba(255,255,255,0.2))',
                }}
              >
                <h3 style={{ margin: '0 0 12px', fontSize: '1.05rem', color: 'var(--text-secondary)' }}>
                  + Adicionar outra meta para {currentYear}
                </h3>
                <GoalForm goal={null} year={currentYear} />
              </div>
            </div>
          )}
        </section>

        <aside className="chapter-aside" aria-labelledby="goals-progress-heading">
          <h2 id="goals-progress-heading">Progresso em {currentYear}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
            {goals.length === 0 ? (
              <div className="member-card" style={{ padding: '16px' }}>
                <p className="field-hint" style={{ margin: 0 }}>
                  Defina uma meta para acompanhar seu progresso anual.
                </p>
              </div>
            ) : (
              goals.map(({ goal, progress }) => (
                <div key={`progress-${goal.id}`} className="member-card" style={{ padding: '16px' }}>
                  <span className="eyebrow">{goal.title}</span>

                  {goal.target_books ? (
                    <div style={{ marginTop: '8px' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Livros</span>
                      <p style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-bold)', margin: '2px 0' }}>
                        {progress?.books_done ?? 0} / {goal.target_books} livros
                      </p>
                      <div style={{ background: 'var(--surface-3)', height: '6px', borderRadius: '4px', overflow: 'hidden' }}>
                        <div
                          style={{
                            background: 'var(--brand)',
                            height: '100%',
                            width: `${Math.min(100, Math.round(((progress?.books_done ?? 0) / goal.target_books) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>
                  ) : null}

                  {goal.target_pages ? (
                    <div style={{ marginTop: '8px' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Páginas</span>
                      <p style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-bold)', margin: '2px 0' }}>
                        {progress?.pages_done ?? 0} / {goal.target_pages} páginas
                      </p>
                      <div style={{ background: 'var(--surface-3)', height: '6px', borderRadius: '4px', overflow: 'hidden' }}>
                        <div
                          style={{
                            background: 'var(--brand)',
                            height: '100%',
                            width: `${Math.min(100, Math.round(((progress?.pages_done ?? 0) / goal.target_pages) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>
                  ) : null}

                  {goal.target_minutes ? (
                    <div style={{ marginTop: '8px' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Minutos</span>
                      <p style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-bold)', margin: '2px 0' }}>
                        {progress?.minutes_done ?? 0} / {goal.target_minutes} minutos
                      </p>
                      <div style={{ background: 'var(--surface-3)', height: '6px', borderRadius: '4px', overflow: 'hidden' }}>
                        <div
                          style={{
                            background: 'var(--brand)',
                            height: '100%',
                            width: `${Math.min(100, Math.round(((progress?.minutes_done ?? 0) / goal.target_minutes) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              ))
            )}

            <p className="field-hint">
              O progresso é atualizado automaticamente ao concluir ciclos de leitura e registrar sessões no{' '}
              <Link className="text-link" href="/diario">diário</Link>.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
