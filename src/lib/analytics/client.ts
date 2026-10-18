'use client';

import posthog from 'posthog-js';
import { hasAnalyticsConsent } from './consent';
import type { AnalyticsEvent } from './events';
import { sanitizeAnalyticsProperties } from './events';

let initialized = false;

export function initializePostHog(): boolean {
  if (typeof window === 'undefined' || !hasAnalyticsConsent()) return false;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!key || !host) return false;

  try {
    if (!initialized) {
      posthog.init(key, {
        api_host: host,
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        respect_dnt: true,
        opt_out_capturing_by_default: true,
        person_profiles: 'identified_only',
      });
      posthog.opt_in_capturing();
      initialized = true;
    } else {
      posthog.opt_in_capturing();
    }
    return true;
  } catch {
    return false;
  }
}

export function disablePostHog(): void {
  try {
    if (initialized) {
      posthog.opt_out_capturing();
    }
  } catch {
    // Fail-safe
  }
}

export function captureAnalyticsEvent(
  event: AnalyticsEvent,
  properties: Record<string, string | number | boolean> = {},
): void {
  if (!initialized || !hasAnalyticsConsent()) return;
  try {
    posthog.capture(event, sanitizeAnalyticsProperties(event, properties));
  } catch {
    // Isolamento de erros: posthog nunca deve quebrar o fluxo do app
  }
}

export function identifyAnalyticsUser(userId: string): void {
  if (!initialized || !hasAnalyticsConsent()) return;
  try {
    posthog.identify(userId);
  } catch {
    // Fail-safe
  }
}

export function resetAnalyticsIdentity(): void {
  try {
    if (initialized) posthog.reset();
  } catch {
    // Fail-safe
  }
}

export function isPostHogInitialized(): boolean {
  return initialized && hasAnalyticsConsent();
}

export function resetPostHogForTesting(): void {
  initialized = false;
}
