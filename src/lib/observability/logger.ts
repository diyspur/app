import * as Sentry from '@sentry/nextjs';
import { sanitizePayload, sanitizeError, isSensitiveKey } from './redaction';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface StructuredLogPayload {
  level: LogLevel;
  event: string;
  service?: string;
  environment?: string;
  request_id?: string;
  trace_id?: string;
  route?: string;
  duration_ms?: number;
  status_code?: number;
  error_code?: string;
  [key: string]: unknown;
}

export interface LogContext {
  service?: string;
  environment?: string;
  request_id?: string;
  trace_id?: string;
  route?: string;
  duration_ms?: number;
  status_code?: number;
  error_code?: string;
  error?: unknown;
  [key: string]: unknown;
}

const ALLOWED_LOG_KEYS: (keyof StructuredLogPayload)[] = [
  'level',
  'event',
  'service',
  'environment',
  'request_id',
  'trace_id',
  'route',
  'duration_ms',
  'status_code',
  'error_code',
];

/**
 * Envia erro com proteção para o Sentry se configurado.
 * Isolamento total de falhas com try/catch.
 */
function fanOutToSentry(event: string, context?: LogContext): void {
  try {
    if (!Sentry) return;

    const extra: Record<string, unknown> = {
      event,
    };

    if (context) {
      for (const [k, v] of Object.entries(context)) {
        if (k !== 'error') {
          extra[k] = isSensitiveKey(k) ? '[REDACTED]' : sanitizePayload(v);
        }
      }
    }

    const tags: Record<string, string> = {};
    if (context?.route) tags.route = String(context.route).slice(0, 50);
    if (context?.error_code) tags.error_code = String(context.error_code);
    if (context?.request_id) tags.request_id = String(context.request_id);

    if (context?.error) {
      if (typeof Sentry.captureException === 'function') {
        Sentry.captureException(context.error, {
          extra,
          tags: Object.keys(tags).length > 0 ? tags : undefined,
        });
      }
    } else {
      if (typeof Sentry.captureMessage === 'function') {
        Sentry.captureMessage(event, {
          level: 'error',
          extra,
          tags: Object.keys(tags).length > 0 ? tags : undefined,
        });
      }
    }
  } catch {
    // Fail-safe absoluto: fanout para o Sentry nunca deve quebrar a aplicação
  }
}

/**
 * Envia evento de erro para o Grafana Faro no frontend, se disponível no ambiente do navegador.
 */
function fanOutToFaro(event: string, context?: LogContext): void {
  try {
    if (typeof window === 'undefined') return;
    const faro = (window as unknown as {
      faro?: {
        api?: {
          pushLog?: (args: unknown[], options?: { level?: string; context?: Record<string, unknown> }) => void;
          pushError?: (err: Error, options?: { context?: Record<string, unknown> }) => void;
        };
      };
    }).faro;

    if (!faro?.api) return;

    if (context?.error && typeof faro.api.pushError === 'function') {
      const err = context.error instanceof Error ? context.error : new Error(String(context.error));
      faro.api.pushError(err, {
        context: { event, route: context.route ? String(context.route) : undefined },
      });
    } else if (typeof faro.api.pushLog === 'function') {
      faro.api.pushLog([event], {
        level: 'error',
        context: { route: context?.route ? String(context.route) : undefined },
      });
    }
  } catch {
    // Fail-safe absoluto
  }
}

/**
 * Emite uma linha de log JSON estruturada e enriquecida no console.
 */
function emitLog(level: LogLevel, event: string, context?: LogContext): void {
  try {
    const service = context?.service ?? process.env.OTEL_SERVICE_NAME ?? 'diyspur-web';
    const environment = context?.environment ?? process.env.NODE_ENV ?? 'development';

    const logRecord: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      event: sanitizePayload(event),
      service: sanitizePayload(service),
      environment: sanitizePayload(environment),
    };

    if (context) {
      if (context.request_id !== undefined) logRecord.request_id = sanitizePayload(context.request_id);
      if (context.trace_id !== undefined) logRecord.trace_id = sanitizePayload(context.trace_id);
      if (context.route !== undefined) logRecord.route = sanitizePayload(context.route);
      if (context.duration_ms !== undefined && Number.isFinite(context.duration_ms)) {
        logRecord.duration_ms = context.duration_ms;
      }
      if (context.status_code !== undefined && Number.isFinite(context.status_code)) {
        logRecord.status_code = context.status_code;
      }
      if (context.error_code !== undefined) logRecord.error_code = sanitizePayload(context.error_code);
      if (context.error !== undefined) logRecord.error = sanitizeError(context.error);

      // Copia atributos adicionais do contexto com sanitização e redaction de PII
      for (const [key, value] of Object.entries(context)) {
        if (
          key === 'service' ||
          key === 'environment' ||
          key === 'request_id' ||
          key === 'trace_id' ||
          key === 'route' ||
          key === 'duration_ms' ||
          key === 'status_code' ||
          key === 'error_code' ||
          key === 'error'
        ) {
          continue;
        }
        if (isSensitiveKey(key)) {
          logRecord[key] = '[REDACTED]';
        } else {
          logRecord[key] = sanitizePayload(value);
        }
      }
    }

    const jsonLine = JSON.stringify(logRecord);

    if (level === 'error') {
      console.error(jsonLine);
    } else if (level === 'warn') {
      console.warn(jsonLine);
    } else if (level === 'debug') {
      (console.debug ?? console.log)(jsonLine);
    } else {
      console.info(jsonLine);
    }
  } catch {
    // Fail-safe absoluto: o logger nunca quebra a execução da requisição
    try {
      console.error(JSON.stringify({ level: 'error', event: 'logger_internal_error' }));
    } catch {
      // noop
    }
  }
}

/**
 * Log estruturado de debug.
 */
export function logDebug(event: string, context?: LogContext): void {
  emitLog('debug', event, context);
}

/**
 * Log estruturado informativo.
 */
export function logInfo(event: string, context?: LogContext): void {
  emitLog('info', event, context);
}

/**
 * Log estruturado de alerta / warning.
 */
export function logWarn(event: string, context?: LogContext): void {
  emitLog('warn', event, context);
}

/**
 * Log estruturado de erro com fan-out seguro para Sentry e Grafana Faro.
 */
export function logError(event: string, context?: LogContext): void {
  emitLog('error', event, context);
  fanOutToSentry(event, context);
  fanOutToFaro(event, context);
}

/**
 * Mantido para compatibilidade retroativa com código existente.
 */
export function logStructured(payload: StructuredLogPayload): void {
  const sanitized: Partial<StructuredLogPayload> = {
    service: payload.service ?? 'diyspur-web',
    environment: payload.environment ?? process.env.NODE_ENV ?? 'development',
  };

  for (const key of ALLOWED_LOG_KEYS) {
    const val = payload[key];
    if (val !== undefined && val !== null) {
      if (typeof val === 'string') {
        const sanitizedVal = sanitizePayload(val);
        sanitized[key] = (typeof sanitizedVal === 'string' ? sanitizedVal.slice(0, 200) : sanitizedVal) as never;
      } else if (typeof val === 'number' && Number.isFinite(val)) {
        sanitized[key] = val as never;
      }
    }
  }

  const jsonLine = JSON.stringify(sanitized);

  if (payload.level === 'error') {
    console.error(jsonLine);
  } else if (payload.level === 'warn') {
    console.warn(jsonLine);
  } else {
    console.info(jsonLine);
  }
}
