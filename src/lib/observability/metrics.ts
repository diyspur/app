import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from '@prometheus-io/client';

export interface DiyspurMetrics {
  registry: Registry;
  httpRequestsTotal: Counter<'method' | 'route' | 'status'>;
  httpRequestDuration: Histogram<'method' | 'route' | 'status'>;
  serverActionsTotal: Counter<'action' | 'status'>;
  activeUsersGauge: Gauge<string>;
}

declare global {
  var __diyspur_prometheus_registry__: Registry | undefined;
  var __diyspur_metrics__: DiyspurMetrics | undefined;
}

/**
 * Normaliza o caminho da rota para garantir cardinalidade limitada.
 * Remove query strings, hashes e substitui UUIDs e IDs numéricos por `:id`.
 */
export function normalizeRoute(rawRoute?: string | null): string {
  if (!rawRoute || typeof rawRoute !== 'string') return '/';
  let route = rawRoute.split('?')[0].split('#')[0].trim();
  if (!route.startsWith('/')) {
    route = `/${route}`;
  }

  // Normaliza slugs dinâmicos de domínio para limitar cardinalidade Prometheus
  route = route.replace(/\/livros\/[^/]+/g, '/livros/:slug');
  route = route.replace(/\/clubes\/[^/]+/g, '/clubes/:slug');
  route = route.replace(/\/listas\/[^/]+/g, '/listas/:slug');
  route = route.replace(/\/temporadas\/[^/]+/g, '/temporadas/:slug');

  // Substitui UUIDs por :id
  route = route.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    ':id'
  );
  // Substitui IDs numéricos por :id
  route = route.replace(/\/\d+(?=\/|$)/g, '/:id');

  if (route.length > 128) {
    route = route.slice(0, 128);
  }
  return route;
}

/**
 * Normaliza métodos HTTP para valores seguros e limitados.
 */
export function normalizeMethod(method?: string | null): string {
  if (!method || typeof method !== 'string') return 'UNKNOWN';
  const upper = method.toUpperCase().trim();
  const allowed = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  return allowed.includes(upper) ? upper : 'OTHER';
}

/**
 * Normaliza código de status HTTP.
 */
export function normalizeStatus(status?: number | string | null): string {
  if (status === undefined || status === null) return 'unknown';
  const str = String(status).trim();
  return /^[1-5][0-9]{2}$/.test(str) ? str : 'unknown';
}

/**
 * Inicializa e retorna o singleton do Registry do Prometheus e suas métricas.
 * Garante idempotência entre hot-reloads no ambiente de desenvolvimento do Next.js.
 */
export function initMetricsRegistry(): Registry {
  if (!globalThis.__diyspur_prometheus_registry__) {
    const reg = new Registry();

    // Registra métricas padrão de runtime (Node.js CPU, memória, event loop)
    if (!reg.getSingleMetric('diyspur_process_cpu_user_seconds_total')) {
      try {
        collectDefaultMetrics({
          prefix: 'diyspur_',
          register: reg,
        });
      } catch {
        // Fail-safe caso já tenha sido registrado
      }
    }

    const httpRequestsTotal =
      (reg.getSingleMetric('diyspur_http_requests_total') as Counter<'method' | 'route' | 'status'>) ||
      new Counter({
        name: 'diyspur_http_requests_total',
        help: 'Total de requisições HTTP processadas pelo servidor Next.js',
        labelNames: ['method', 'route', 'status'] as const,
        registers: [reg],
      });

    const httpRequestDuration =
      (reg.getSingleMetric('diyspur_http_request_duration_seconds') as Histogram<'method' | 'route' | 'status'>) ||
      new Histogram({
        name: 'diyspur_http_request_duration_seconds',
        help: 'Duração em segundos das requisições HTTP processadas pelo servidor',
        labelNames: ['method', 'route', 'status'] as const,
        buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
        registers: [reg],
      });

    const serverActionsTotal =
      (reg.getSingleMetric('diyspur_server_actions_total') as Counter<'action' | 'status'>) ||
      new Counter({
        name: 'diyspur_server_actions_total',
        help: 'Total de execuções de Server Actions no Next.js',
        labelNames: ['action', 'status'] as const,
        registers: [reg],
      });

    const activeUsersGauge =
      (reg.getSingleMetric('diyspur_active_users') as Gauge<string>) ||
      new Gauge({
        name: 'diyspur_active_users',
        help: 'Estimativa de usuários ou sessões ativas no sistema',
        registers: [reg],
      });

    globalThis.__diyspur_prometheus_registry__ = reg;
    globalThis.__diyspur_metrics__ = {
      registry: reg,
      httpRequestsTotal,
      httpRequestDuration,
      serverActionsTotal,
      activeUsersGauge,
    };
  }

  return globalThis.__diyspur_prometheus_registry__;
}

// Inicializa o singleton
initMetricsRegistry();

export const registry: Registry = globalThis.__diyspur_metrics__!.registry;
export const httpRequestsTotal: Counter<'method' | 'route' | 'status'> =
  globalThis.__diyspur_metrics__!.httpRequestsTotal;
export const httpRequestDuration: Histogram<'method' | 'route' | 'status'> =
  globalThis.__diyspur_metrics__!.httpRequestDuration;
export const serverActionsTotal: Counter<'action' | 'status'> =
  globalThis.__diyspur_metrics__!.serverActionsTotal;
export const activeUsersGauge: Gauge<string> =
  globalThis.__diyspur_metrics__!.activeUsersGauge;

/**
 * Registra a execução de uma requisição HTTP nas métricas de contador e histograma.
 */
export function recordHttpRequest(
  method: string,
  route: string,
  status: number | string,
  durationSeconds?: number
): void {
  try {
    const normalizedMethod = normalizeMethod(method);
    const normalizedRoute = normalizeRoute(route);
    const normalizedStatus = normalizeStatus(status);

    httpRequestsTotal.inc({
      method: normalizedMethod,
      route: normalizedRoute,
      status: normalizedStatus,
    });

    if (typeof durationSeconds === 'number' && durationSeconds >= 0) {
      httpRequestDuration.observe(
        {
          method: normalizedMethod,
          route: normalizedRoute,
          status: normalizedStatus,
        },
        durationSeconds
      );
    }
  } catch {
    // Métricas nunca devem interromper o fluxo da aplicação
  }
}

/**
 * Registra a conclusão de uma Server Action.
 */
export function recordServerAction(action: string, status: string): void {
  try {
    const cleanAction = String(action || 'unknown').slice(0, 100);
    const cleanStatus = String(status || 'unknown').slice(0, 50);
    serverActionsTotal.inc({ action: cleanAction, status: cleanStatus });
  } catch {
    // Fail-safe
  }
}

/**
 * Reseta os valores das métricas em ambiente de teste.
 */
export function resetMetricsForTesting(): void {
  try {
    httpRequestsTotal.reset();
    httpRequestDuration.reset();
    serverActionsTotal.reset();
    activeUsersGauge.reset();
  } catch {
    // Fail-safe
  }
}
