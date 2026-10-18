export type AnalyticsConsent = 'granted' | 'denied';

const STORAGE_KEY = 'diyspur.analytics-consent.v1';
const CHANGE_EVENT = 'diyspur:analytics-consent-changed';

export function readAnalyticsConsent(): AnalyticsConsent | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'granted' || value === 'denied' ? value : null;
  } catch {
    return null;
  }
}

/**
 * Fail-Closed Privacy helper: returns true ONLY if user explicitly granted consent.
 * Absence of decision, explicit denial, corrupted value, or SSR returns false.
 */
export function hasAnalyticsConsent(): boolean {
  return readAnalyticsConsent() === 'granted';
}

export function saveAnalyticsConsent(value: AnalyticsConsent): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Storage might be unavailable (e.g. strict private mode or quota exceeded)
  } finally {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: value }));
  }
}

export function revokeAnalyticsConsent(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage might be unavailable
  } finally {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: 'denied' }));
  }
}

export function onAnalyticsConsentChange(
  listener: (value: AnalyticsConsent) => void
): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleCustomEvent = (event: Event) => {
    const customEvent = event as CustomEvent<AnalyticsConsent>;
    if (customEvent.detail === 'granted' || customEvent.detail === 'denied') {
      try {
        listener(customEvent.detail);
      } catch (error) {
        console.error('[analytics] Listener threw error on consent change:', error);
      }
    }
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      const nextValue =
        event.newValue === 'granted' ? 'granted' : 'denied';
      try {
        listener(nextValue);
      } catch (error) {
        console.error('[analytics] Listener threw error on storage event:', error);
      }
    }
  };

  window.addEventListener(CHANGE_EVENT, handleCustomEvent as EventListener);
  window.addEventListener('storage', handleStorage as EventListener);

  return () => {
    window.removeEventListener(CHANGE_EVENT, handleCustomEvent as EventListener);
    window.removeEventListener('storage', handleStorage as EventListener);
  };
}

export function analyticsConsentEventName(): string {
  return CHANGE_EVENT;
}
