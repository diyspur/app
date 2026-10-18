import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import posthog from 'posthog-js';
import Clarity from '@microsoft/clarity';
import * as faroSdk from '@grafana/faro-web-sdk';

// We will test imports from the telemetry adapters and analytics client
import {
  initGa4,
  trackGa4Event,
  disableGa4,
  isGa4Initialized,
  resetGa4ForTesting,
  GA4_DEFAULT_MEASUREMENT_ID,
} from '../../src/lib/telemetry/ga4';

import {
  initClarity,
  trackClarityEvent,
  setClarityTag,
  disableClarity,
  isClarityInitialized,
  resetClarityForTesting,
  CLARITY_DEFAULT_PROJECT_ID,
} from '../../src/lib/telemetry/clarity';

import {
  initFaro,
  pushFaroLog,
  pushFaroEvent,
  pushFaroError,
  isFaroInitialized,
  resetFaroForTesting,
  FARO_DEFAULT_ENDPOINT,
} from '../../src/lib/telemetry/faro';

import {
  initializePostHog,
  disablePostHog,
  captureAnalyticsEvent,
  isPostHogInitialized,
  resetPostHogForTesting,
} from '../../src/lib/analytics/client';

import { trackProductEvent } from '../../src/lib/telemetry/product-events';
import { saveAnalyticsConsent, revokeAnalyticsConsent } from '../../src/lib/analytics/consent';

// Global mock api for Faro
const mockFaroApi = {
  pushLog: vi.fn(),
  pushEvent: vi.fn(),
  pushError: vi.fn(),
  pushMeasurement: vi.fn(),
  setUser: vi.fn(),
  resetUser: vi.fn(),
};

// Mocks
vi.mock('posthog-js', () => ({
  default: {
    init: vi.fn(),
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
    capture: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
  },
}));

vi.mock('@microsoft/clarity', () => ({
  default: {
    init: vi.fn(),
    setTag: vi.fn(),
    identify: vi.fn(),
    consent: vi.fn(),
    consentV2: vi.fn(),
    upgrade: vi.fn(),
    event: vi.fn(),
  },
}));

vi.mock('@grafana/faro-web-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@grafana/faro-web-sdk')>();
  return {
    ...actual,
    initializeFaro: vi.fn((config) => {
      const instance = {
        api: mockFaroApi,
        config,
      };
      Object.assign(actual.faro, instance);
      return instance;
    }),
  };
});

describe('Telemetry Adapters & Unified Dispatcher (Task 4)', () => {
  let localStorageStore: Record<string, string> = {};
  const originalEnv = { ...process.env };
  const originalWindow = global.window;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageStore = {};

    resetGa4ForTesting();
    resetClarityForTesting();
    resetFaroForTesting();
    resetPostHogForTesting();

    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test_key_123';
    process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://us.i.posthog.com';
    process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID = 'G-EXTXEDXJV2';
    process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID = '3553777175551663';
    process.env.NEXT_PUBLIC_FARO_ENDPOINT =
      'https://faro-api-prod-sa-east-1.grafana.net/faro/api/v1';

    const mockStorage = {
      getItem: vi.fn((key: string) => localStorageStore[key] ?? null),
      setItem: vi.fn((key: string, val: string) => {
        localStorageStore[key] = val;
      }),
      removeItem: vi.fn((key: string) => {
        delete localStorageStore[key];
      }),
      clear: vi.fn(() => {
        localStorageStore = {};
      }),
      length: 0,
      key: vi.fn(() => null),
    };

    const listeners: Record<string, ((event: CustomEvent) => void)[]> = {};

    // @ts-expect-error Mocking window environment
    global.window = {
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
      dataLayer: [],
      gtag: vi.fn(),
    };

    // @ts-expect-error CustomEvent mock
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
    process.env = { ...originalEnv };
    global.window = originalWindow;
    vi.restoreAllMocks();
  });

  describe('Fail-Closed Privacy: Denied or Null Consent', () => {
    it('blocks GA4 from initializing or sending events when consent is not granted', () => {
      // Default: no consent saved
      const initialized = initGa4();
      expect(initialized).toBe(false);
      expect(isGa4Initialized()).toBe(false);

      const tracked = trackGa4Event('page_viewed', { page_path: '/livros' });
      expect(tracked).toBe(false);
      expect(window.gtag).not.toHaveBeenCalledWith('event', 'page_viewed', expect.anything());
    });

    it('blocks Clarity from initializing or sending events when consent is denied', () => {
      saveAnalyticsConsent('denied');

      const initialized = initClarity();
      expect(initialized).toBe(false);
      expect(isClarityInitialized()).toBe(false);
      expect(Clarity.init).not.toHaveBeenCalled();

      const tracked = trackClarityEvent('catalog_browse');
      expect(tracked).toBe(false);
      expect(Clarity.event).not.toHaveBeenCalled();

      const tagged = setClarityTag('user_type', 'reader');
      expect(tagged).toBe(false);
      expect(Clarity.setTag).not.toHaveBeenCalled();
    });

    it('blocks Faro from initializing or sending logs/events when consent is null', () => {
      const faroInstance = initFaro();
      expect(faroInstance).toBeNull();
      expect(isFaroInitialized()).toBe(false);
      expect(faroSdk.initializeFaro).not.toHaveBeenCalled();

      const logged = pushFaroLog('Test log message', { route: '/catalogo' });
      expect(logged).toBe(false);

      const eventTracked = pushFaroEvent('button_clicked', { cta: 'join' });
      expect(eventTracked).toBe(false);
    });

    it('blocks PostHog from capturing events when consent is denied', () => {
      saveAnalyticsConsent('denied');

      const initialized = initializePostHog();
      expect(initialized).toBe(false);

      captureAnalyticsEvent('cta_clicked', { cta_id: 'join_club' });
      expect(posthog.capture).not.toHaveBeenCalled();
    });

    it('dispatcher trackProductEvent is a complete no-op across all providers when consent is missing', () => {
      trackProductEvent('page_viewed', { page_path: '/catalogo' });

      expect(posthog.capture).not.toHaveBeenCalled();
      expect(window.gtag).not.toHaveBeenCalledWith('event', expect.anything(), expect.anything());
      expect(Clarity.event).not.toHaveBeenCalled();
      expect(mockFaroApi.pushEvent).not.toHaveBeenCalled();
    });
  });

  describe('GA4 Adapter (Consent Mode v2 & Event Tracking)', () => {
    beforeEach(() => {
      saveAnalyticsConsent('granted');
    });

    it('initializes GA4 with Google Consent Mode v2 and Measurement ID G-EXTXEDXJV2', () => {
      const initialized = initGa4();
      expect(initialized).toBe(true);
      expect(isGa4Initialized()).toBe(true);

      // Verify Google Consent Mode v2 call
      expect(window.gtag).toHaveBeenCalledWith('consent', 'update', {
        analytics_storage: 'granted',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
      });

      // Verify config call with default Measurement ID
      expect(window.gtag).toHaveBeenCalledWith(
        'config',
        GA4_DEFAULT_MEASUREMENT_ID,
        expect.objectContaining({
          send_page_view: false,
          anonymize_ip: true,
        })
      );
    });

    it('tracks GA4 event and sanitizes parameters for privacy/redaction', () => {
      initGa4();

      const success = trackGa4Event('search_performed', {
        query: 'Verity Colleen Hoover',
        email: 'leitor@example.com',
        token: 'secret-token-123',
      });

      expect(success).toBe(true);
      expect(window.gtag).toHaveBeenCalledWith(
        'event',
        'search_performed',
        expect.objectContaining({
          query: 'Verity Colleen Hoover',
          email: 'l***@***.com',
          token: '[REDACTED]',
        })
      );
    });

    it('disableGa4 updates consent mode to all denied and marks uninitialized', () => {
      initGa4();
      expect(isGa4Initialized()).toBe(true);

      disableGa4();
      expect(isGa4Initialized()).toBe(false);
      expect(window.gtag).toHaveBeenCalledWith('consent', 'update', {
        analytics_storage: 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
      });
    });

    it('does not throw when window.gtag throws an exception (error isolation)', () => {
      initGa4();
      window.gtag = vi.fn(() => {
        throw new Error('Google Tag Manager network error');
      });

      expect(() => {
        const tracked = trackGa4Event('page_viewed', { page_path: '/error' });
        expect(tracked).toBe(false);
      }).not.toThrow();
    });
  });

  describe('Clarity Adapter (Heatmaps & Session Recording)', () => {
    beforeEach(() => {
      saveAnalyticsConsent('granted');
    });

    it('initializes Clarity with project ID 3553777175551663 and consentV2', () => {
      const initialized = initClarity();
      expect(initialized).toBe(true);
      expect(isClarityInitialized()).toBe(true);

      expect(Clarity.init).toHaveBeenCalledWith(CLARITY_DEFAULT_PROJECT_ID);
      expect(Clarity.consentV2).toHaveBeenCalledWith({
        analytics_Storage: 'granted',
        ad_Storage: 'denied',
      });
    });

    it('tracks Clarity event and context tags', () => {
      initClarity();

      const tracked = trackClarityEvent('book_detail_viewed');
      expect(tracked).toBe(true);
      expect(Clarity.event).toHaveBeenCalledWith('book_detail_viewed');

      const tagged = setClarityTag('reading_speed', 'normal');
      expect(tagged).toBe(true);
      expect(Clarity.setTag).toHaveBeenCalledWith('reading_speed', 'normal');
    });

    it('disableClarity sets consent to false and consentV2 to denied', () => {
      initClarity();
      expect(isClarityInitialized()).toBe(true);

      disableClarity();
      expect(isClarityInitialized()).toBe(false);
      expect(Clarity.consent).toHaveBeenCalledWith(false);
      expect(Clarity.consentV2).toHaveBeenCalledWith({
        analytics_Storage: 'denied',
        ad_Storage: 'denied',
      });
    });

    it('isolates Clarity runtime errors gracefully without throwing', () => {
      initClarity();
      vi.mocked(Clarity.event).mockImplementationOnce(() => {
        throw new Error('Clarity script blocked by AdBlocker');
      });

      expect(() => {
        const tracked = trackClarityEvent('crash_test');
        expect(tracked).toBe(false);
      }).not.toThrow();
    });
  });

  describe('Faro Adapter (Grafana Faro Web SDK)', () => {
    beforeEach(() => {
      saveAnalyticsConsent('granted');
    });

    it('initializes Faro with sa-east-1 endpoint and native instrumentations', () => {
      const instance = initFaro();
      expect(instance).not.toBeNull();
      expect(isFaroInitialized()).toBe(true);

      expect(faroSdk.initializeFaro).toHaveBeenCalledWith(
        expect.objectContaining({
          url: FARO_DEFAULT_ENDPOINT,
          app: expect.objectContaining({
            name: 'diyspur',
            version: '0.1.0',
          }),
          instrumentations: expect.arrayContaining([
            expect.any(faroSdk.ErrorsInstrumentation),
            expect.any(faroSdk.ConsoleInstrumentation),
            expect.any(faroSdk.WebVitalsInstrumentation),
          ]),
        })
      );
    });

    it('pushes structured logs with sanitized payload to Faro', () => {
      initFaro();

      const success = pushFaroLog('Reader opened season', {
        user_email: 'maria@diyspur.com',
        auth_token: 'secret-auth-key',
        season_id: 'season-42',
      });

      expect(success).toBe(true);
      expect(mockFaroApi.pushLog).toHaveBeenCalledWith(
        ['Reader opened season'],
        expect.objectContaining({
          context: expect.objectContaining({
            user_email: 'm***@***.com',
            auth_token: '[REDACTED]',
            season_id: 'season-42',
          }),
        })
      );
    });

    it('pushes custom events and errors to Faro', () => {
      initFaro();

      const eventSuccess = pushFaroEvent('chapter_read', { chapter: '3' });
      expect(eventSuccess).toBe(true);
      expect(mockFaroApi.pushEvent).toHaveBeenCalledWith(
        'chapter_read',
        expect.objectContaining({ chapter: '3' })
      );

      const err = new Error('Hydration error with token=abc12345');
      const errorSuccess = pushFaroError(err, { component: 'BookCard' });
      expect(errorSuccess).toBe(true);
      expect(mockFaroApi.pushError).toHaveBeenCalledWith(
        err,
        expect.objectContaining({
          context: expect.objectContaining({ component: 'BookCard' }),
        })
      );
    });

    it('isolates Faro errors and returns false on failure without throwing', () => {
      initFaro();
      mockFaroApi.pushLog.mockImplementationOnce(() => {
        throw new Error('Faro collector timeout');
      });

      expect(() => {
        const logged = pushFaroLog('Should fail safely');
        expect(logged).toBe(false);
      }).not.toThrow();
    });
  });

  describe('PostHog Client Configuration & Consent Integration', () => {
    it('initializes PostHog with opt_out_capturing_by_default: true and calls opt_in_capturing when consent is granted', () => {
      saveAnalyticsConsent('granted');

      const initialized = initializePostHog();
      expect(initialized).toBe(true);
      expect(isPostHogInitialized()).toBe(true);

      expect(posthog.init).toHaveBeenCalledWith(
        'phc_test_key_123',
        expect.objectContaining({
          api_host: 'https://us.i.posthog.com',
          autocapture: false,
          respect_dnt: true,
          opt_out_capturing_by_default: true,
        })
      );
      expect(posthog.opt_in_capturing).toHaveBeenCalled();
    });

    it('disablePostHog invokes posthog.opt_out_capturing', () => {
      saveAnalyticsConsent('granted');
      initializePostHog();

      disablePostHog();
      expect(posthog.opt_out_capturing).toHaveBeenCalled();
    });
  });

  describe('Unified Product Events Dispatcher (trackProductEvent)', () => {
    beforeEach(() => {
      saveAnalyticsConsent('granted');
      initGa4();
      initClarity();
      initFaro();
      initializePostHog();
    });

    it('fans out product events to PostHog, GA4, Clarity, and Faro simultaneously', () => {
      trackProductEvent('cta_clicked', {
        cta_id: 'participate_reading',
        page_type: 'book_detail',
        secret_promo_code: 'FREE100',
      });

      // 1. PostHog
      expect(posthog.capture).toHaveBeenCalledWith(
        'cta_clicked',
        expect.objectContaining({
          cta_id: 'participate_reading',
          page_type: 'book_detail',
        })
      );

      // 2. GA4
      expect(window.gtag).toHaveBeenCalledWith(
        'event',
        'cta_clicked',
        expect.objectContaining({
          cta_id: 'participate_reading',
          page_type: 'book_detail',
          secret_promo_code: '[REDACTED]', // Sanitized
        })
      );

      // 3. Clarity
      expect(Clarity.event).toHaveBeenCalledWith('cta_clicked');

      // 4. Faro
      expect(mockFaroApi.pushEvent).toHaveBeenCalledWith(
        'cta_clicked',
        expect.objectContaining({
          cta_id: 'participate_reading',
        })
      );
    });

    it('ensures complete error isolation: failure in one adapter does not prevent others from running', () => {
      // Simulate Clarity throwing an exception
      vi.mocked(Clarity.event).mockImplementationOnce(() => {
        throw new Error('Clarity internal failure');
      });

      // Simulate GA4 throwing an exception
      // @ts-expect-error gtag mock
      window.gtag.mockImplementationOnce(() => {
        throw new Error('GTag connection failure');
      });

      expect(() => {
        trackProductEvent('page_viewed', { page_path: '/minha-estante', page_type: 'shelf' });
      }).not.toThrow();

      // PostHog should still receive the event
      expect(posthog.capture).toHaveBeenCalledWith('page_viewed', expect.anything());

      // Faro should still receive the event
      expect(mockFaroApi.pushEvent).toHaveBeenCalledWith('page_viewed', expect.anything());
    });

    it('stops transmission immediately when consent is revoked', () => {
      revokeAnalyticsConsent();

      vi.clearAllMocks();

      trackProductEvent('sign_up_completed', { auth_method: 'magic_link' });

      expect(posthog.capture).not.toHaveBeenCalled();
      expect(window.gtag).not.toHaveBeenCalled();
      expect(Clarity.event).not.toHaveBeenCalled();
      expect(mockFaroApi.pushEvent).not.toHaveBeenCalled();
    });
  });
});
