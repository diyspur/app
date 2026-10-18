/**
 * Motor de Sanitização, Redaction e LGPD da DIYSPUR.
 *
 * Responsável por garantir que nenhuma PII (e-mails, CPFs, senhas, tokens de autenticação,
 * dados de cartão, segredos de API ou query strings sensíveis) seja exposta em logs,
 * traces, payloads de telemetria ou relatórios de erro.
 *
 * Regras estritas:
 * - Fail-closed: nunca vazar dados não sanitizados em caso de exceção inesperada.
 * - Proteção de ciclos (referências circulares).
 * - Profundidade máxima de recursão (limite de pilha).
 * - Truncamento de strings em no máximo 250 caracteres.
 */

const MAX_STRING_LENGTH = 250;
const MAX_RECURSION_DEPTH = 12;

// Expressões regulares pré-compiladas para alta performance
const BEARER_REGEX = /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const JWT_REGEX = /\beyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\b/g;
// Suporta 16 dígitos padrão, Amex 4-6-5 dígitos e sequências contínuas de 13 a 19 dígitos
const CREDIT_CARD_REGEX = /\b(?:\d{4}[ -]){3}\d{4}\b|\b\d{4}[ -]\d{6}[ -]\d{5}\b|\b\d{13,19}\b/g;
const CPF_FORMATTED_REGEX = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;
const EMAIL_REGEX = /\b([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g;
// Captura qualquer parâmetro contendo palavras-chave sensíveis inclusive com prefixos (ex: api_key, access_token)
const QUERY_PARAM_SECRET_REGEX = /([?&][^=&#\s]*(?:token|auth|key|secret|password|senha|code|credential|signature|session|cartao)[^=&#\s]*=)[^&#\s]+/gi;
const URI_CREDENTIALS_REGEX = /(:\/\/[^/@\s]*:)([^@\s]+)(@)/gi;

/**
 * Avalia se o nome da chave de um objeto denota informação confidencial ou PII.
 * Suporta termos em inglês e português (LGPD) e ignora nomes benignos do domínio como "author".
 */
export function isSensitiveKey(key: string): boolean {
  if (!key || typeof key !== 'string') return false;

  const rawLower = key.toLowerCase().trim();
  const normalized = rawLower
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-_]/g, '');

  // 1. Termos sensíveis avaliados PRIMEIRO (inclusive antes de qualquer exceção de domínio)
  const isExplicitlySensitive =
    normalized.includes('password') ||
    normalized.includes('senha') ||
    normalized.includes('secret') ||
    normalized.includes('token') ||
    normalized.includes('apikey') ||
    normalized.includes('creditcard') ||
    normalized.includes('cardnumber') ||
    normalized.includes('cartao') ||
    normalized.includes('cvv') ||
    normalized.includes('cvc') ||
    normalized.includes('cpf') ||
    normalized.includes('cookie') ||
    normalized.includes('credential') ||
    normalized.includes('privatekey') ||
    normalized.includes('authorization') ||
    normalized.includes('authorize');

  if (isExplicitlySensitive) {
    return true;
  }

  // 2. Exceção de domínio estrita: apenas campos específicos e seguros de autor
  const isSafeAuthor =
    rawLower === 'author' ||
    rawLower === 'author_id' ||
    rawLower === 'author_name' ||
    rawLower === 'book_author' ||
    normalized === 'author' ||
    normalized === 'authorid' ||
    normalized === 'authorname' ||
    normalized === 'bookauthor';

  if (isSafeAuthor) {
    return false;
  }

  // 3. Avalia auth e variantes
  return normalized.includes('auth');
}

/**
 * Avalia se um parâmetro de query string contém segredos ou credenciais.
 */
function isSensitiveQueryParam(param: string): boolean {
  const norm = param
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-_]/g, '');

  return (
    norm.includes('token') ||
    norm.includes('secret') ||
    norm.includes('auth') ||
    norm.includes('password') ||
    norm.includes('senha') ||
    norm.includes('key') ||
    norm.includes('code') ||
    norm.includes('credential') ||
    norm.includes('signature') ||
    norm.includes('session') ||
    norm.includes('cartao')
  );
}

/**
 * Mascara e-mails preservando apenas o caractere inicial do usuário e a terminação do domínio.
 * Exemplo: usuario.leitor@diyspur.com.br -> u***@***.com.br
 */
function maskEmail(email: string): string {
  return email.replace(EMAIL_REGEX, (_match, local: string, domain: string) => {
    const firstChar = local[0] || 'u';
    const domainParts = domain.split('.');
    if (domainParts.length >= 2) {
      const suffix = domainParts.slice(1).join('.');
      return `${firstChar}***@***.${suffix}`;
    }
    return `${firstChar}***@***`;
  });
}

/**
 * Saneia URLs em strings, ofuscando valores de query strings sensíveis.
 */
function sanitizeUrlString(value: string): string {
  if (!value.includes('?')) return value;

  try {
    const isAbsolute = value.startsWith('http://') || value.startsWith('https://');
    const parsed = new URL(value, 'http://localhost');
    let modified = false;

    for (const key of Array.from(parsed.searchParams.keys())) {
      if (isSensitiveQueryParam(key)) {
        parsed.searchParams.set(key, '[REDACTED]');
        modified = true;
      }
    }

    if (modified) {
      if (isAbsolute) {
        return parsed.toString();
      }
      return parsed.pathname + parsed.search + parsed.hash;
    }
  } catch {
    // Se falhar o parse da URL, aplica regex de substituição nos query params
    return value.replace(QUERY_PARAM_SECRET_REGEX, '$1%5BREDACTED%5D');
  }

  return value;
}

/**
 * Aplica todas as regras e expressões de redação de PII e segredos ao texto sem truncamento de comprimento.
 * Utilizado de forma compartilhada para mensagens, stack traces e strings.
 */
export function redactPiiText(text: string): string {
  if (!text || typeof text !== 'string') return text;

  let result = text;

  // 1. Redação de JWTs
  result = result.replace(JWT_REGEX, '[REDACTED]');

  // 2. Redação de Bearer Tokens
  result = result.replace(BEARER_REGEX, 'Bearer [REDACTED]');

  // 3. Redação de Cartões de Crédito (inclusive Amex 4-6-5)
  result = result.replace(CREDIT_CARD_REGEX, '[REDACTED]');

  // 4. Redação de CPFs formatados
  result = result.replace(CPF_FORMATTED_REGEX, '[REDACTED]');

  // 5. Mascaramento de e-mails
  result = maskEmail(result);

  // 6. Redação de credenciais em URLs e Connection Strings (ex: postgres://user:pass@host)
  result = result.replace(URI_CREDENTIALS_REGEX, '$1[REDACTED]$3');

  // 7. Sanitização de Query Strings em URLs
  result = sanitizeUrlString(result);

  return result;
}

/**
 * Sanitiza o conteúdo de uma string, aplicando redaction de PII e truncamento seguro.
 */
function sanitizeString(str: string): string {
  let result = redactPiiText(str);

  // Truncamento seguro para no máximo 250 caracteres
  if (result.length > MAX_STRING_LENGTH) {
    result = result.slice(0, MAX_STRING_LENGTH);
  }

  return result;
}

/**
 * Função interna de sanitização recursiva com proteção de ciclos e profundidade máxima.
 */
function sanitizeInternal<T>(input: T, seen: WeakSet<object>, depth: number): T {
  if (depth > MAX_RECURSION_DEPTH) {
    return '[MAX_DEPTH_EXCEEDED]' as unknown as T;
  }

  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input === 'string') {
    return sanitizeString(input) as unknown as T;
  }

  if (typeof input === 'number' || typeof input === 'boolean') {
    return input;
  }

  if (typeof input === 'bigint') {
    return (input as bigint).toString() as unknown as T;
  }

  if (input instanceof Error) {
    return sanitizeError(input) as unknown as T;
  }

  if (input instanceof Date) {
    return new Date(input.getTime()) as unknown as T;
  }

  if (input instanceof RegExp) {
    return input;
  }

  if (typeof input === 'object') {
    if (seen.has(input)) {
      return '[CIRCULAR]' as unknown as T;
    }
    seen.add(input);

    if (Array.isArray(input)) {
      return input.map((item) => sanitizeInternal(item, seen, depth + 1)) as unknown as T;
    }

    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (isSensitiveKey(key)) {
        output[key] = '[REDACTED]';
      } else {
        output[key] = sanitizeInternal(value, seen, depth + 1);
      }
    }
    return output as T;
  }

  return input;
}

/**
 * Sanitiza recursivamente qualquer payload JSON, removendo PII, segredos e tokens sensíveis.
 * Garante que nenhuma string ultrapasse 250 caracteres e protege contra ciclos de memória.
 * Em caso de falha inesperada, adota estritamente uma política fail-closed.
 */
export function sanitizePayload<T>(input: T): T {
  try {
    const seen = new WeakSet<object>();
    return sanitizeInternal(input, seen, 0);
  } catch {
    // Fail-closed: se qualquer erro inesperado ocorrer na sanitização, NUNCA vazar dados brutos
    if (typeof input === 'string') {
      return '[UNSANITIZED_DATA]' as unknown as T;
    }
    if (Array.isArray(input)) {
      return ['[UNSANITIZED_DATA]'] as unknown as T;
    }
    if (typeof input === 'object' && input !== null) {
      return { unredacted: '[UNSANITIZED_DATA]' } as unknown as T;
    }
    return '[UNSANITIZED_DATA]' as unknown as T;
  }
}

/**
 * Redige headers sensíveis HTTP (Authorization, Cookie, Chaves de API, etc.)
 * Suporta tanto instâncias Web Standard `Headers` quanto objetos normais `Record<string, string>`.
 * Retorna sempre um objeto com chaves normalizadas em minúsculas e valores sensíveis como `[REDACTED]`.
 */
export function redactSensitiveHeaders(
  headers: Headers | Record<string, string> | null | undefined
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!headers) return result;

  try {
    if (typeof (headers as Headers).forEach === 'function') {
      (headers as Headers).forEach((value, key) => {
        const lowerKey = key.toLowerCase();
        if (isSensitiveKey(lowerKey)) {
          result[lowerKey] = '[REDACTED]';
        } else {
          result[lowerKey] = sanitizeString(value);
        }
      });
      return result;
    }

    if (typeof headers === 'object') {
      for (const [key, value] of Object.entries(headers)) {
        if (typeof key !== 'string') continue;
        const lowerKey = key.toLowerCase();
        if (isSensitiveKey(lowerKey)) {
          result[lowerKey] = '[REDACTED]';
        } else if (typeof value === 'string') {
          result[lowerKey] = sanitizeString(value);
        } else {
          result[lowerKey] = String(value);
        }
      }
    }
  } catch {
    // Fail-safe: nunca interromper o pipeline de requisição/observabilidade
  }

  return result;
}

/**
 * Sanitiza instâncias de erro e exceções para emissão segura em logs e Sentry.
 * Remove tokens, senhas e PII contidas em mensagens, pilhas de chamada (stack traces)
 * e propriedades arbitrárias anexadas ao erro.
 */
export function sanitizeError(error: unknown): Record<string, unknown> {
  try {
    if (error === null || error === undefined) {
      return { message: 'Unknown error' };
    }

    if (error instanceof Error) {
      const sanitized: Record<string, unknown> = {
        name: error.name || 'Error',
        message: sanitizeString(error.message || ''),
      };

      if (error.stack) {
        // Redige toda e qualquer PII ou credencial presente na stack trace (inclusive na linha 1 da V8)
        sanitized.stack = redactPiiText(error.stack);
      }

      if (error.cause) {
        sanitized.cause = sanitizePayload(error.cause);
      }

      // Copia e sanitiza propriedades adicionais anexadas ao objeto de erro
      for (const [key, val] of Object.entries(error)) {
        if (key === 'name' || key === 'message' || key === 'stack' || key === 'cause') {
          continue;
        }
        if (isSensitiveKey(key)) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = sanitizePayload(val);
        }
      }

      return sanitized;
    }

    if (typeof error === 'string') {
      return { message: sanitizeString(error) };
    }

    if (typeof error === 'object') {
      return sanitizePayload(error as Record<string, unknown>);
    }

    return { message: String(error) };
  } catch {
    return { message: 'Error sanitization failed' };
  }
}
