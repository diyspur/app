import type { Metadata } from 'next';
import Link from 'next/link';
import { getVisibleClubsPaginated } from '@/features/clubs/queries';
import { ClubSearch } from '@/components/clubs/club-search';

export const metadata: Metadata = {
  title: 'Clubes de leitura',
  description: 'Encontre ou crie um clube para ler acompanhado.',
  alternates: { canonical: '/clubes' },
};

export default async function ClubsPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const query = typeof params.q === 'string' ? params.q.trim() : '';

  const { clubs, nextCursor, error, userId } = await getVisibleClubsPaginated({
    search: query,
    limit: 24,
  });

  return (
    <section className="container">
      <header className="page-intro">
        <span className="eyebrow">Leitura compartilhada</span>
        <h1>
          Clubes para<br />
          <em>ler junto.</em>
        </h1>
        <p>
          Crie um espaço para sua turma ou entre em um clube público. Dados privados só aparecem para membros autorizados.
        </p>
        <div className="hero-actions">
          <Link
            className="button button-small"
            href={userId ? '/clubes/novo' : '/entrar?redirect=/clubes/novo'}
          >
            Criar um clube
          </Link>
        </div>
      </header>

      {error ? (
        <div className="notice" role="alert">
          Não foi possível carregar os clubes agora.
        </div>
      ) : (
        <ClubSearch
          initialClubs={clubs}
          initialCursor={nextCursor}
          initialQuery={query}
        />
      )}
    </section>
  );
}

