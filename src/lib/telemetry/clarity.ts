import Clarity from '@microsoft/clarity';
import { hasAnalyticsConsent } from '../analytics/consent';

export const CLARITY_DEFAULT_PROJECT_ID = '3553777175551663';

let initialized = false;

/**
 * Inicializa o Microsoft Clarity respeitando o consentimento do usuário.
 * Fail-Closed: Não inicializa se o consentimento não tiver sido explicitamente concedido.
 */
export function initClarity(projectId?: string): boolean {
  if (typeof window === 'undefined') return false;

  try {
    if (!hasAnalyticsConsent()) {
      initialized = false;
      return false;
    }

    const targetId =
      projectId ||
      process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID ||
      CLARITY_DEFAULT_PROJECT_ID;

    Clarity.init(targetId);
    Clarity.consentV2({
      analytics_Storage: 'granted',
      ad_Storage: 'denied',
    });

    initialized = true;
    return true;
  } catch {
    initialized = false;
    return false;
  }
}

/**
 * Registra um evento de ação ou navegação no Microsoft Clarity.
 */
export function trackClarityEvent(name: string): boolean {
  if (typeof window === 'undefined' || !hasAnalyticsConsent()) {
    return false;
  }

  try {
    if (!initialized) {
      const ok = initClarity();
      if (!ok) return false;
    }

    Clarity.event(name);
    return true;
  } catch {
    // Isolamento de erros: AdBlockers ou falhas de rede no Clarity nunca quebram a app
    return false;
  }
}

/**
 * Aplica tags de contexto seguro no Microsoft Clarity.
 */
export function setClarityTag(key: string, value: string | string[]): boolean {
  if (typeof window === 'undefined' || !hasAnalyticsConsent()) {
    return false;
  }

  try {
    if (!initialized) {
      const ok = initClarity();
      if (!ok) return false;
    }

    Clarity.setTag(key, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Desativa o Clarity revogando consentimento.
 */
export function disableClarity(): void {
  try {
    if (typeof window !== 'undefined') {
      Clarity.consent(false);
      Clarity.consentV2({
        analytics_Storage: 'denied',
        ad_Storage: 'denied',
      });
    }
  } catch {
    // Fail-safe
  } finally {
    initialized = false;
  }
}

export function isClarityInitialized(): boolean {
  return initialized && hasAnalyticsConsent();
}

export function resetClarityForTesting(): void {
  initialized = false;
}
