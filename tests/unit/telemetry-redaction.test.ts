import { describe, it, expect } from 'vitest';
import {
  sanitizePayload,
  redactSensitiveHeaders,
  sanitizeError,
  isSensitiveKey,
} from '../../src/lib/observability/redaction';

describe('Telemetry Redaction & Sanitization Engine (LGPD)', () => {
  describe('redactSensitiveHeaders', () => {
    it('redige headers sensíveis em Record<string, string> independente de caixa', () => {
      const headers = {
        'Authorization': 'Bearer secret-jwt-token-12345',
        'Cookie': 'session_id=xyz987; token=abc',
        'Set-Cookie': 'secret=123',
        'X-Api-Key': 'key-live-99999',
        'x-auth-token': 'auth-xyz',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      };

      const redacted = redactSensitiveHeaders(headers);

      expect(redacted['authorization']).toBe('[REDACTED]');
      expect(redacted['cookie']).toBe('[REDACTED]');
      expect(redacted['set-cookie']).toBe('[REDACTED]');
      expect(redacted['x-api-key']).toBe('[REDACTED]');
      expect(redacted['x-auth-token']).toBe('[REDACTED]');
      expect(redacted['content-type']).toBe('application/json');
      expect(redacted['user-agent']).toBe('Mozilla/5.0');
    });

    it('redige headers sensíveis a partir de instância web padrão Headers', () => {
      const headers = new Headers();
      headers.set('authorization', 'Bearer my-token');
      headers.set('cookie', 'token=123');
      headers.set('accept', 'application/json');

      const redacted = redactSensitiveHeaders(headers);

      expect(redacted['authorization']).toBe('[REDACTED]');
      expect(redacted['cookie']).toBe('[REDACTED]');
      expect(redacted['accept']).toBe('application/json');
    });

    it('lida com entradas nulas ou vazias de forma segura', () => {
      expect(redactSensitiveHeaders({} as Record<string, string>)).toEqual({});
      expect(redactSensitiveHeaders(null)).toEqual({});
      expect(redactSensitiveHeaders(undefined)).toEqual({});
    });
  });

  describe('sanitizePayload', () => {
    it('redige chaves de objetos sensíveis por blocklist', () => {
      const payload = {
        username: 'alice',
        password: 'my-super-secret-password',
        secret: 'shhh',
        token: 'eyJhbGciOi...',
        apiKey: 'sk-live-123',
        creditCard: '4532 0151 1283 0366',
        cvv: '123',
        cpf: '123.456.789-00',
        refreshToken: 'token-abc',
        publicNote: 'tudo certo',
      };

      const sanitized = sanitizePayload(payload);

      expect(sanitized.username).toBe('alice');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.secret).toBe('[REDACTED]');
      expect(sanitized.token).toBe('[REDACTED]');
      expect(sanitized.apiKey).toBe('[REDACTED]');
      expect(sanitized.creditCard).toBe('[REDACTED]');
      expect(sanitized.cvv).toBe('[REDACTED]');
      expect(sanitized.cpf).toBe('[REDACTED]');
      expect(sanitized.refreshToken).toBe('[REDACTED]');
      expect(sanitized.publicNote).toBe('tudo certo');
    });

    it('redige tokens Bearer dentro de strings', () => {
      const input = 'Authorization header was Bearer eyJhbGciOiJIUzI1NiJ9.test.sig failed';
      const output = sanitizePayload(input);
      expect(output).not.toContain('eyJhbGciOiJIUzI1NiJ9.test.sig');
      expect(output).toContain('Bearer [REDACTED]');
    });

    it('redige JWTs dentro de strings arbitrárias', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const input = { message: `Falha com token: ${jwt}` };
      const output = sanitizePayload(input);
      expect(output.message).not.toContain(jwt);
      expect(output.message).toContain('[REDACTED]');
    });

    it('redige números de cartão de crédito no formato com traços ou espaços', () => {
      const input = {
        cardWithSpaces: '4532 0151 1283 0366',
        cardWithDashes: '5412-7512-3412-3456',
        cardPlain: '4111111111111111',
      };
      const output = sanitizePayload(input);
      expect(output.cardWithSpaces).toBe('[REDACTED]');
      expect(output.cardWithDashes).toBe('[REDACTED]');
      expect(output.cardPlain).toBe('[REDACTED]');
    });

    it('redige CPFs formatados no padrão brasileiro', () => {
      const input = 'O CPF do cliente é 123.456.789-01 no cadastro';
      const output = sanitizePayload(input);
      expect(output).not.toContain('123.456.789-01');
      expect(output).toContain('[REDACTED]');
    });

    it('mascara e-mails preservando formato anonimizado', () => {
      const input = {
        contact: 'usuario.leitor@diyspur.com.br',
        simple: 'user@example.com',
      };
      const output = sanitizePayload(input);
      expect(output.contact).toMatch(/^u\*\*\*@\*\*\*\.com\.br$/);
      expect(output.simple).toMatch(/^u\*\*\*@\*\*\*\.com$/);
    });

    it('saneia parâmetros sensíveis em URLs e query strings', () => {
      const url = 'https://api.diyspur.com/auth/callback?token=secret123&code=auth456&state=xyz&page=1';
      const sanitized = sanitizePayload(url);
      expect(sanitized).not.toContain('secret123');
      expect(sanitized).not.toContain('auth456');
      expect(sanitized).toContain('token=%5BREDACTED%5D');
      expect(sanitized).toContain('code=%5BREDACTED%5D');
      expect(sanitized).toContain('page=1');
    });

    it('trunca strings longas em no máximo 250 caracteres', () => {
      const longString = 'a'.repeat(400);
      const sanitized = sanitizePayload(longString);
      expect(sanitized.length).toBe(250);
      expect(sanitized).toBe('a'.repeat(250));
    });

    it('sanitiza recursivamente objetos aninhados e arrays', () => {
      const complex = {
        users: [
          { name: 'Bob', email: 'bob@example.com', token: 'secret-1' },
          { name: 'Carol', email: 'carol@test.org', token: 'secret-2' },
        ],
        meta: {
          config: {
            apiKey: 'super-key',
            active: true,
            score: 42,
          },
        },
      };

      const sanitized = sanitizePayload(complex);

      expect(sanitized.users[0]?.email).toMatch(/^b\*\*\*@\*\*\*\.com$/);
      expect(sanitized.users[0]?.token).toBe('[REDACTED]');
      expect(sanitized.users[1]?.email).toMatch(/^c\*\*\*@\*\*\*\.org$/);
      expect(sanitized.users[1]?.token).toBe('[REDACTED]');
      expect(sanitized.meta.config.apiKey).toBe('[REDACTED]');
      expect(sanitized.meta.config.score).toBe(42);
      expect(sanitized.meta.config.active).toBe(true);
    });

    it('protege contra referências circulares sem estourar a pilha', () => {
      const circularObj: Record<string, unknown> = {
        name: 'circulo',
        safe: true,
      };
      circularObj.self = circularObj;

      const sanitized = sanitizePayload(circularObj);
      expect(sanitized.name).toBe('circulo');
      expect(sanitized.safe).toBe(true);
      expect(sanitized.self).toBe('[CIRCULAR]');
    });

    it('interrompe recursão profunda com segurança ao atingir profundidade máxima', () => {
      let current: Record<string, unknown> = {};
      const root = current;
      for (let i = 0; i < 20; i++) {
        const next: Record<string, unknown> = {};
        current.child = next;
        current = next;
      }

      const sanitized = sanitizePayload(root);
      expect(sanitized).toBeDefined();
    });

    it('trata valores primitivos e tipos especiais sem quebrar', () => {
      expect(sanitizePayload(null)).toBeNull();
      expect(sanitizePayload(undefined)).toBeUndefined();
      expect(sanitizePayload(123)).toBe(123);
      expect(sanitizePayload(true)).toBe(true);
      const date = new Date('2026-01-01T00:00:00Z');
      expect(sanitizePayload(date)).toEqual(date);
    });
  });

  describe('sanitizeError', () => {
    it('redige PII e credenciais na primeira linha e em todo o stack trace de Error', () => {
      const error = new Error('Falha com email dev@diyspur.com.br, cpf 111.222.333-44 e cartao 4532 0151 1283 0366');
      error.stack = `Error: Falha com email dev@diyspur.com.br, cpf 111.222.333-44 e cartao 4532 0151 1283 0366\n    at connect (postgres://admin:topsecret@db.internal:5432/diyspur)\n    at fetch (/api?api_key=sk-12345)`;

      const sanitized = sanitizeError(error);

      expect(sanitized.stack).not.toContain('dev@diyspur.com.br');
      expect(sanitized.stack).toContain('d***@***.com.br');
      expect(sanitized.stack).not.toContain('111.222.333-44');
      expect(sanitized.stack).not.toContain('4532 0151 1283 0366');
      expect(sanitized.stack).not.toContain('topsecret');
      expect(sanitized.stack).not.toContain('sk-12345');
    });

    it('sanitiza instâncias padrão de Error removendo PII de mensagem e stack', () => {
      const error = new Error('Falha ao autenticar usuário joao@exemplo.com com token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0In0.sig123');
      error.stack = `Error: Falha ao autenticar\n    at login (/app/auth.ts:10:5?secret=abc12345)`;

      const sanitized = sanitizeError(error);

      expect(sanitized.name).toBe('Error');
      expect(sanitized.message).not.toContain('joao@exemplo.com');
      expect(sanitized.message).not.toContain('eyJhbGciOi');
      expect(typeof sanitized.message).toBe('string');
      expect(sanitized.stack).toBeDefined();
      expect(sanitized.stack).not.toContain('secret=abc12345');
    });

    it('sanitiza propriedades customizadas adicionadas ao Error', () => {
      const error = new Error('Database connection failed') as Error & {
        apiKey?: string;
        connectionString?: string;
        code?: string;
      };
      error.apiKey = 'live-key-999';
      error.connectionString = 'postgres://admin:superpassword@localhost:5432/db';
      error.code = 'ECONNREFUSED';

      const sanitized = sanitizeError(error);

      expect(sanitized.apiKey).toBe('[REDACTED]');
      expect(sanitized.connectionString).not.toContain('superpassword');
      expect(sanitized.code).toBe('ECONNREFUSED');
    });

    it('trata erros que são strings ou objetos literais', () => {
      const stringError = sanitizeError('Erro com token abc-secret-123 e senha secret!');
      expect(stringError.message).toBeDefined();

      const objectError = sanitizeError({
        code: 500,
        secretKey: 'top-secret',
        detail: 'Falha no pagamento',
      });
      expect(objectError.code).toBe(500);
      expect(objectError.secretKey).toBe('[REDACTED]');
      expect(objectError.detail).toBe('Falha no pagamento');
    });

    it('nunca lança exceção em entradas nulas ou indefinidas', () => {
      expect(() => sanitizeError(null)).not.toThrow();
      expect(() => sanitizeError(undefined)).not.toThrow();
      expect(sanitizeError(null)).toEqual({ message: 'Unknown error' });
    });
  });

  describe('Review Findings (Fix Round 1)', () => {
    it('redige propriedades com CPF mesmo quando compostas no nome', () => {
      const payload = {
        user_cpf_number: '12345678901',
        client_cpf_digits: '98765432100',
      };
      const sanitized = sanitizePayload(payload);
      expect(sanitized.user_cpf_number).toBe('[REDACTED]');
      expect(sanitized.client_cpf_digits).toBe('[REDACTED]');
    });

    it('redige chaves em português como senha e cartao (com ou sem acento)', () => {
      const payload = {
        senha: 'minha-senha-secreta',
        minha_senha: '123',
        cartao: '1234567890123456',
        numero_cartao: '9999888877776666',
        cartão_de_credito: '4111',
      };
      const sanitized = sanitizePayload(payload);
      expect(sanitized.senha).toBe('[REDACTED]');
      expect(sanitized.minha_senha).toBe('[REDACTED]');
      expect(sanitized.cartao).toBe('[REDACTED]');
      expect(sanitized.numero_cartao).toBe('[REDACTED]');
      expect(sanitized.cartão_de_credito).toBe('[REDACTED]');
    });

    it('saneia parâmetros de query string com prefixos como api_key e access_token', () => {
      const url = 'https://api.diyspur.com/v1?api_key=secret-key-123&client_secret=456&access_token=jwt789&safe_param=ok';
      const sanitized = sanitizePayload(url);
      expect(sanitized).not.toContain('secret-key-123');
      expect(sanitized).not.toContain('456');
      expect(sanitized).not.toContain('jwt789');
      expect(sanitized).toContain('safe_param=ok');
    });

    it('redige cartões Amex no formato 4-6-5 dígitos', () => {
      const input = {
        amexSpaces: '3400 123456 78901',
        amexDashes: '3700-123456-78901',
      };
      const output = sanitizePayload(input);
      expect(output.amexSpaces).toBe('[REDACTED]');
      expect(output.amexDashes).toBe('[REDACTED]');
    });

    it('delega para sanitizeError quando sanitizePayload recebe instância de Error', () => {
      const err = new Error('Falha de auth com token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig');
      const sanitized = sanitizePayload(err) as unknown as Record<string, unknown>;
      expect(sanitized.name).toBe('Error');
      expect(sanitized.message).not.toContain('eyJhbGciOi');
      expect(sanitized.message).toContain('[REDACTED]');
      expect(sanitized.stack).toBeDefined();
    });

    it('adota política fail-closed retornando marcador seguro se ocorrer erro inesperado', () => {
      const buggyObj = {
        get broken() {
          throw new Error('Explosão no getter');
        },
      };
      const sanitized = sanitizePayload(buggyObj);
      expect(sanitized).toEqual({ unredacted: '[UNSANITIZED_DATA]' });
    });

    it('avalia termos sensíveis (token, password, secret) antes de autor e preserva apenas campos seguros de autor', () => {
      // Safe author fields
      expect(isSensitiveKey('author')).toBe(false);
      expect(isSensitiveKey('author_id')).toBe(false);
      expect(isSensitiveKey('author_name')).toBe(false);
      expect(isSensitiveKey('book_author')).toBe(false);
      expect(isSensitiveKey('authorId')).toBe(false);
      expect(isSensitiveKey('authorName')).toBe(false);

      // Sensitive terms inside author-named fields
      expect(isSensitiveKey('author_token')).toBe(true);
      expect(isSensitiveKey('author_password')).toBe(true);
      expect(isSensitiveKey('author_secret')).toBe(true);
      expect(isSensitiveKey('author_key')).toBe(true);
      expect(isSensitiveKey('author_credential')).toBe(true);

      const payload = {
        author: 'Machado de Assis',
        author_id: 'uuid-123',
        author_token: 'secret-token-456',
        author_password: 'author-pass-789',
      };
      const sanitized = sanitizePayload(payload);
      expect(sanitized.author).toBe('Machado de Assis');
      expect(sanitized.author_id).toBe('uuid-123');
      expect(sanitized.author_token).toBe('[REDACTED]');
      expect(sanitized.author_password).toBe('[REDACTED]');
    });

    it('converte BigInt para string durante serialização sem lançar exceção no JSON.stringify', () => {
      const payload = {
        id: BigInt('9007199254740993'),
        total_views: BigInt('12345678901234567890'),
      };

      const sanitized = sanitizePayload(payload);
      expect(sanitized.id).toBe('9007199254740993');
      expect(sanitized.total_views).toBe('12345678901234567890');

      // Verifica que JSON.stringify não lança "TypeError: Do not know how to serialize a BigInt"
      expect(() => JSON.stringify(sanitized)).not.toThrow();
      expect(JSON.stringify(sanitized)).toContain('"id":"9007199254740993"');
    });
  });
});
