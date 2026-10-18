import Link from 'next/link';
import { logInfo } from '@/lib/observability/logger';

export default function NotFound() {
  try {
    logInfo('page_not_found', {
      route: 'not_found',
      status_code: 404,
      boundary: 'not-found',
    });
  } catch {
    // Fail-safe
  }

  return (
    <section className="container section">
      <div className="empty-state">
        <span className="eyebrow">404 · Página não encontrada</span>
        <h1 className="display-title">
          Essa página virou <em>uma história paralela.</em>
        </h1>
        <p>O link pode estar antigo ou a página não existe. Volte para uma leitura conhecida.</p>
        <div className="empty-actions">
          <Link className="button" href="/">
            Voltar ao início
          </Link>
        </div>
      </div>
    </section>
  );
}
