import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Sentry from '@sentry/nextjs';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import {
  withTelemetryAction,
  resetActionMetricsForTesting,
  getActionMetricsSnapshot,
} from '../../src/lib/observability/action-wrapper';
import * as loggerModule from '../../src/lib/observability/logger';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

describe('withTelemetryAction Wrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetActionMetricsForTesting();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Success Execution', () => {
    it('executes handler and returns the expected result preserving parameters', async () => {
      const logInfoSpy = vi.spyOn(loggerModule, 'logInfo');
      const handler = vi.fn(async (bookId: string, status: string) => {
        return { ok: true, message: `Status updated to ${status} for ${bookId}` };
      });

      const wrapped = withTelemetryAction('reading.updateStatus', handler);
      const result = await wrapped('book-123', 'reading');

      expect(handler).toHaveBeenCalledWith('book-123', 'reading');
      expect(result).toEqual({
        ok: true,
        message: 'Status updated to reading for book-123',
      });

      // Verifies logInfo was called for action_started and action_completed
      expect(logInfoSpy).toHaveBeenCalledWith(
        'action_started',
        expect.objectContaining({
          action: 'reading.updateStatus',
        })
      );

      expect(logInfoSpy).toHaveBeenCalledWith(
        'action_completed',
        expect.objectContaining({
          action: 'reading.updateStatus',
          ok: true,
          duration_ms: expect.any(Number),
        })
      );
    });

    it('creates an OpenTelemetry span with OK status and duration attributes', async () => {
      const mockSpan = {
        setAttribute: vi.fn(),
        setStatus: vi.fn(),
        recordException: vi.fn(),
        end: vi.fn(),
      };
      const mockTracer = {
        startSpan: vi.fn().mockReturnValue(mockSpan),
      };
      vi.spyOn(trace, 'getTracer').mockReturnValue(mockTracer as any);

      const wrapped = withTelemetryAction('chapters.markRead', async (chapterId: string) => {
        return { ok: true, chapterId };
      });

      const res = await wrapped('chap-456');

      expect(res).toEqual({ ok: true, chapterId: 'chap-456' });
      expect(mockTracer.startSpan).toHaveBeenCalledWith('server_action:chapters.markRead');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('action.name', 'chapters.markRead');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('action.ok', true);
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('action.duration_ms', expect.any(Number));
      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
      expect(mockSpan.end).toHaveBeenCalledTimes(1);
    });

    it('records Prometheus metrics for successful execution', async () => {
      const wrapped = withTelemetryAction('goals.saveGoal', async () => {
        return { ok: true, saved: true };
      });

      await wrapped();

      const snapshot = getActionMetricsSnapshot();
      expect(snapshot.executions['goals.saveGoal:success']).toBe(1);
      expect(snapshot.errors['goals.saveGoal:error'] || 0).toBe(0);
    });
  });

  describe('Logical Failure Handled by Action (ok: false)', () => {
    it('returns the failure result, logs action_completed with ok: false, and increments error metrics', async () => {
      const logInfoSpy = vi.spyOn(loggerModule, 'logInfo');
      const handler = vi.fn(async () => {
        return { ok: false, message: 'Capítulo não encontrado', code: 'not_found' };
      });

      const wrapped = withTelemetryAction('chapters.getComment', handler);
      const result = await wrapped();

      expect(result).toEqual({
        ok: false,
        message: 'Capítulo não encontrado',
        code: 'not_found',
      });

      expect(logInfoSpy).toHaveBeenCalledWith(
        'action_completed',
        expect.objectContaining({
          action: 'chapters.getComment',
          ok: false,
          code: 'not_found',
        })
      );

      const snapshot = getActionMetricsSnapshot();
      expect(snapshot.executions['chapters.getComment:error']).toBe(1);
      expect(snapshot.errors['chapters.getComment:error']).toBe(1);
    });
  });

  describe('Uncaught Exceptions, Error Masking & Sentry Capture', () => {
    it('catches raw database exception, captures in Sentry, logs error, and returns safe friendly response without leaking DB password', async () => {
      const logErrorSpy = vi.spyOn(loggerModule, 'logError');

      const rawDbError = new Error(
        'FATAL: password authentication failed for user "postgres_admin", connection string: postgresql://postgres_admin:superSecretP@ssword!@db.internal:5432/diyspur'
      );

      const handler = vi.fn(async () => {
        throw rawDbError;
      });

      const wrapped = withTelemetryAction('clubs.joinClub', handler);
      const result = await wrapped();

      // Non-blocking: returns safe object rather than rethrowing
      expect(result).toEqual({
        ok: false,
        message: 'Não foi possível concluir esta operação no momento. Tente novamente em instantes.',
        code: 'internal_error',
      });

      // Verifies Sentry capture
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
      expect(Sentry.captureException).toHaveBeenCalledWith(
        rawDbError,
        expect.objectContaining({
          tags: expect.objectContaining({
            action: 'clubs.joinClub',
          }),
        })
      );

      // Verifies structured error log
      expect(logErrorSpy).toHaveBeenCalledWith(
        'action_failed',
        expect.objectContaining({
          action: 'clubs.joinClub',
          error: rawDbError,
          duration_ms: expect.any(Number),
        })
      );

      // Verifies Prometheus metrics
      const snapshot = getActionMetricsSnapshot();
      expect(snapshot.executions['clubs.joinClub:exception']).toBe(1);
      expect(snapshot.errors['clubs.joinClub:exception']).toBe(1);
    });

    it('redacts sensitive credentials if handler returns a message containing connection strings or secrets', async () => {
      const handler = vi.fn(async () => {
        return {
          ok: false,
          message: 'Error: postgresql://admin:p@ss123@db.com/data query failed with syntax error',
        };
      });

      const wrapped = withTelemetryAction('meetings.createMeeting', handler);
      const result = (await wrapped()) as { ok: boolean; message: string };

      expect(result.ok).toBe(false);
      expect(result.message).not.toContain('p@ss123');
      expect(result.message).not.toContain('admin:p@ss123@db.com');
    });

    it('supports custom fallbackResponse function when exception is caught', async () => {
      const handler = vi.fn(async () => {
        throw new Error('Timeout connecting to microservice');
      });

      const wrapped = withTelemetryAction(
        'journal.saveEntry',
        handler,
        {
          fallbackResponse: (err) => ({
            ok: false,
            message: 'Erro específico do diário.',
            code: 'journal_error',
          }),
        }
      );

      const result = await wrapped();
      expect(result).toEqual({
        ok: false,
        message: 'Erro específico do diário.',
        code: 'journal_error',
      });
    });

    it('rethrows error when options.rethrow is true', async () => {
      const handler = vi.fn(async () => {
        throw new Error('Must propagate error');
      });

      const wrapped = withTelemetryAction('test.rethrow', handler, { rethrow: true });

      await expect(wrapped()).rejects.toThrow('Must propagate error');
    });
  });

  describe('Resource Extractor and Metadata Sanitization', () => {
    it('extracts metadata and sanitizes PII from resourceExtractor', async () => {
      const logInfoSpy = vi.spyOn(loggerModule, 'logInfo');

      const handler = vi.fn(async (params: { clubId: string; userToken: string }) => {
        return { ok: true, clubId: params.clubId };
      });

      const wrapped = withTelemetryAction('clubs.inviteUser', handler, {
        resourceExtractor: (params) => ({
          clubId: params.clubId,
          userToken: params.userToken,
        }),
      });

      await wrapped({ clubId: 'club-789', userToken: 'secret-auth-token-xyz' });

      expect(logInfoSpy).toHaveBeenCalledWith(
        'action_started',
        expect.objectContaining({
          action: 'clubs.inviteUser',
          clubId: 'club-789',
          userToken: '[REDACTED]',
        })
      );
    });
  });

  describe('Resilience and Fail-Safe Telemetry', () => {
    it('does not crash or affect the action result if OpenTelemetry or logger throws internally', async () => {
      vi.spyOn(loggerModule, 'logInfo').mockImplementationOnce(() => {
        throw new Error('Logger corrupted');
      });

      const handler = vi.fn(async () => ({ ok: true, data: 123 }));
      const wrapped = withTelemetryAction('resilience.test', handler);

      const result = await wrapped();
      expect(result).toEqual({ ok: true, data: 123 });
    });
  });
});
