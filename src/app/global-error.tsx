'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { logError } from '@/lib/observability/logger';
import { pushFaroError } from '@/lib/telemetry/faro';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    const route = typeof window !== 'undefined' ? window.location.pathname : undefined;

    // 1. Metadados e captura no Sentry
    try {
      Sentry.captureException(error, {
        tags: {
          boundary: 'global',
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

    // 2. Envio de erro global ao Grafana Faro
    try {
      pushFaroError(error, {
        boundary: 'global',
        route,
        nextDigest: error.digest,
      });
    } catch {
      // Fail-safe
    }

    // 3. Log estruturado com redaction
    try {
      logError('global_app_error', {
        error,
        route,
        error_code: error.digest,
        boundary: 'global',
        nextDigest: error.digest,
      });
    } catch {
      // Fail-safe
    }
  }, [error]);

  return (
    <html lang="pt-BR">
      <body>
        <main style={{ padding: '2rem', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
          <h1>Não foi possível abrir o DIYSPUR agora.</h1>
          <p>Tente novamente. Se o problema continuar, fale com o suporte.</p>
          <button
            type="button"
            onClick={() => reset()}
            aria-label="Tentar reiniciar o aplicativo"
            style={{
              padding: '0.625rem 1.25rem',
              cursor: 'pointer',
              borderRadius: '0.375rem',
              border: '1px solid currentColor',
              backgroundColor: 'transparent',
              fontSize: '1rem',
            }}
          >
            Tentar novamente
          </button>
        </main>
      </body>
    </html>
  );
}
