import { describe, expect, it } from 'vitest';
// @ts-expect-error next.config.mjs is an untyped ESM configuration file
import nextConfig from '../../next.config.mjs';
import { safeLocalRedirect, getSafeRedirectUrl } from '../../src/lib/safe-redirect';

import { journalDateSchema, createJournalSchema } from '../../src/features/journal/schemas';
import { goalSchema } from '../../src/features/goals/schemas';
import { inviteEmailSchema } from '../../src/features/book-invitations/schemas';


describe('Security Hardening & Pentest Suite (Task 14 / P14)', () => {
  describe('SEC-01: Open Redirect Defenses', () => {
    it.each([
      ['//evil.example.com', '/perfil'],
      ['///evil.example.com', '/perfil'],
      ['/\\evil.example.com', '/perfil'],
      ['\\\\evil.example.com', '/perfil'],
      ['javascript:alert(document.cookie)', '/perfil'],
      ['data:text/html,<script>alert(1)</script>', '/perfil'],
      ['vbscript:msgbox(1)', '/perfil'],
      ['https://attacker.com/phishing', '/perfil'],
      ['http://attacker.com', '/perfil'],
      ['ftp://attacker.com', '/perfil'],
      ['   ', '/perfil'],
      [null, '/perfil'],
      [undefined, '/perfil'],
    ])('rejeita redirecionamento hostil ou inválido: %s', (input, expected) => {
      expect(safeLocalRedirect(input)).toBe(expected);
      expect(getSafeRedirectUrl(input)).toBe('/');
    });

    it('permite apenas caminhos locais válidos e preserva query e hash', () => {
      expect(safeLocalRedirect('/livros')).toBe('/livros');
      expect(safeLocalRedirect('/capitulos/1?pagina=2#comentarios')).toBe('/capitulos/1?pagina=2#comentarios');
      expect(getSafeRedirectUrl('/ranking')).toBe('/ranking');
    });

    it('usa fallback customizado de forma segura quando fornecido', () => {
      expect(safeLocalRedirect('https://evil.com', '/diario')).toBe('/diario');
      expect(getSafeRedirectUrl('https://evil.com', '/explorar')).toBe('/explorar');
    });
  });

  describe('SEC-02: Next.js Security Headers & CSP Configuration', () => {
    it('configura cabeçalhos de segurança obrigatórios para todas as rotas', async () => {
      expect(nextConfig.headers).toBeTypeOf('function');
      const routeHeaders = await nextConfig.headers!();
      expect(routeHeaders).toBeInstanceOf(Array);
      expect(routeHeaders.length).toBeGreaterThan(0);

      const catchAllRule = routeHeaders.find((r: { source: string }) => r.source === '/(.*)');
      expect(catchAllRule).toBeDefined();

      const headersMap = new Map<string, string>();
      for (const h of catchAllRule.headers) {
        headersMap.set(h.key.toLowerCase(), h.value);
      }

      // X-Frame-Options deve ser DENY para mitigar Clickjacking
      expect(headersMap.get('x-frame-options')).toBe('DENY');

      // X-Content-Type-Options deve ser nosniff para impedir MIME sniffing
      expect(headersMap.get('x-content-type-options')).toBe('nosniff');

      // Strict-Transport-Security deve ter max-age longo e includeSubDomains
      const hsts = headersMap.get('strict-transport-security');
      expect(hsts).toBeDefined();
      expect(hsts).toContain('max-age=');
      expect(hsts).toContain('includeSubDomains');

      // Referrer-Policy deve ser strict-origin-when-cross-origin
      expect(headersMap.get('referrer-policy')).toBe('strict-origin-when-cross-origin');

      // Permissions-Policy deve restringir câmeras e microfones
      const permPolicy = headersMap.get('permissions-policy');
      expect(permPolicy).toBeDefined();
      expect(permPolicy).toContain('camera=()');
      expect(permPolicy).toContain('microphone=()');

      // CSP deve proibir object-src e frame-ancestors
      const csp = headersMap.get('content-security-policy-report-only') || headersMap.get('content-security-policy');
      expect(csp).toBeDefined();
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("base-uri 'self'");
    });

    it('desativa o cabeçalho sensível X-Powered-By no Next.js', () => {
      expect(nextConfig.poweredByHeader).toBe(false);
    });
  });

  describe('SEC-03: Parameter Validation & Schema Hardening', () => {
    it('rejeita datas de calendário inexistentes e injeções no diário', () => {
      // 2026 não é bissexto -> 29 de fevereiro é inválido
      const leapFail = journalDateSchema.safeParse('2026-02-29');
      expect(leapFail.success).toBe(false);

      // Data inexistente 31 de abril
      const aprilFail = journalDateSchema.safeParse('2026-04-31');
      expect(aprilFail.success).toBe(false);

      // Injeção de SQL ou formato malicioso
      const sqlFail = journalDateSchema.safeParse("2026-01-01' OR '1'='1");
      expect(sqlFail.success).toBe(false);

      // Data válida aceita
      const valid = journalDateSchema.safeParse('2026-04-30');
      expect(valid.success).toBe(true);

      // Criação completa com payload válido
      const validEntry = createJournalSchema.safeParse({
        bookId: '550e8400-e29b-41d4-a716-446655440000',
        entryDate: '2026-04-30',
        title: 'Capítulo 1',
        body: 'Leitura finalizada com sucesso.',
      });
      expect(validEntry.success).toBe(true);
    });


    it('rejeita metas com alvos negativos, zero ou ano inválido', () => {
      const negativeTarget = goalSchema.safeParse({
        year: 2026,
        targetBooks: -10,
      });
      expect(negativeTarget.success).toBe(false);

      const zeroTarget = goalSchema.safeParse({
        year: 2026,
        targetBooks: 0,
      });
      expect(zeroTarget.success).toBe(false);

      const invalidYear = goalSchema.safeParse({
        year: 1990,
        targetBooks: 10,
      });
      expect(invalidYear.success).toBe(false);

      const validGoal = goalSchema.safeParse({
        year: 2026,
        targetMinutes: 1200,
      });
      expect(validGoal.success).toBe(true);
    });

    it('rejeita e-mails maliciosos ou inválidos em convites', () => {
      const xssEmail = inviteEmailSchema.safeParse({
        bookId: '550e8400-e29b-41d4-a716-446655440000',
        email: '<script>alert(1)</script>@test.com',
      });
      expect(xssEmail.success).toBe(false);

      const invalidDomain = inviteEmailSchema.safeParse({
        bookId: '550e8400-e29b-41d4-a716-446655440000',
        email: 'user@',
      });
      expect(invalidDomain.success).toBe(false);

      const validEmail = inviteEmailSchema.safeParse({
        bookId: '550e8400-e29b-41d4-a716-446655440000',
        email: 'amigo.leitor@dominio.com.br',
      });
      expect(validEmail.success).toBe(true);
    });
  });
});


