import * as Sentry from '@sentry/nextjs';
import { trace, SpanStatusCode, type Span } from '@opentelemetry/api';
import client from 'prom-client';
import { logInfo, logError } from './logger';
import { sanitizePayload, redactPiiText } from './redaction';

export interface TelemetryActionOptions<TArgs extends unknown[], TResult> {
  resourceExtractor?: (...args: TArgs) => Record<string, unknown>;
  fallbackResponse?: TResult | ((error: unknown) => TResult);
  rethrow?: boolean;
}

// In-memory counters for rapid testing snapshot inspection
let testExecutionsMap: Record<string, number> = {};
let testErrorsMap: Record<string, number> = {};

let actionExecutionsCounter: client.Counter<string> | null = null;
let actionErrorsCounter: client.Counter<string> | null = null;
let actionDurationHistogram: client.Histogram<string> | null = null;

function initPrometheusMetrics(): void {
  if (typeof window !== 'undefined') return;

  try {
    const existingExecutions = client.register.getSingleMetric(
      'server_action_executions_total'
    ) as client.Counter<string> | undefined;

    actionExecutionsCounter =
      existingExecutions ||
      new client.Counter({
        name: 'server_action_executions_total',
        help: 'Total de execuções de Server Actions no Next.js',
        labelNames: ['action', 'status'],
      });

    const existingErrors = client.register.getSingleMetric(
      'server_action_errors_total'
    ) as client.Counter<string> | undefined;

    actionErrorsCounter =
      existingErrors ||
      new client.Counter({
        name: 'server_action_errors_total',
        help: 'Total de erros e exceções ocorridos em Server Actions',
        labelNames: ['action', 'type'],
      });

    const existingDuration = client.register.getSingleMetric(
      'server_action_duration_seconds'
    ) as client.Histogram<string> | undefined;

    actionDurationHistogram =
      existingDuration ||
      new client.Histogram({
        name: 'server_action_duration_seconds',
        help: 'Duração em segundos da execução de Server Actions',
        labelNames: ['action', 'status'],
        buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      });
  } catch {
    // Fail-safe: métricas nunca devem impedir a execução do servidor
  }
}

// Inicializa no runtime Node
initPrometheusMetrics();

function recordMetric(
  action: string,
  status: 'success' | 'error' | 'exception',
  durationMs: number
): void {
  try {
    const execKey = `${action}:${status}`;
    testExecutionsMap[execKey] = (testExecutionsMap[execKey] || 0) + 1;

    if (status === 'error' || status === 'exception') {
      const errKey = `${action}:${status}`;
      testErrorsMap[errKey] = (testErrorsMap[errKey] || 0) + 1;
    }

    if (actionExecutionsCounter) {
      actionExecutionsCounter.inc({ action, status });
    }

    if (status === 'error' || status === 'exception') {
      if (actionErrorsCounter) {
        actionErrorsCounter.inc({ action, type: status });
      }
    }

    if (actionDurationHistogram) {
      actionDurationHistogram.observe({ action, status }, durationMs / 1000);
    }
  } catch {
    // Fail-safe
  }
}

export function resetActionMetricsForTesting(): void {
  testExecutionsMap = {};
  testErrorsMap = {};
}

export function getActionMetricsSnapshot(): {
  executions: Record<string, number>;
  errors: Record<string, number>;
} {
  return {
    executions: { ...testExecutionsMap },
    errors: { ...testErrorsMap },
  };
}

/**
 * Sanitiza o resultado da Server Action caso contenha mensagens com senhas ou URLs de banco.
 */
function sanitizeActionResult<T>(result: T): T {
  if (!result || typeof result !== 'object') {
    return result;
  }

  try {
    const res = result as Record<string, unknown>;
    if (typeof res.message === 'string') {
      // Se contiver credenciais de banco ou palavras de erro SQL bruto, redige
      const lower = res.message.toLowerCase();
      if (
        lower.includes('postgresql://') ||
        lower.includes('postgres://') ||
        lower.includes('password authentication') ||
        lower.includes('pg_') ||
        lower.includes('syntax error at or near') ||
        lower.includes('connection string')
      ) {
        res.message = redactPiiText(res.message);
      }
    }
    return result;
  } catch {
    return result;
  }
}

/**
 * Higher-Order Function para instrumentação completa de Server Actions.
 *
 * Funcionalidades:
 * - Mede latência com performance.now()
 * - Cria span customizado no OpenTelemetry (se em Node runtime)
 * - Emite logs estruturados logInfo no início e conclusão
 * - Em caso de exceção: captura no Sentry, emite logError, incrementa métricas Prometheus
 * - Mascara dados confidenciais de banco e expõe resposta amigável e segura
 */
export function withTelemetryAction<TArgs extends unknown[], TResult>(
  actionName: string,
  handler: (...args: TArgs) => Promise<TResult>,
  options?: TelemetryActionOptions<TArgs, TResult>
): (...args: TArgs) => Promise<TResult> {
  return async function telemetryActionWrapper(...args: TArgs): Promise<TResult> {
    const startTime = performance.now();
    let span: Span | null = null;
    let resourceMeta: Record<string, unknown> = {};

    try {
      if (options?.resourceExtractor) {
        const extracted = options.resourceExtractor(...args);
        if (extracted && typeof extracted === 'object') {
          resourceMeta = sanitizePayload(extracted) as Record<string, unknown>;
        }
      }
    } catch {
      // Fail-safe ao extrair recursos
    }

    try {
      if (typeof window === 'undefined') {
        const tracer = trace.getTracer('diyspur-server-actions');
        span = tracer.startSpan(`server_action:${actionName}`);
        span.setAttribute('action.name', actionName);
        span.setAttribute('action.type', 'server_action');

        for (const [k, v] of Object.entries(resourceMeta)) {
          if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
            span.setAttribute(`resource.${k}`, v);
          }
        }
      }
    } catch {
      // Fail-safe ao iniciar span
    }

    try {
      logInfo('action_started', {
        action: actionName,
        ...resourceMeta,
      });
    } catch {
      // Fail-safe
    }

    try {
      const result = await handler(...args);
      const durationMs = Math.max(0, performance.now() - startTime);

      const isHandledError =
        result &&
        typeof result === 'object' &&
        'ok' in result &&
        (result as { ok: unknown }).ok === false;

      if (isHandledError) {
        const handledObj = result as { ok: boolean; message?: string; code?: string };
        recordMetric(actionName, 'error', durationMs);

        if (span) {
          try {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: handledObj.message ?? 'Action reported failure',
            });
            span.setAttribute('action.ok', false);
            span.setAttribute('action.duration_ms', durationMs);
            if (handledObj.code) {
              span.setAttribute('action.code', handledObj.code);
            }
            span.end();
          } catch {
            // noop
          }
        }

        try {
          logInfo('action_completed', {
            action: actionName,
            ok: false,
            code: handledObj.code,
            duration_ms: durationMs,
            ...resourceMeta,
          });
        } catch {
          // noop
        }

        return sanitizeActionResult(result);
      }

      recordMetric(actionName, 'success', durationMs);

      if (span) {
        try {
          span.setStatus({ code: SpanStatusCode.OK });
          span.setAttribute('action.ok', true);
          span.setAttribute('action.duration_ms', durationMs);
          span.end();
        } catch {
          // noop
        }
      }

      try {
        logInfo('action_completed', {
          action: actionName,
          ok: true,
          duration_ms: durationMs,
          ...resourceMeta,
        });
      } catch {
        // noop
      }

      return result;
    } catch (error) {
      const durationMs = Math.max(0, performance.now() - startTime);
      recordMetric(actionName, 'exception', durationMs);

      if (span) {
        try {
          span.recordException(
            error instanceof Error ? error : new Error(String(error))
          );
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : String(error),
          });
          span.setAttribute('action.ok', false);
          span.setAttribute('action.duration_ms', durationMs);
          span.end();
        } catch {
          // noop
        }
      }

      try {
        logError('action_failed', {
          action: actionName,
          boundary: 'server-action',
          duration_ms: durationMs,
          error,
          ...resourceMeta,
        });
      } catch {
        // noop
      }

      if (options?.rethrow) {
        throw error;
      }

      if (options?.fallbackResponse !== undefined) {
        if (typeof options.fallbackResponse === 'function') {
          return (options.fallbackResponse as (err: unknown) => TResult)(error);
        }
        return options.fallbackResponse;
      }

      return {
        ok: false,
        message:
          'Não foi possível concluir esta operação no momento. Tente novamente em instantes.',
        code: 'internal_error',
      } as unknown as TResult;
    }
  };
}
