import { describe, it, expect } from 'vitest';
import { sanitizeAnalyticsProperties, type AnalyticsEvent } from '../../src/lib/analytics/events';

describe('Analytics Events Taxonomy and Sanitization', () => {
  it('filtra propriedades fora da allowlist documentada', () => {
    const raw = {
      page_path: '/livros',
      page_type: 'content',
      user_email: 'privado@diyspur.com',
      token: 'jwt.segredo.123',
    };

    const sanitized = sanitizeAnalyticsProperties('page_viewed', raw);

    expect(sanitized).toEqual({
      page_path: '/livros',
      page_type: 'content',
    });
    expect(sanitized).not.toHaveProperty('user_email');
    expect(sanitized).not.toHaveProperty('token');
  });

  it('trunca strings com mais de 100 caracteres', () => {
    const longPath = '/livros/' + 'a'.repeat(200);
    const sanitized = sanitizeAnalyticsProperties('page_viewed', {
      page_path: longPath,
      page_type: 'content',
    });

    expect(typeof sanitized.page_path).toBe('string');
    expect((sanitized.page_path as string).length).toBe(100);
  });

  it('permite valores numéricos finitos e booleanos válidos', () => {
    const sanitized = sanitizeAnalyticsProperties('search_performed', {
      query_length: 12,
      result_count: 5,
      search_scope: 'catalog',
    });

    expect(sanitized).toEqual({
      query_length: 12,
      result_count: 5,
      search_scope: 'catalog',
    });
  });

  it('remove propriedades não autorizadas em login_completed', () => {
    const sanitized = sanitizeAnalyticsProperties('login_completed', {
      auth_method: 'password',
      email: 'user@test.com',
      password: 'mypassword123',
    });

    expect(sanitized).toEqual({
      auth_method: 'password',
    });
    expect(sanitized).not.toHaveProperty('email');
    expect(sanitized).not.toHaveProperty('password');
  });

  describe('Canonical Pages Events Allowlist', () => {
    it('permite propriedades de catalog_page_viewed e filtra PII', () => {
      const sanitized = sanitizeAnalyticsProperties('catalog_page_viewed', {
        page_path: '/livros',
        page_type: 'catalog',
        genre: 'ficcao-cientifica',
        sort: 'popular',
        page: 2,
        search_query: 'asimov',
        user_secret: 'segredo',
      });

      expect(sanitized).toEqual({
        page_path: '/livros',
        page_type: 'catalog',
        genre: 'ficcao-cientifica',
        sort: 'popular',
        page: 2,
        search_query: 'asimov',
      });
      expect(sanitized).not.toHaveProperty('user_secret');
    });

    it('permite propriedades de book_detail_viewed', () => {
      const sanitized = sanitizeAnalyticsProperties('book_detail_viewed', {
        page_path: '/livros/dom-casmurro',
        page_type: 'book_detail',
        book_slug: 'dom-casmurro',
        source: 'catalog_search',
        has_active_club: true,
        extra_pii: 'vazamento',
      });

      expect(sanitized).toEqual({
        page_path: '/livros/dom-casmurro',
        page_type: 'book_detail',
        book_slug: 'dom-casmurro',
        source: 'catalog_search',
        has_active_club: true,
      });
    });

    it('permite propriedades de channel_page_viewed e meeting_page_viewed', () => {
      const channelSanitized = sanitizeAnalyticsProperties('channel_page_viewed', {
        page_path: '/clubes/classicos/canais/capitulo-1',
        page_type: 'channel',
        club_slug: 'classicos',
        channel_slug: 'capitulo-1',
        has_spoiler_filter: true,
      });
      expect(channelSanitized).toEqual({
        page_path: '/clubes/classicos/canais/capitulo-1',
        page_type: 'channel',
        club_slug: 'classicos',
        channel_slug: 'capitulo-1',
        has_spoiler_filter: true,
      });

      const meetingSanitized = sanitizeAnalyticsProperties('meeting_page_viewed', {
        page_path: '/clubes/classicos/encontros/encontro-123',
        page_type: 'meeting',
        club_slug: 'classicos',
        meeting_id: 'encontro-123',
        kind: 'online',
      });
      expect(meetingSanitized).toEqual({
        page_path: '/clubes/classicos/encontros/encontro-123',
        page_type: 'meeting',
        club_slug: 'classicos',
        meeting_id: 'encontro-123',
        kind: 'online',
      });
    });

    it('permite páginas de metas, diário, fila, perfil, ranking, desafios e privacidade', () => {
      const pages: Array<{
        event: AnalyticsEvent;
        props: Record<string, string | number | boolean>;
      }> = [
        { event: 'reading_goals_viewed', props: { page_path: '/metas', year: 2026, goals_count: 5 } },
        { event: 'journal_page_viewed', props: { page_path: '/diario', book_slug: '1984', entries_count: 3 } },
        { event: 'up_next_page_viewed', props: { page_path: '/proximos', queue_length: 4 } },
        { event: 'profile_page_viewed', props: { page_path: '/perfil/leitor', is_self: true } },
        { event: 'ranking_page_viewed', props: { page_path: '/ranking', period: 'monthly' } },
        { event: 'challenges_page_viewed', props: { page_path: '/desafios', challenge_id: 'ch-1' } },
        { event: 'privacy_page_viewed', props: { page_path: '/privacidade', section: 'cookies' } },
      ];

      for (const { event, props } of pages) {
        const sanitized = sanitizeAnalyticsProperties(event, { ...props, secret: 'x' });
        expect(sanitized).toEqual(props);
      }
    });
  });

  describe('Canonical Actions and Clicks Allowlist', () => {
    it('permite propriedades de cta_clicked com metadados do DOM', () => {
      const sanitized = sanitizeAnalyticsProperties('cta_clicked', {
        cta_id: 'btn-adicionar-fila',
        page_type: 'book_detail',
        placement: 'hero_action',
        text_content: 'Quero Ler',
        href: '/livros/dom-casmurro',
        target: '_self',
        page_path: '/livros/dom-casmurro',
        element_tag: 'BUTTON',
        element_role: 'button',
        cookie_header: 'token=123',
      });

      expect(sanitized).toEqual({
        cta_id: 'btn-adicionar-fila',
        page_type: 'book_detail',
        placement: 'hero_action',
        text_content: 'Quero Ler',
        href: '/livros/dom-casmurro',
        target: '_self',
        page_path: '/livros/dom-casmurro',
        element_tag: 'BUTTON',
        element_role: 'button',
      });
      expect(sanitized).not.toHaveProperty('cookie_header');
    });

    it('permite ações de interação de livros, clube e metas', () => {
      const actions: Array<{
        event: AnalyticsEvent;
        input: Record<string, string | number | boolean>;
        expected: Record<string, string | number | boolean>;
      }> = [
        {
          event: 'book_added_to_queue' as const,
          input: { book_slug: 'dom-casmurro', source: 'catalog', position: 1, secret: 'x' },
          expected: { book_slug: 'dom-casmurro', source: 'catalog', position: 1 },
        },
        {
          event: 'book_status_updated' as const,
          input: { book_slug: 'dom-casmurro', status: 'reading', previous_status: 'want_to_read' },
          expected: { book_slug: 'dom-casmurro', status: 'reading', previous_status: 'want_to_read' },
        },
        {
          event: 'season_joined' as const,
          input: { club_slug: 'classicos', season_id: 's1', source: 'invite' },
          expected: { club_slug: 'classicos', season_id: 's1', source: 'invite' },
        },
        {
          event: 'chapter_marked_read' as const,
          input: { book_slug: 'dom-casmurro', chapter_id: 'c1', progress_percent: 25 },
          expected: { book_slug: 'dom-casmurro', chapter_id: 'c1', progress_percent: 25 },
        },
        {
          event: 'discussion_comment_submitted' as const,
          input: { club_slug: 'classicos', discussion_id: 'd1', has_spoiler: false, is_reply: true },
          expected: { club_slug: 'classicos', discussion_id: 'd1', has_spoiler: false, is_reply: true },
        },
        {
          event: 'channel_message_sent' as const,
          input: { club_slug: 'classicos', channel_slug: 'geral', is_reply: false, has_video_sec: false },
          expected: { club_slug: 'classicos', channel_slug: 'geral', is_reply: false, has_video_sec: false },
        },
        {
          event: 'spoiler_accepted' as const,
          input: { channel_slug: 'geral', chapter_id: 'c5', spoiler_policy: 'warning' },
          expected: { channel_slug: 'geral', chapter_id: 'c5', spoiler_policy: 'warning' },
        },
        {
          event: 'meeting_created' as const,
          input: { club_slug: 'classicos', kind: 'online', spoiler_policy: 'strict' },
          expected: { club_slug: 'classicos', kind: 'online', spoiler_policy: 'strict' },
        },
        {
          event: 'meeting_rsvp_changed' as const,
          input: { meeting_id: 'm1', club_slug: 'classicos', status: 'going', previous_status: 'maybe' },
          expected: { meeting_id: 'm1', club_slug: 'classicos', status: 'going', previous_status: 'maybe' },
        },
        {
          event: 'affiliate_link_clicked' as const,
          input: { book_slug: 'dom-casmurro', merchant: 'amazon', placement: 'buy_button', url: 'https://amzn.to/abc' },
          expected: { book_slug: 'dom-casmurro', merchant: 'amazon', placement: 'buy_button', url: 'https://amzn.to/abc' },
        },
        {
          event: 'share_book_clicked' as const,
          input: { book_slug: 'dom-casmurro', share_channel: 'whatsapp', placement: 'share_modal' },
          expected: { book_slug: 'dom-casmurro', share_channel: 'whatsapp', placement: 'share_modal' },
        },
        {
          event: 'goal_created' as const,
          input: { goal_type: 'books', target_count: 12, year: 2026 },
          expected: { goal_type: 'books', target_count: 12, year: 2026 },
        },
        {
          event: 'goal_updated' as const,
          input: { goal_id: 'g1', progress: 5, target_count: 12 },
          expected: { goal_id: 'g1', progress: 5, target_count: 12 },
        },
        {
          event: 'journal_entry_saved' as const,
          input: { book_slug: 'dom-casmurro', entry_id: 'e1', has_notes: true },
          expected: { book_slug: 'dom-casmurro', entry_id: 'e1', has_notes: true },
        },
        {
          event: 'poll_voted' as const,
          input: { poll_id: 'p1', option_id: 'opt2', club_slug: 'classicos' },
          expected: { poll_id: 'p1', option_id: 'opt2', club_slug: 'classicos' },
        },
        {
          event: 'notification_opened' as const,
          input: { notification_id: 'n1', kind: 'mention', unread_count: 3 },
          expected: { notification_id: 'n1', kind: 'mention', unread_count: 3 },
        },
        {
          event: 'notification_clicked' as const,
          input: { notification_id: 'n1', kind: 'mention', unread: true, cta_url: '/clubes/classicos' },
          expected: { notification_id: 'n1', kind: 'mention', unread: true, cta_url: '/clubes/classicos' },
        },
        {
          event: 'auth_submitted' as const,
          input: { auth_method: 'magic_link', mode: 'login', success: true, email: 'secret@domain.com' },
          expected: { auth_method: 'magic_link', mode: 'login', success: true },
        },
        {
          event: 'auth_logout_clicked' as const,
          input: { source: 'header_menu', secret_token: 'xyz' },
          expected: { source: 'header_menu' },
        },
      ];

      for (const { event, input, expected } of actions) {
        const sanitized = sanitizeAnalyticsProperties(event, input);
        expect(sanitized).toEqual(expected);
      }
    });
  });
});

