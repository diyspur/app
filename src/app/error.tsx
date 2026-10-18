'use client';

import * as Sentry from '@sentry/nextjs';
import Link from 'next/link';
import { useEffect } from 'react';
import { logError } from '@/lib/observability/logger';
import { pushFaroError } from '@/lib/telemetry/faro';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    const route = typeof window !== 'undefined' ? window.location.pathname : undefined;

    // 1. Captura de erro com metadados detalhados no Sentry
    try {
      Sentry.captureException(error, {
        tags: {
          boundary: 'app-route',
          route: route ? String(route).slice(0, 50) : undefined,
        },
        extra: {
          nextDigest: error.digest,
          route,
        },
      });
    } catch {
      // Fail-safe
    }

    // 2. Envio de erro para o Grafana Faro
    try {
      pushFaroError(error, {
        boundary: 'app-route',
        route,
        nextDigest: error.digest,
      });
    } catch {
      // Fail-safe
    }

    // 3. Registro de log estruturado no console com redaction de PII
    try {
      logError('app_route_error', {
        error,
        route,
        error_code: error.digest,
        boundary: 'app-route',
        nextDigest: error.digest,
      });
    } catch {
      // Fail-safe
    }
  }, [error]);

  return (
    <section className="container section">
      <div className="empty-state">
        <span className="eyebrow">Algo saiu do roteiro</span>
        <h1 className="display-title">
          Vamos tentar <em>de novo.</em>
        </h1>
        <p>Não foi possível carregar esta página agora. Tente novamente em instantes.</p>
        <div className="empty-actions">
          <button
            type="button"
            className="button"
            onClick={() => reset()}
            aria-label="Tentar carregar esta página novamente"
          >
            Tentar novamente
          </button>
          <Link className="button button-quiet" href="mailto:suporte@diyspur.com">
            Falar com o suporte
          </Link>
        </div>
      </div>
    </section>
  );
}
