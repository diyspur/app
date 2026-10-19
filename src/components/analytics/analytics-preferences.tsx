'use client';

import { useEffect, useState } from 'react';
import {
  readAnalyticsConsent,
  saveAnalyticsConsent,
  revokeAnalyticsConsent,
  onAnalyticsConsentChange,
  type AnalyticsConsent,
} from '@/lib/analytics/consent';

export function AnalyticsPreferences() {
  const [consent, setConsent] = useState<AnalyticsConsent | null>(null);
  const [mounted, setMounted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    setConsent(readAnalyticsConsent());

    const unsubscribe = onAnalyticsConsentChange(() => {
      setConsent(readAnalyticsConsent());
    });

    return unsubscribe;
  }, []);

  function handleAllow() {
    saveAnalyticsConsent('granted');
    setConsent('granted');
    setMessage('Consentimento concedido. Telemetria e métricas ativadas.');
  }

  function handleDenyOrRevoke() {
    saveAnalyticsConsent('denied');
    setConsent('denied');
    setMessage('Consentimento recusado ou revogado. Telemetria e métricas desativadas em tempo real.');
  }

  function handleReset() {
    revokeAnalyticsConsent();
    setConsent(null);
    setMessage('Consentimento redefinido para o padrão estrito (bloqueado).');
  }

  return (
    <div className="privacy-consent-manager" data-testid="analytics-preferences">
      <div className="privacy-consent-status-card">
        <div className="privacy-consent-status-header">
          <span className="privacy-consent-label">Status atual do seu consentimento:</span>
          {mounted ? (
            <span
              className={`privacy-consent-badge ${
                consent === 'granted'
                  ? 'status-granted'
                  : consent === 'denied'
                    ? 'status-denied'
                    : 'status-default'
              }`}
              data-testid="consent-status-badge"
            >
              {consent === 'granted'
                ? 'Permitido (Analytics Ativo)'
                : consent === 'denied'
                  ? 'Recusado ou Revogado (Analytics Bloqueado)'
                  : 'Padrão Estrito (Não Configurado / Bloqueado)'}
            </span>
          ) : (
            <span className="privacy-consent-badge status-default">Carregando...</span>
          )}
        </div>

        <p className="privacy-consent-description">
          {consent === 'granted'
            ? 'Você autorizou a coleta de métricas de navegação (PostHog, Google Analytics 4) e usabilidade/desempenho (Microsoft Clarity, Grafana Faro).'
            : consent === 'denied'
              ? 'Você optou por recusar ou revogar a coleta. Nenhuma ferramenta de telemetria ou analytics opcional está ativa no seu navegador.'
              : 'Você ainda não registrou uma preferência no banner de consentimento. Por padrão (privacidade estrita), nenhuma ferramenta de análise ou telemetria é executada.'}
        </p>

        {message && (
          <div className="privacy-consent-alert" role="status">
            {message}
          </div>
        )}

        <div className="privacy-consent-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleAllow}
          >
            Permitir analytics
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleDenyOrRevoke}
          >
            Recusar ou revogar
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={handleReset}
          >
            Redefinir preferência
          </button>
        </div>
      </div>
    </div>
  );
}
