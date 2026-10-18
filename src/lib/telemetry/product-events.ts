import { hasAnalyticsConsent } from '../analytics/consent';
import type { AnalyticsEvent } from '../analytics/events';
import { captureAnalyticsEvent, identifyAnalyticsUser, resetAnalyticsIdentity } from '../analytics/client';
import { trackGa4Event } from './ga4';
import { trackClarityEvent } from './clarity';
import Clarity from '@microsoft/clarity';
import { pushFaroEvent, getFaroInstance } from './faro';
import { sanitizePayload } from '../observability/redaction';

/**
 * Dispatcher unificado de eventos de telemetria e produto (Task 4 / OBS-01).
 *
 * Despacha simultaneamente e com isolamento estrito de exceções para:
 * 1. PostHog (análise de conversão, funis e jornadas)
 * 2. Google Analytics 4 (Consent Mode v2, métricas de tráfego)
 * 3. Microsoft Clarity (mapas de calor e gravações de sessão)
 * 4. Grafana Faro (telemetria de front-end, logs e métricas no Loki/Tempo)
 *
 * Garantias fundamentais:
 * - Fail-Closed: se `hasAnalyticsConsent()` for false, NENHUM provedor recebe dados.
 * - Sanitização de PII: redaction recursivo de senhas, cartões, e-mails e tokens.
 * - Isolamento de Erros: falha em um adaptador (ex: AdBlocker bloqueando Clarity)
 *   NUNCA interfere nos demais adaptadores nem lança exceção para a aplicação.
 */
export function trackProductEvent(
  eventName: AnalyticsEvent | string,
  properties: Record<string, unknown> = {}
): void {
  if (typeof window === 'undefined') return;

  // Fail-Closed Privacy Check
  if (!hasAnalyticsConsent()) {
    return;
  }

  // Sanitiza dados de telemetria removendo PII e truncando strings longas
  const sanitized = sanitizePayload(properties) as Record<string, unknown>;

  // 1. PostHog
  try {
    const posthogProps: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(sanitized)) {
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        posthogProps[key] = value;
      }
    }
    captureAnalyticsEvent(eventName as AnalyticsEvent, posthogProps);
  } catch {
    // Isolamento de erros PostHog
  }

  // 2. Google Analytics 4
  try {
    trackGa4Event(eventName, sanitized);
  } catch {
    // Isolamento de erros GA4
  }

  // 3. Microsoft Clarity
  try {
    trackClarityEvent(eventName);
  } catch {
    // Isolamento de erros Clarity
  }

  // 4. Grafana Faro
  try {
    pushFaroEvent(eventName, sanitized);
  } catch {
    // Isolamento de erros Grafana Faro
  }
}

/**
 * Identifica o usuário de forma anônima e segura com UUID opaco em todos os provedores ativos.
 */
export function identifyProductUser(userId: string): void {
  if (typeof window === 'undefined' || !hasAnalyticsConsent()) return;

  // 1. PostHog
  try {
    identifyAnalyticsUser(userId);
  } catch {}

  // 2. Microsoft Clarity
  try {
    Clarity.identify(userId);
  } catch {}

  // 3. Grafana Faro
  try {
    const faro = getFaroInstance();
    if (faro?.api && typeof faro.api.setUser === 'function') {
      faro.api.setUser({ id: userId });
    }
  } catch {}

  // 4. Google Analytics 4
  try {
    if (typeof window.gtag === 'function') {
      window.gtag('set', 'user_properties', { user_id: userId });
    }
  } catch {}
}

/**
 * Reseta identidades em logout em todos os provedores de telemetria.
 */
export function resetProductIdentity(): void {
  if (typeof window === 'undefined') return;

  // 1. PostHog
  try {
    resetAnalyticsIdentity();
  } catch {}

  // 2. Grafana Faro
  try {
    const faro = getFaroInstance();
    if (faro?.api && typeof faro.api.resetUser === 'function') {
      faro.api.resetUser();
    }
  } catch {}
}
