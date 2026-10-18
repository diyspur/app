import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Sentry from '@sentry/nextjs';
import {
  logStructured,
  logDebug,
  logInfo,
  logWarn,
  logError,
} from '../../src/lib/observability/logger';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

describe('Structured Observability Logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('logStructured (backward compatibility)', () => {
    it('formata logs em linha JSON com campos allowlisted', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      logStructured({
        level: 'error',
        event: 'catalog_query_failed',
        route: '/livros',
        error_code: 'db_timeout',
        request_id: 'req-12345',
      });

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const loggedRaw = errorSpy.mock.calls[0]?.[0];
      const parsed = JSON.parse(loggedRaw as string);

      expect(parsed.level).toBe('error');
      expect(parsed.event).toBe('catalog_query_failed');
      expect(parsed.route).toBe('/livros');
      expect(parsed.error_code).toBe('db_timeout');
      expect(parsed.request_id).toBe('req-12345');
      expect(parsed.service).toBe('diyspur-web');

      errorSpy.mockRestore();
    });

    it('redige e trunca strings longas', () => {
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      const longRoute = '/livros/' + 'x'.repeat(300);
      logStructured({
        level: 'info',
        event: 'page_render',
        route: longRoute,
      });

      expect(infoSpy).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(infoSpy.mock.calls[0]?.[0] as string);
      expect((parsed.route as string).length).toBe(200);

      infoSpy.mockRestore();
    });
  });

  describe('logInfo, logDebug, logWarn, logError', () => {
    it('logInfo emite log estruturado com metadados padrão e campos higienizados', () => {
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      logInfo('user_navigated', {
        route: '/livros/dom-casmurro',
        request_id: 'req-abc-999',
        trace_id: 'trace-111-222',
        duration_ms: 45.2,
        category: 'romance',
      });

      expect(infoSpy).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(infoSpy.mock.calls[0]?.[0] as string);

      expect(parsed.level).toBe('info');
      expect(parsed.event).toBe('user_navigated');
      expect(parsed.route).toBe('/livros/dom-casmurro');
      expect(parsed.request_id).toBe('req-abc-999');
      expect(parsed.trace_id).toBe('trace-111-222');
      expect(parsed.duration_ms).toBe(45.2);
      expect(parsed.service).toBe('diyspur-web');
      expect(parsed.category).toBe('romance');
      expect(parsed.timestamp).toBeDefined();

      infoSpy.mockRestore();
    });

    it('logDebug emite via console.debug com level debug', () => {
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      logDebug('cache_hit', { key: 'book:123', ttl: 300 });

      expect(debugSpy).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(debugSpy.mock.calls[0]?.[0] as string);
      expect(parsed.level).toBe('debug');
      expect(parsed.event).toBe('cache_hit');
      expect(parsed.key).toBe('book:123');

      debugSpy.mockRestore();
    });

    it('logWarn emite via console.warn com level warn', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      logWarn('rate_limit_approaching', { current_rate: 95, limit: 100 });

      expect(warnSpy).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(warnSpy.mock.calls[0]?.[0] as string);
      expect(parsed.level).toBe('warn');
      expect(parsed.event).toBe('rate_limit_approaching');

      warnSpy.mockRestore();
    });

    it('logError higieniza PII no contexto e aciona Sentry.captureException', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('Falha no checkout do cliente');

      logError('payment_processing_failed', {
        route: '/checkout',
        password: 'leaked-user-password',
        customerEmail: 'joao.silva@diyspur.com.br',
        creditCard: '4532 0151 1283 0366',
        error,
      });

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(errorSpy.mock.calls[0]?.[0] as string);

      expect(parsed.level).toBe('error');
      expect(parsed.event).toBe('payment_processing_failed');
      expect(parsed.password).toBe('[REDACTED]');
      expect(parsed.customerEmail).toMatch(/^j\*\*\*@\*\*\*\.com\.br$/);
      expect(parsed.creditCard).toBe('[REDACTED]');
      expect(parsed.error).toBeDefined();
      expect(parsed.error.message).toBe('Falha no checkout do cliente');

      // Verifica fan-out para Sentry
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
      expect(Sentry.captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          extra: expect.objectContaining({
            event: 'payment_processing_failed',
            password: '[REDACTED]',
            creditCard: '[REDACTED]',
          }),
        })
      );

      errorSpy.mockRestore();
    });

    it('logError aciona Sentry.captureMessage quando não há instância de erro', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      logError('unhandled_status_code', {
        route: '/api/livros',
        status_code: 502,
      });

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        'unhandled_status_code',
        expect.objectContaining({
          level: 'error',
          extra: expect.objectContaining({
            status_code: 502,
          }),
        })
      );

      errorSpy.mockRestore();
    });

    it('logError é fail-safe mesmo se o Sentry lançar exceção', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(Sentry.captureException).mockImplementationOnce(() => {
        throw new Error('Sentry network timeout');
      });

      expect(() => {
        logError('checkout_crash', { error: new Error('Original error') });
      }).not.toThrow();

      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });
});
