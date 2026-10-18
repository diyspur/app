import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  resolvePageType,
  resolveRouteEvent,
  trackRoute,
} from '../../src/components/analytics/telemetry-provider';
import { trackProductEvent } from '../../src/lib/telemetry/product-events';
import { hasAnalyticsConsent } from '../../src/lib/analytics/consent';

vi.mock('../../src/lib/telemetry/product-events', () => ({
  trackProductEvent: vi.fn(),
  identifyProductUser: vi.fn(),
  resetProductIdentity: vi.fn(),
}));

vi.mock('../../src/lib/analytics/consent', () => ({
  hasAnalyticsConsent: vi.fn(),
  readAnalyticsConsent: vi.fn(),
  onAnalyticsConsentChange: vi.fn(() => () => {}),
}));

vi.mock('@sentry/nextjs', () => ({
  setUser: vi.fn(),
}));

vi.mock('@/lib/supabase/browser', () => ({
  createBrowserSupabase: vi.fn(() => ({
    auth: {
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  })),
}));

describe('TelemetryProvider Route Tracking & Mapping (Task 5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hasAnalyticsConsent).mockReturnValue(true);
  });

  describe('resolvePageType()', () => {
    it('categoriza corretamente todos os tipos canônicos de rota', () => {
      expect(resolvePageType('/')).toBe('landing');
      expect(resolvePageType('/livros')).toBe('catalog');
      expect(resolvePageType('/livros/dom-casmurro')).toBe('book_detail');
      expect(resolvePageType('/clubes/ficcao')).toBe('community');
      expect(resolvePageType('/clubes/ficcao/canais/capitulo-1')).toBe('community');
      expect(resolvePageType('/metas')).toBe('goals');
      expect(resolvePageType('/diario')).toBe('journal');
      expect(resolvePageType('/diario/novo')).toBe('journal');
      expect(resolvePageType('/proximos')).toBe('queue');
      expect(resolvePageType('/fila')).toBe('queue');
      expect(resolvePageType('/perfil/usuario')).toBe('profile');
      expect(resolvePageType('/ranking')).toBe('ranking');
      expect(resolvePageType('/desafios')).toBe('challenges');
      expect(resolvePageType('/privacidade')).toBe('legal');
      expect(resolvePageType('/sobre')).toBe('content');
    });
  });

  describe('resolveRouteEvent() — Mapeamento Canônico de 100% das Rotas', () => {
    it('mapeia a landing page (/)', () => {
      const match = resolveRouteEvent('/');
      expect(match).toEqual({
        event: 'landing_page_viewed',
        properties: { page_path: '/', page_type: 'landing' },
      });
    });

    it('mapeia a página de catálogo (/livros)', () => {
      const match = resolveRouteEvent('/livros');
      expect(match).toEqual({
        event: 'catalog_page_viewed',
        properties: { page_path: '/livros', page_type: 'catalog' },
      });
    });

    it('mapeia detalhes do livro (/livros/[slug])', () => {
      const match = resolveRouteEvent('/livros/dom-casmurro');
      expect(match).toEqual({
        event: 'book_detail_viewed',
        properties: {
          page_path: '/livros/dom-casmurro',
          page_type: 'book_detail',
          book_slug: 'dom-casmurro',
        },
      });
    });

    it('mapeia canais de discussão de clube (/clubes/[slug]/canais/[channelSlug])', () => {
      const match = resolveRouteEvent('/clubes/classicos/canais/capitulo-1');
      expect(match).toEqual({
        event: 'channel_page_viewed',
        properties: {
          page_path: '/clubes/classicos/canais/capitulo-1',
          page_type: 'channel',
          club_slug: 'classicos',
          channel_slug: 'capitulo-1',
        },
      });
    });

    it('mapeia encontros do clube (/clubes/[slug]/encontros/[meetingId])', () => {
      const match = resolveRouteEvent('/clubes/classicos/encontros/encontro-123');
      expect(match).toEqual({
        event: 'meeting_page_viewed',
        properties: {
          page_path: '/clubes/classicos/encontros/encontro-123',
          page_type: 'meeting',
          club_slug: 'classicos',
          meeting_id: 'encontro-123',
        },
      });
    });

    it('mapeia visão geral de clube (/clubes/[slug])', () => {
      const match = resolveRouteEvent('/clubes/classicos');
      expect(match).toEqual({
        event: 'club_page_viewed',
        properties: {
          page_path: '/clubes/classicos',
          page_type: 'club',
          club_slug: 'classicos',
        },
      });
    });

    it('mapeia metas de leitura (/metas)', () => {
      const match = resolveRouteEvent('/metas');
      expect(match).toEqual({
        event: 'reading_goals_viewed',
        properties: { page_path: '/metas', page_type: 'goals' },
      });
    });

    it('mapeia diário de leitura (/diario)', () => {
      const match = resolveRouteEvent('/diario');
      expect(match).toEqual({
        event: 'journal_page_viewed',
        properties: { page_path: '/diario', page_type: 'journal' },
      });
    });

    it('mapeia fila de próximas leituras (/proximos e /fila)', () => {
      expect(resolveRouteEvent('/proximos')).toEqual({
        event: 'up_next_page_viewed',
        properties: { page_path: '/proximos', page_type: 'queue' },
      });
      expect(resolveRouteEvent('/fila')).toEqual({
        event: 'up_next_page_viewed',
        properties: { page_path: '/fila', page_type: 'queue' },
      });
    });

    it('mapeia perfil, ranking, desafios e privacidade', () => {
      expect(resolveRouteEvent('/perfil/machado')).toEqual({
        event: 'profile_page_viewed',
        properties: { page_path: '/perfil/machado', page_type: 'profile' },
      });
      expect(resolveRouteEvent('/ranking')).toEqual({
        event: 'ranking_page_viewed',
        properties: { page_path: '/ranking', page_type: 'ranking' },
      });
      expect(resolveRouteEvent('/desafios')).toEqual({
        event: 'challenges_page_viewed',
        properties: { page_path: '/desafios', page_type: 'challenges' },
      });
      expect(resolveRouteEvent('/privacidade')).toEqual({
        event: 'privacy_page_viewed',
        properties: { page_path: '/privacidade', page_type: 'privacy' },
      });
    });

    it('retorna null para páginas sem evento específico mapeado', () => {
      expect(resolveRouteEvent('/pagina-desconhecida')).toBeNull();
    });
  });

  describe('trackRoute()', () => {
    it('despacha tanto page_viewed canônico quanto o evento específico de rota', () => {
      trackRoute('/livros/dom-casmurro');

      expect(trackProductEvent).toHaveBeenCalledTimes(2);

      expect(trackProductEvent).toHaveBeenNthCalledWith(1, 'page_viewed', {
        page_path: '/livros/dom-casmurro',
        page_type: 'book_detail',
      });

      expect(trackProductEvent).toHaveBeenNthCalledWith(2, 'book_detail_viewed', {
        page_path: '/livros/dom-casmurro',
        page_type: 'book_detail',
        book_slug: 'dom-casmurro',
      });
    });

    it('Fail-Closed: não despacha nada se hasAnalyticsConsent() for falso', () => {
      vi.mocked(hasAnalyticsConsent).mockReturnValue(false);

      trackRoute('/livros');

      expect(trackProductEvent).not.toHaveBeenCalled();
    });
  });
});
