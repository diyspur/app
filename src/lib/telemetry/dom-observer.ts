import { hasAnalyticsConsent } from '../analytics/consent';
import { trackProductEvent } from './product-events';
import { redactPiiText } from '../observability/redaction';

const SENSITIVE_QUERY_KEYS = [
  'token',
  'access_token',
  'refresh_token',
  'auth',
  'key',
  'apikey',
  'secret',
  'password',
  'senha',
  'code',
  'credential',
  'signature',
  'session',
  'email',
  'user',
  'cpf',
  'card',
  'cartao',
];

const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  'input[type="submit"]',
  'input[type="button"]',
  '[role="button"]',
  '[data-telemetry-event]',
  '[data-telemetry-id]',
].join(', ');

/**
 * Sanitiza URLs removendo parâmetros de busca com tokens, credenciais ou segredos.
 */
export function sanitizeHref(href: string): string {
  if (!href || typeof href !== 'string') return '';
  const trimmed = href.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('#')) {
    return trimmed.slice(0, 100);
  }

  try {
    const isAbsolute = trimmed.startsWith('http://') || trimmed.startsWith('https://');
    const dummyBase = 'https://diyspur.internal';
    const parsed = new URL(trimmed, dummyBase);

    // Remove query parameters com nomes ou conteúdos sensíveis
    const paramsToDelete: string[] = [];
    for (const key of Array.from(parsed.searchParams.keys())) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_QUERY_KEYS.some((s) => lowerKey.includes(s))) {
        paramsToDelete.push(key);
      }
    }
    for (const key of paramsToDelete) {
      parsed.searchParams.delete(key);
    }

    let cleanUrl: string;
    if (isAbsolute) {
      cleanUrl = parsed.toString();
    } else {
      const search = parsed.search ? parsed.search : '';
      const hash = parsed.hash ? parsed.hash : '';
      cleanUrl = parsed.pathname + search + hash;
    }

    return redactPiiText(cleanUrl).slice(0, 200);
  } catch {
    return redactPiiText(trimmed).slice(0, 200);
  }
}

/**
 * Extrai o elemento interativo mais próximo a partir do alvo do clique.
 */
export function extractInteractiveElement(target: EventTarget | null): HTMLElement | null {
  if (!target || typeof (target as HTMLElement).closest !== 'function') {
    return null;
  }
  return (target as HTMLElement).closest(INTERACTIVE_SELECTOR) as HTMLElement | null;
}

/**
 * Extrai texto representativo do elemento para telemetria.
 * Avalia aria-label caso o textContent seja vazio ou contenha apenas espaços em branco.
 */
export function extractElementText(element: HTMLElement): string {
  const custom = element.getAttribute('data-telemetry-text');
  if (custom && custom.trim()) {
    return custom.trim();
  }

  const textContent = (element.textContent || '').trim();
  const ariaLabel = (element.getAttribute('aria-label') || '').trim();
  const value = (element.getAttribute('value') || '').trim();

  return textContent || ariaLabel || value || '';
}

/**
 * Configura o observador global declarativo de cliques no DOM.
 * Rastreia botões, links semânticos e elementos anotados com data-telemetry-event
 * sem necessidade de instrumentar individualmente cada componente.
 *
 * Garantias:
 * - Fail-Closed: nenhum dado é processado ou enviado se hasAnalyticsConsent() for falso.
 * - Sanitização e Redação: PII mascarada e strings truncadas em 100 caracteres.
 * - URLs seguras: query strings contendo tokens e segredos são estritamente removidas.
 * - Isolamento total: exceções inesperadas são capturadas e nunca vazam para a UI.
 */
export function setupDomClickObserver(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  const handleClick = (event: Event) => {
    try {
      // 1. Fail-Closed Privacy Check
      if (!hasAnalyticsConsent()) {
        return;
      }

      const element = extractInteractiveElement(event.target);
      if (!element) {
        return;
      }

      // 2. Respeita marcação de exclusão explícita
      if (
        element.hasAttribute('data-telemetry-ignore') ||
        (typeof element.closest === 'function' && element.closest('[data-telemetry-ignore]'))
      ) {
        return;
      }

      // 3. Extração e sanitização do cta_id
      const rawCtaId =
        element.getAttribute('data-telemetry-id') ||
        element.getAttribute('data-cta-id') ||
        element.id ||
        element.getAttribute('name') ||
        '';
      const ctaId = rawCtaId ? redactPiiText(rawCtaId).trim().slice(0, 100) : '';

      // 4. Extração, redação de PII e truncamento do text_content (máx 100 caracteres)
      const rawText = extractElementText(element);
      const normalizedText = rawText.replace(/\s+/g, ' ').trim();
      const textContent = normalizedText ? redactPiiText(normalizedText).slice(0, 100) : '';

      // 5. Determina nome do evento (cta_clicked por padrão, ou nome customizado em data-telemetry-event)
      const customEvent = element.getAttribute('data-telemetry-event');
      const eventName = customEvent && customEvent !== 'true' ? customEvent : 'cta_clicked';

      // 6. Montagem dos metadados de telemetria
      const properties: Record<string, unknown> = {};

      if (ctaId) {
        properties.cta_id = ctaId;
      }
      if (textContent) {
        properties.text_content = textContent;
      }

      if (typeof window !== 'undefined' && window.location?.pathname) {
        properties.page_path = window.location.pathname;
      }

      const placement =
        element.getAttribute('data-telemetry-placement') ||
        element.getAttribute('data-placement');
      if (placement) {
        properties.placement = placement;
      }

      properties.element_tag = element.tagName;

      const explicitRole = element.getAttribute('role');
      if (explicitRole) {
        properties.element_role = explicitRole;
      } else if (element.tagName === 'A') {
        properties.element_role = 'link';
      } else if (
        element.tagName === 'BUTTON' ||
        (element.tagName === 'INPUT' &&
          (element.getAttribute('type') === 'submit' ||
            element.getAttribute('type') === 'button'))
      ) {
        properties.element_role = 'button';
      }

      // Se for link ou tiver href
      const rawHref = element.getAttribute('href');
      if (rawHref) {
        properties.href = sanitizeHref(rawHref);
      }

      const targetAttr = element.getAttribute('target');
      if (targetAttr) {
        properties.target = targetAttr;
      }

      // Propriedades declarativas extras: data-telemetry-prop-*
      if (element.attributes) {
        for (const attr of Array.from(element.attributes)) {
          const name = (attr as { name?: string })?.name ?? (Array.isArray(attr) ? (attr[0] as string) : undefined);
          const value = (attr as { value?: string })?.value ?? (Array.isArray(attr) ? (attr[1] as string) : undefined);
          if (typeof name === 'string' && name.startsWith('data-telemetry-prop-') && typeof value === 'string') {
            const propKey = name
              .replace('data-telemetry-prop-', '')
              .replace(/-/g, '_');
            properties[propKey] = redactPiiText(value).slice(0, 100);
          }
        }
      }

      // 7. Despacho unificado para todos os adaptadores via trackProductEvent
      trackProductEvent(eventName, properties);
    } catch {
      // Isolamento estrito de erros: falhas de observabilidade nunca quebram cliques na UI
    }
  };

  document.addEventListener('click', handleClick, true);

  return () => {
    try {
      document.removeEventListener('click', handleClick, true);
    } catch {
      // Fail-safe cleanup
    }
  };
}
