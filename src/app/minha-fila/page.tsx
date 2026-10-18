import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth/session';
import { getUserUpNext } from '@/features/up-next/queries';
import { QueueManagement } from '@/components/up-next/queue-management';

export const metadata: Metadata = {
  title: 'Minha fila de leitura',
  description: 'Seus próximos livros priorizados para leitura no DIYSPUR.',
};

export default async function UpNextPage() {
  const session = await requireSession();
  if (!session) redirect('/entrar?redirect=/minha-fila');

  const items = await getUserUpNext(session.userId);

  return (
    <section className="container">
      <header className="page-intro">
        <span className="eyebrow">Planejamento</span>
        <h1>
          Minha fila: <em>o que ler a seguir.</em>
        </h1>
        <p>Organize os próximos títulos que você quer acompanhar junto com o clube ou no seu próprio ritmo.</p>
      </header>

      <section className="section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Prioridade</span>
            <h2>Livros na sua fila ({items.length})</h2>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <Link className="text-link" href="/listas">
              Organizar em listas de leitura →
            </Link>
            <Link className="text-link" href="/livros">
              Explorar catálogo →
            </Link>
          </div>
        </div>

        <QueueManagement initialItems={items} />
      </section>
    </section>
  );
}
