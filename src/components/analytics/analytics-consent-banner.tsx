'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  readAnalyticsConsent,
  saveAnalyticsConsent,
  onAnalyticsConsentChange,
  type AnalyticsConsent,
} from '@/lib/analytics/consent';

export function AnalyticsConsentBanner() {
  const [choice, setChoice] = useState<AnalyticsConsent | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const current = readAnalyticsConsent();
    setChoice(current);
    setOpen(current === null);

    const unsubscribe = onAnalyticsConsentChange(() => {
      const updated = readAnalyticsConsent();
      setChoice(updated);
      setOpen(updated === null);
    });

    return unsubscribe;
  }, []);

  function choose(value: AnalyticsConsent) {
    saveAnalyticsConsent(value);
    setChoice(value);
    setOpen(false);
  }

  if (!open) {
    return null;
  }

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="analytics-consent-title"
      aria-describedby="analytics-consent-desc"
      className="analytics-consent"
    >
      <h2 id="analytics-consent-title">Privacidade e preferências de telemetria</h2>
      <p id="analytics-consent-desc">
        Utilizamos ferramentas de análise e desempenho para entender o uso da plataforma, prevenir falhas técnicas
        e aprimorar sua experiência de leitura:
      </p>

      <ul className="analytics-consent-tools">
        <li>
          <strong>PostHog &amp; Google Analytics 4 (GA4):</strong> Métricas de navegação e engajamento no catálogo e clubes.
        </li>
        <li>
          <strong>Microsoft Clarity:</strong> Mapas de calor e usabilidade com anonimização total de dados sensíveis.
        </li>
        <li>
          <strong>Grafana Faro:</strong> Diagnóstico técnico de desempenho (Core Web Vitals) e estabilidade da interface.
        </li>
      </ul>

      <p className="analytics-consent-guarantee">
        Nenhum dado é coletado sem o seu consentimento prévio (política de privacidade estrita por padrão). A recusa não
        limita o acesso ao clube.{' '}
        <Link href="/privacidade" className="analytics-consent-privacy-link">
          Gerenciar na Política de Privacidade
        </Link>
      </p>

      <div className="analytics-consent-actions">
        <button
          type="button"
          className="btn btn-secondary btn-sm analytics-consent-btn analytics-consent-btn-reject"
          onClick={() => choose('denied')}
        >
          Recusar
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm analytics-consent-btn analytics-consent-btn-accept"
          onClick={() => choose('granted')}
        >
          Aceitar
        </button>
        {choice !== null && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setOpen(false)}
          >
            Fechar
          </button>
        )}
      </div>
    </aside>
  );
}
