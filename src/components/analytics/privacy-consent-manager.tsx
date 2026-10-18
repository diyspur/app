'use client';

import { useEffect, useState } from 'react';
import {
  readAnalyticsConsent,
  saveAnalyticsConsent,
  revokeAnalyticsConsent,
  onAnalyticsConsentChange,
  type AnalyticsConsent,
} from '@/lib/analytics/consent';

export function PrivacyConsentManager() {
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

  function handleUpdate(action: 'granted' | 'denied' | 'revoke') {
    if (action === 'revoke') {
      revokeAnalyticsConsent();
      setMessage('Consentimento redefinido para o padrão estrito (bloqueado).');
    } else {
      saveAnalyticsConsent(action);
      setMessage(
        action === 'granted'
          ? 'Consentimento concedido. Telemetria opcional ativada.'
          : 'Consentimento recusado. Telemetria opcional bloqueada.'
      );
    }
  }

  return (
    <div className="privacy-consent-manager">
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
            >
              {consent === 'granted'
                ? 'Concedido (Analytics Ativo)'
                : consent === 'denied'
                  ? 'Recusado (Analytics Bloqueado)'
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
              ? 'Você optou por recusar a coleta. Nenhuma ferramenta de telemetria ou analytics opcional está ativa no seu navegador.'
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
            onClick={() => handleUpdate('granted')}
          >
            Aceitar analytics
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => handleUpdate('denied')}
          >
            Recusar analytics
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => handleUpdate('revoke')}
          >
            Redefinir preferência
          </button>
        </div>
      </div>
    </div>
  );
}
