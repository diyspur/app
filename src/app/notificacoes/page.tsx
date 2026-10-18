import type { Metadata } from 'next';
import Link from 'next/link';

import { NotificationList } from './notification-list';
import { getNotificationsPageData } from './queries';
import { ClubInvitations } from '@/components/clubs/club-invitations';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Notificações',
  robots: { index: false, follow: false },
};

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const page = Math.max(1, parseInt(resolvedParams.page || '1', 10) || 1);

  const { userId, notifications, invitations, preferences, totalPages, total, error } =
    await getNotificationsPageData(page, 20);

  return (
    <section className="container">
      <header className="page-intro">
        <span className="eyebrow">Seu espaço, suas escolhas</span>
        <h1>Fique perto do que importa.</h1>
        <p>Atualizações sobre as histórias, conversas e encontros que fazem parte do seu caminho.</p>
      </header>

      {!userId ? (
        <div className="member-card" role={error ? 'alert' : undefined}>
          <h2>Entre para ver suas notificações</h2>
          <p>Este espaço é pessoal. Faça login para consultar apenas as atualizações da sua conta.</p>
          <div className="empty-actions">
            <Link className="button button-small" href="/entrar?redirect=%2Fnotificacoes">
              Entrar na comunidade
            </Link>
          </div>
        </div>
      ) : (
        <section aria-labelledby="notifications-heading" className="section">
          <ClubInvitations invitations={invitations} />
          <div className="section-head">
            <div>
              <span className="eyebrow">Atualizações recentes</span>
              <h2 id="notifications-heading">Suas notificações {total > 0 ? `(${total})` : ''}</h2>
            </div>
          </div>
          <NotificationList
            notifications={notifications}
            preferences={preferences}
            error={error}
          />

          {totalPages > 1 && (
            <nav className="pagination-nav" aria-label="Paginação de notificações" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '2rem' }}>
              {page > 1 ? (
                <Link className="button button-quiet button-small" href={`/notificacoes?page=${page - 1}`}>
                  ← Anterior
                </Link>
              ) : (
                <span className="button button-quiet button-small disabled" aria-disabled="true">
                  ← Anterior
                </span>
              )}
              <span className="field-hint" style={{ margin: 0 }}>
                Página {page} de {totalPages}
              </span>
              {page < totalPages ? (
                <Link className="button button-quiet button-small" href={`/notificacoes?page=${page + 1}`}>
                  Próxima →
                </Link>
              ) : (
                <span className="button button-quiet button-small disabled" aria-disabled="true">
                  Próxima →
                </span>
              )}
            </nav>
          )}
        </section>
      )}
    </section>
  );
}
