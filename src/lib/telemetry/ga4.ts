import { hasAnalyticsConsent } from '../analytics/consent';
import { sanitizePayload } from '../observability/redaction';

export const GA4_DEFAULT_MEASUREMENT_ID = 'G-EXTXEDXJV2';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let initialized = false;

function ensureGtag(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    window.dataLayer = window.dataLayer || [];
    if (typeof window.gtag !== 'function') {
      window.gtag = function (...args: unknown[]) {
        window.dataLayer?.push(args);
      };
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Atualiza o Google Consent Mode v2 no browser.
 */
export function updateGa4Consent(granted: boolean): void {
  if (typeof window === 'undefined') return;

  try {
    ensureGtag();
    if (typeof window.gtag === 'function') {
      window.gtag('consent', 'update', {
        analytics_storage: granted ? 'granted' : 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
      });
    }
  } catch {
    // Fail-safe
  }
}

/**
 * Inicializa o Google Analytics 4 com Google Consent Mode v2.
 * Fail-Closed: Não inicializa se o consentimento de analytics não tiver sido concedido.
 */
export function initGa4(measurementId?: string): boolean {
  if (typeof window === 'undefined') return false;

  try {
    if (!hasAnalyticsConsent()) {
      // Se não há consentimento, garante que o consent mode permaneça negado
      if (typeof window.gtag === 'function') {
        updateGa4Consent(false);
      }
      initialized = false;
      return false;
    }

    ensureGtag();

    if (typeof window.gtag === 'function') {
      // 1. Google Consent Mode v2
      window.gtag('consent', 'update', {
        analytics_storage: 'granted',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
      });

      // 2. Configuração do Measurement ID
      const targetId =
        measurementId ||
        process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID ||
        GA4_DEFAULT_MEASUREMENT_ID;

      window.gtag('js', new Date());
      window.gtag('config', targetId, {
        send_page_view: false,
        anonymize_ip: true,
      });

      initialized = true;
      return true;
    }

    return false;
  } catch {
    initialized = false;
    return false;
  }
}

/**
 * Envia evento customizado para o GA4 com sanitização de PII e isolamento de erros.
 */
export function trackGa4Event(
  name: string,
  params?: Record<string, unknown>
): boolean {
  if (typeof window === 'undefined' || !hasAnalyticsConsent()) {
    return false;
  }

  try {
    if (!initialized) {
      const ok = initGa4();
      if (!ok) return false;
    }

    if (typeof window.gtag !== 'function') {
      return false;
    }

    const safeParams = params ? sanitizePayload(params) : {};
    window.gtag('event', name, safeParams);
    return true;
  } catch {
    // Isolamento de erros: nunca propagar exceção para o chamador
    return false;
  }
}

/**
 * Desativa o GA4 revogando o Consent Mode v2.
 */
export function disableGa4(): void {
  try {
    updateGa4Consent(false);
  } finally {
    initialized = false;
  }
}

export function isGa4Initialized(): boolean {
  return initialized && hasAnalyticsConsent();
}

export function resetGa4ForTesting(): void {
  initialized = false;
}
