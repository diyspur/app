import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  readAnalyticsConsent,
  saveAnalyticsConsent,
  analyticsConsentEventName,
} from '../../src/lib/analytics/consent';

describe('Analytics Consent Management', () => {
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

  it('retorna null quando nenhum consentimento foi registrado', () => {
    expect(readAnalyticsConsent()).toBeNull();
  });

  it('salva e recupera consentimento concedido (granted)', () => {
    saveAnalyticsConsent('granted');
    expect(readAnalyticsConsent()).toBe('granted');
  });

  it('salva e recupera consentimento recusado (denied)', () => {
    saveAnalyticsConsent('denied');
    expect(readAnalyticsConsent()).toBe('denied');
  });

  it('dispara evento customizado na alteração de consentimento', () => {
    const handler = vi.fn();
    window.addEventListener(analyticsConsentEventName(), handler);

    saveAnalyticsConsent('granted');

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0]?.[0] as CustomEvent;
    expect(event.detail).toBe('granted');

    window.removeEventListener(analyticsConsentEventName(), handler);
  });

  it('permite revogar consentimento e despacha denied (QA-17)', async () => {
    const { revokeAnalyticsConsent } = await import('../../src/lib/analytics/consent');

    saveAnalyticsConsent('granted');
    expect(readAnalyticsConsent()).toBe('granted');

    const handler = vi.fn();
    window.addEventListener(analyticsConsentEventName(), handler);

    revokeAnalyticsConsent();

    expect(readAnalyticsConsent()).toBeNull();
    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0]?.[0] as CustomEvent;
    expect(event.detail).toBe('denied');

    window.removeEventListener(analyticsConsentEventName(), handler);
  });

  it('alterna fluidamente entre permitir e recusar/revogar analytics', () => {
    // Permitir analytics
    saveAnalyticsConsent('granted');
    expect(readAnalyticsConsent()).toBe('granted');

    // Recusar analytics
    saveAnalyticsConsent('denied');
    expect(readAnalyticsConsent()).toBe('denied');

    // Permitir novamente
    saveAnalyticsConsent('granted');
    expect(readAnalyticsConsent()).toBe('granted');
  });

  it('renderiza o componente AnalyticsPreferences com botões de alternância e semântica LGPD (QA-17)', async () => {
    const React = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { AnalyticsPreferences } = await import(
      '../../src/components/analytics/analytics-preferences'
    );

    const html = renderToStaticMarkup(React.createElement(AnalyticsPreferences));

    expect(html).toContain('privacy-consent-manager');
    expect(html).toContain('Permitir analytics');
    expect(html).toContain('Recusar ou revogar');
    expect(html).toContain('Redefinir preferência');
    expect(html).toContain('Status atual do seu consentimento:');
  });
});
