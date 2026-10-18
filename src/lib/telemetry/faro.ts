import {
  initializeFaro,
  faro,
  ErrorsInstrumentation,
  ConsoleInstrumentation,
  WebVitalsInstrumentation,
  type Faro,
  LogLevel,
} from '@grafana/faro-web-sdk';
import { hasAnalyticsConsent } from '../analytics/consent';
import { sanitizePayload } from '../observability/redaction';

export const FARO_DEFAULT_ENDPOINT =
  'https://faro-api-prod-sa-east-1.grafana.net/faro/api/v1';
export const FARO_APP_NAME = 'diyspur';
export const FARO_APP_VERSION = '0.1.0';
export const FARO_DEFAULT_APP_ID = '1656';
export const FARO_DEFAULT_STACK_ID = '1880886';

let faroInstance: Faro | null = null;

function sanitizeToStringRecord(
  input?: Record<string, unknown>
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!input) return result;

  const sanitized = sanitizePayload(input) as Record<string, unknown>;
  for (const [key, value] of Object.entries(sanitized)) {
    if (value !== undefined && value !== null) {
      result[key] =
        typeof value === 'object'
          ? JSON.stringify(value).slice(0, 250)
          : String(value).slice(0, 250);
    }
  }
  return result;
}

/**
 * Inicializa o Grafana Faro Web SDK com a stack Grafana Cloud (sa-east-1).
 * Fail-Closed: Não inicializa se o usuário não tiver concedido consentimento.
 */
export function initFaro(configOverrides?: Record<string, unknown>): Faro | null {
  if (typeof window === 'undefined') return null;

  try {
    if (!hasAnalyticsConsent()) {
      return null;
    }

    if (faroInstance) {
      return faroInstance;
    }

    const endpoint =
      process.env.NEXT_PUBLIC_FARO_ENDPOINT || FARO_DEFAULT_ENDPOINT;
    const appId =
      process.env.NEXT_PUBLIC_FARO_APP_ID || FARO_DEFAULT_APP_ID;
    const stackId =
      process.env.NEXT_PUBLIC_FARO_STACK_ID || FARO_DEFAULT_STACK_ID;

    faroInstance = initializeFaro({
      url: endpoint,
      app: {
        name: FARO_APP_NAME,
        version: FARO_APP_VERSION,
        environment: process.env.NODE_ENV || 'development',
      },
      instrumentations: [
        new ErrorsInstrumentation(),
        new ConsoleInstrumentation(),
        new WebVitalsInstrumentation(),
      ],
      metas: [
        () => ({
          session: {
            attributes: {
              appId,
              stackId,
            },
          },
        }),
      ],
      ...configOverrides,
    });

    return faroInstance;
  } catch {
    faroInstance = null;
    return null;
  }
}

/**
 * Envia um log estruturado ao Grafana Faro (Loki) com sanitização de PII.
 */
export function pushFaroLog(
  message: string,
  context?: Record<string, unknown>,
  level: 'info' | 'warn' | 'error' | 'debug' = 'info'
): boolean {
  if (typeof window === 'undefined' || !hasAnalyticsConsent()) {
    return false;
  }

  try {
    if (!faroInstance) {
      initFaro();
    }

    const api = faroInstance?.api ?? faro?.api;
    if (!api || typeof api.pushLog !== 'function') {
      return false;
    }

    const stringContext = sanitizeToStringRecord(context);

    const logLevelMap: Record<string, LogLevel> = {
      info: LogLevel.INFO,
      warn: LogLevel.WARN,
      error: LogLevel.ERROR,
      debug: LogLevel.DEBUG,
    };

    api.pushLog([message], {
      level: logLevelMap[level] ?? LogLevel.INFO,
      context: stringContext,
    });

    return true;
  } catch {
    // Isolamento de erros
    return false;
  }
}

/**
 * Envia um evento de produto ou interação ao Grafana Faro.
 */
export function pushFaroEvent(
  name: string,
  attributes?: Record<string, unknown>
): boolean {
  if (typeof window === 'undefined' || !hasAnalyticsConsent()) {
    return false;
  }

  try {
    if (!faroInstance) {
      initFaro();
    }

    const api = faroInstance?.api ?? faro?.api;
    if (!api || typeof api.pushEvent !== 'function') {
      return false;
    }

    const stringAttrs = sanitizeToStringRecord(attributes);
    api.pushEvent(name, stringAttrs);
    return true;
  } catch {
    return false;
  }
}

/**
 * Envia um erro de frontend diretamente ao Grafana Faro.
 */
export function pushFaroError(
  error: unknown,
  context?: Record<string, unknown>
): boolean {
  if (typeof window === 'undefined' || !hasAnalyticsConsent()) {
    return false;
  }

  try {
    if (!faroInstance) {
      initFaro();
    }

    const api = faroInstance?.api ?? faro?.api;
    if (!api || typeof api.pushError !== 'function') {
      return false;
    }

    const err =
      error instanceof Error ? error : new Error(String(error));
    const stringContext = sanitizeToStringRecord(context);

    api.pushError(err, { context: stringContext });
    return true;
  } catch {
    return false;
  }
}

/**
 * Desativa o Grafana Faro no cliente quando o consentimento é revogado.
 */
export function disableFaro(): void {
  faroInstance = null;
}

export function isFaroInitialized(): boolean {
  return faroInstance !== null && hasAnalyticsConsent();
}

export function getFaroInstance(): Faro | null {
  return hasAnalyticsConsent() ? faroInstance : null;
}

export function resetFaroForTesting(): void {
  faroInstance = null;
}
