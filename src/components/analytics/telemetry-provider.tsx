'use client';

import React, { useEffect, useRef, useState, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import * as Sentry from '@sentry/nextjs';
import {
  hasAnalyticsConsent,
  readAnalyticsConsent,
  onAnalyticsConsentChange,
  type AnalyticsConsent,
} from '@/lib/analytics/consent';
import { initializePostHog, disablePostHog } from '@/lib/analytics/client';
import { initGa4, disableGa4 } from '@/lib/telemetry/ga4';
import { initClarity, disableClarity } from '@/lib/telemetry/clarity';
import { initFaro, disableFaro } from '@/lib/telemetry/faro';
import {
  trackProductEvent,
  identifyProductUser,
  resetProductIdentity,
} from '@/lib/telemetry/product-events';
import { setupDomClickObserver } from '@/lib/telemetry/dom-observer';
import type { AnalyticsEvent } from '@/lib/analytics/events';

export interface ResolvedRouteEvent {
  event: AnalyticsEvent;
  properties: Record<string, string | number | boolean>;
}

/**
 * Mapeia caminhos de URL para categorias de página canônicas.
 */
export function resolvePageType(pathname: string): string {
  if (!pathname || pathname === '/') return 'landing';
  if (pathname === '/livros') return 'catalog';
  if (pathname.startsWith('/livros/')) return 'book_detail';
  if (pathname.startsWith('/clubes/')) return 'community';
  if (pathname === '/metas') return 'goals';
  if (pathname.startsWith('/diario')) return 'journal';
  if (pathname === '/proximos' || pathname === '/fila') return 'queue';
  if (pathname.startsWith('/perfil')) return 'profile';
  if (pathname.startsWith('/ranking')) return 'ranking';
  if (pathname.startsWith('/desafios')) return 'challenges';
  if (pathname === '/privacidade') return 'legal';
  return 'content';
}

/**
 * Mapeia 100% das páginas da aplicação para seus respectivos eventos canônicos de visualização.
 */
export function resolveRouteEvent(pathname: string): ResolvedRouteEvent | null {
  if (!pathname || pathname === '/') {
    return {
      event: 'landing_page_viewed',
      properties: { page_path: '/', page_type: 'landing' },
    };
  }

  if (pathname === '/livros') {
    return {
      event: 'catalog_page_viewed',
      properties: { page_path: pathname, page_type: 'catalog' },
    };
  }

  const bookDetailMatch = pathname.match(/^\/livros\/([^/]+)$/);
  if (bookDetailMatch && bookDetailMatch[1]) {
    return {
      event: 'book_detail_viewed',
      properties: {
        page_path: pathname,
        page_type: 'book_detail',
        book_slug: bookDetailMatch[1],
      },
    };
  }

  const channelMatch = pathname.match(/^\/clubes\/([^/]+)\/canais\/([^/]+)$/);
  if (channelMatch && channelMatch[1] && channelMatch[2]) {
    return {
      event: 'channel_page_viewed',
      properties: {
        page_path: pathname,
        page_type: 'channel',
        club_slug: channelMatch[1],
        channel_slug: channelMatch[2],
      },
    };
  }

  const meetingMatch = pathname.match(/^\/clubes\/([^/]+)\/encontros\/([^/]+)$/);
  if (meetingMatch && meetingMatch[1] && meetingMatch[2]) {
    return {
      event: 'meeting_page_viewed',
      properties: {
        page_path: pathname,
        page_type: 'meeting',
        club_slug: meetingMatch[1],
        meeting_id: meetingMatch[2],
      },
    };
  }

  const clubMatch = pathname.match(/^\/clubes\/([^/]+)/);
  if (clubMatch && clubMatch[1]) {
    return {
      event: 'club_page_viewed',
      properties: {
        page_path: pathname,
        page_type: 'club',
        club_slug: clubMatch[1],
      },
    };
  }

  if (pathname === '/metas') {
    return {
      event: 'reading_goals_viewed',
      properties: { page_path: pathname, page_type: 'goals' },
    };
  }

  if (pathname.startsWith('/diario')) {
    return {
      event: 'journal_page_viewed',
      properties: { page_path: pathname, page_type: 'journal' },
    };
  }

  if (pathname === '/proximos' || pathname === '/fila') {
    return {
      event: 'up_next_page_viewed',
      properties: { page_path: pathname, page_type: 'queue' },
    };
  }

  if (pathname.startsWith('/perfil')) {
    return {
      event: 'profile_page_viewed',
      properties: { page_path: pathname, page_type: 'profile' },
    };
  }

  if (pathname.startsWith('/ranking')) {
    return {
      event: 'ranking_page_viewed',
      properties: { page_path: pathname, page_type: 'ranking' },
    };
  }

  if (pathname.startsWith('/desafios')) {
    return {
      event: 'challenges_page_viewed',
      properties: { page_path: pathname, page_type: 'challenges' },
    };
  }

  if (pathname === '/privacidade') {
    return {
      event: 'privacy_page_viewed',
      properties: { page_path: pathname, page_type: 'privacy' },
    };
  }

  return null;
}

/**
 * Despacha eventos de telemetria de visualização de página.
 */
export function trackRoute(pathname: string): void {
  if (!hasAnalyticsConsent()) return;

  const pageType = resolvePageType(pathname);

  // 1. Sempre despacha 'page_viewed' canônico para todos os adaptadores
  trackProductEvent('page_viewed', {
    page_path: pathname,
    page_type: pageType,
  });

  // 2. Se a rota corresponder a uma página canônica específica, despacha o evento correspondente
  const specific = resolveRouteEvent(pathname);
  if (specific) {
    trackProductEvent(specific.event, specific.properties);
  }
}

/**
 * Subcomponente isolado em Suspense para rastreamento de rota via usePathname e useSearchParams.
 * Garante idempotência estrita no React Strict Mode.
 */
function RouteTransitionTracker({ consent }: { consent: AnalyticsConsent | null }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastTrackedRouteRef = useRef<string | null>(null);

  const searchString = searchParams?.toString();
  const currentRouteKey = searchString ? `${pathname}?${searchString}` : pathname;

  useEffect(() => {
    if (consent !== 'granted') {
      lastTrackedRouteRef.current = null;
      return;
    }

    // Idempotência em React Strict Mode: não dispara evento duplicado no mesmo ciclo de rota
    if (lastTrackedRouteRef.current === currentRouteKey) {
      return;
    }

    lastTrackedRouteRef.current = currentRouteKey;
    trackRoute(pathname);
  }, [consent, pathname, currentRouteKey]);

  return null;
}

/**
 * Provedor unificado de telemetria da aplicação (Task 5 / OBS-01).
 *
 * Responsabilidades:
 * 1. Escuta reativa de consentimento e ciclo de vida dos 4 adaptadores (GA4, Clarity, PostHog, Faro).
 * 2. Rastreamento declarativo automático de rotas e transições de página (100% de cobertura).
 * 3. Inicialização e cleanup do observador global de cliques no DOM.
 * 4. Sincronização segura de sessão Supabase (UUID opaco em login, reset total em logout).
 */
export function TelemetryProvider({ children }: { children: React.ReactNode }) {
  const [consent, setConsent] = useState<AnalyticsConsent | null>(() => readAnalyticsConsent());

  // 1. Escuta reativa de consentimento para ativação/desativação imediata dos adaptadores
  useEffect(() => {
    const handleConsent = (nextConsent: AnalyticsConsent) => {
      setConsent(nextConsent);
      if (nextConsent === 'granted') {
        initializePostHog();
        initGa4();
        initClarity();
        initFaro();
      } else {
        disablePostHog();
        disableGa4();
        disableClarity();
        disableFaro();
      }
    };

    // Sincroniza estado inicial no cliente
    const current = readAnalyticsConsent();
    if (current === 'granted') {
      initializePostHog();
      initGa4();
      initClarity();
      initFaro();
    }

    const unsubscribe = onAnalyticsConsentChange(handleConsent);
    return () => {
      unsubscribe();
    };
  }, []);

  // 2. Observador global declarativo de cliques no DOM
  useEffect(() => {
    const teardown = setupDomClickObserver();
    return () => {
      teardown();
    };
  }, []);

  // 3. Sincronização de sessão do Supabase (UUID opaco único, sem dados de perfil ou PII)
  useEffect(() => {
    const supabase = createBrowserSupabase();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        resetProductIdentity();
        Sentry.setUser(null);
      }
      if (session?.user?.id) {
        identifyProductUser(session.user.id);
        Sentry.setUser({ id: session.user.id });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <>
      <Suspense fallback={null}>
        <RouteTransitionTracker consent={consent} />
      </Suspense>
      {children}
    </>
  );
}
