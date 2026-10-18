import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  hasAnalyticsConsent,
  readAnalyticsConsent,
  saveAnalyticsConsent,
  revokeAnalyticsConsent,
  onAnalyticsConsentChange,
  analyticsConsentEventName,
} from '../../src/lib/analytics/consent';

describe('Telemetry Consent Reactive Layer', () => {
  let store: Record<string, string> = {};
  let listeners: Record<string, ((event: CustomEvent) => void)[]> = {};

  beforeEach(() => {
    store = {};
    listeners = {};

    const mockStorage = {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, val: string) => {
        store[key] = val;
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
      clear: vi.fn(() => {
        store = {};
      }),
      length: 0,
      key: vi.fn(() => null),
    };

    const mockWindow = {
      localStorage: mockStorage,
      dispatchEvent: vi.fn((event: Event) => {
        const custom = event as CustomEvent;
        listeners[custom.type]?.forEach((l) => l(custom));
        return true;
      }),
      addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
        listeners[type] = listeners[type] || [];
        listeners[type].push(listener as (event: CustomEvent) => void);
      }),
      removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
        listeners[type] = (listeners[type] || []).filter((l) => l !== listener);
      }),
    };

    // @ts-expect-error test mock
    global.window = mockWindow;

    // @ts-expect-error mock CustomEvent in node
    global.CustomEvent = class CustomEvent {
      type: string;
      detail: unknown;
      constructor(type: string, params?: { detail?: unknown }) {
        this.type = type;
        this.detail = params?.detail;
      }
    };
  });

  afterEach(() => {
    // @ts-expect-error cleanup
    delete global.window;
    // @ts-expect-error cleanup
    delete global.CustomEvent;
  });

  describe('Fail-Closed Privacy: hasAnalyticsConsent()', () => {
    it('retorna false quando nenhuma decisão foi tomada (ausência de consentimento)', () => {
      expect(hasAnalyticsConsent()).toBe(false);
    });

    it('retorna false quando o consentimento foi explicitamente recusado (denied)', () => {
      saveAnalyticsConsent('denied');
      expect(hasAnalyticsConsent()).toBe(false);
    });

    it('retorna false quando o valor no localStorage é corrompido ou inválido', () => {
      store['diyspur.analytics-consent.v1'] = 'unknown_value';
      expect(hasAnalyticsConsent()).toBe(false);
    });

    it('retorna true APENAS quando consentimento foi explicitamente concedido (granted)', () => {
      saveAnalyticsConsent('granted');
      expect(hasAnalyticsConsent()).toBe(true);
    });
  });

  describe('readAnalyticsConsent()', () => {
    it('retorna null quando não há registro ou valor é inválido', () => {
      expect(readAnalyticsConsent()).toBeNull();
      store['diyspur.analytics-consent.v1'] = 'invalid';
      expect(readAnalyticsConsent()).toBeNull();
    });

    it('retorna "granted" ou "denied" conforme salvo', () => {
      saveAnalyticsConsent('granted');
      expect(readAnalyticsConsent()).toBe('granted');

      saveAnalyticsConsent('denied');
      expect(readAnalyticsConsent()).toBe('denied');
    });

    it('retorna null de forma resiliente caso localStorage falhe ao lançar exceção', () => {
      global.window.localStorage.getItem = vi.fn(() => {
        throw new Error('SecurityError: localStorage blocked');
      });
      expect(readAnalyticsConsent()).toBeNull();
    });
  });

  describe('saveAnalyticsConsent()', () => {
    it('persiste a escolha na chave versionada diyspur.analytics-consent.v1', () => {
      saveAnalyticsConsent('granted');
      expect(store['diyspur.analytics-consent.v1']).toBe('granted');

      saveAnalyticsConsent('denied');
      expect(store['diyspur.analytics-consent.v1']).toBe('denied');
    });

    it('dispara CustomEvent com detail correspondente', () => {
      const handler = vi.fn();
      window.addEventListener(analyticsConsentEventName(), handler);

      saveAnalyticsConsent('granted');
      expect(handler).toHaveBeenCalledTimes(1);
      expect((handler.mock.calls[0]?.[0] as CustomEvent).detail).toBe('granted');
    });
  });

  describe('revokeAnalyticsConsent()', () => {
    it('remove o registro de consentimento do localStorage', () => {
      saveAnalyticsConsent('granted');
      expect(readAnalyticsConsent()).toBe('granted');

      revokeAnalyticsConsent();
      expect(store['diyspur.analytics-consent.v1']).toBeUndefined();
      expect(readAnalyticsConsent()).toBeNull();
      expect(hasAnalyticsConsent()).toBe(false);
    });

    it('dispara evento de desativação ("denied") para os adaptadores encerrarem coleta', () => {
      const handler = vi.fn();
      window.addEventListener(analyticsConsentEventName(), handler);

      saveAnalyticsConsent('granted');
      expect(handler).toHaveBeenCalledTimes(1);

      revokeAnalyticsConsent();
      expect(handler).toHaveBeenCalledTimes(2);
      expect((handler.mock.calls[1]?.[0] as CustomEvent).detail).toBe('denied');
    });
  });

  describe('Reatividade e Subscrição: onAnalyticsConsentChange()', () => {
    it('notifica imediatamente os ouvintes registrados quando saveAnalyticsConsent é invocado', () => {
      const listener = vi.fn();
      const unsubscribe = onAnalyticsConsentChange(listener);

      expect(listener).not.toHaveBeenCalled();

      saveAnalyticsConsent('granted');
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith('granted');

      saveAnalyticsConsent('denied');
      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener).toHaveBeenCalledWith('denied');

      unsubscribe();
    });

    it('notifica ouvintes com "denied" quando revokeAnalyticsConsent é invocado', () => {
      const listener = vi.fn();
      const unsubscribe = onAnalyticsConsentChange(listener);

      saveAnalyticsConsent('granted');
      expect(listener).toHaveBeenCalledWith('granted');

      revokeAnalyticsConsent();
      expect(listener).toHaveBeenCalledWith('denied');
      expect(hasAnalyticsConsent()).toBe(false);

      unsubscribe();
    });

    it('permite múltiplos ouvintes simultâneos de forma independente', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      const unsub1 = onAnalyticsConsentChange(listener1);
      const unsub2 = onAnalyticsConsentChange(listener2);

      saveAnalyticsConsent('granted');
      expect(listener1).toHaveBeenCalledWith('granted');
      expect(listener2).toHaveBeenCalledWith('granted');

      unsub1();

      saveAnalyticsConsent('denied');
      expect(listener1).toHaveBeenCalledTimes(1); // Desinscrito, não recebe nova chamada
      expect(listener2).toHaveBeenCalledTimes(2);
      expect(listener2).toHaveBeenLastCalledWith('denied');

      unsub2();
    });

    it('interrompe o recebimento de notificações após chamar a função de cancelamento (unsubscribe)', () => {
      const listener = vi.fn();
      const unsubscribe = onAnalyticsConsentChange(listener);

      saveAnalyticsConsent('granted');
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();

      saveAnalyticsConsent('denied');
      revokeAnalyticsConsent();
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('Suporte Seguro a SSR (typeof window === "undefined")', () => {
    beforeEach(() => {
      // @ts-expect-error simulate SSR
      delete global.window;
    });

    it('hasAnalyticsConsent() retorna false no ambiente servidor', () => {
      expect(typeof window).toBe('undefined');
      expect(hasAnalyticsConsent()).toBe(false);
    });

    it('readAnalyticsConsent() retorna null no ambiente servidor', () => {
      expect(typeof window).toBe('undefined');
      expect(readAnalyticsConsent()).toBeNull();
    });

    it('saveAnalyticsConsent() e revokeAnalyticsConsent() não quebram no servidor', () => {
      expect(() => saveAnalyticsConsent('granted')).not.toThrow();
      expect(() => revokeAnalyticsConsent()).not.toThrow();
    });

    it('onAnalyticsConsentChange() retorna uma função no-op sem lançar exceções', () => {
      const listener = vi.fn();
      const unsubscribe = onAnalyticsConsentChange(listener);
      expect(typeof unsubscribe).toBe('function');
      expect(() => unsubscribe()).not.toThrow();
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
