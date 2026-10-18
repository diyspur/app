import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Sentry from '@sentry/nextjs';
import * as loggerModule from '@/lib/observability/logger';
import * as faroModule from '@/lib/telemetry/faro';
import ErrorPage from '@/app/error';
import GlobalError from '@/app/global-error';
import NotFound from '@/app/not-found';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock('@/lib/telemetry/faro', () => ({
  pushFaroError: vi.fn(),
}));

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useEffect: vi.fn((fn: () => void) => fn()),
  };
});

describe('Error Boundaries and 404 Telemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('app/error.tsx (Route Error Boundary)', () => {
    it('captures route error via Sentry, Faro, and structured logError', () => {
      const logErrorSpy = vi.spyOn(loggerModule, 'logError');
      const resetMock = vi.fn();
      const mockError = new Error('ChunkLoadError: loading chunk failed') as Error & { digest?: string };
      mockError.digest = 'digest-route-123';

      // Render component
      const component = ErrorPage({ error: mockError, reset: resetMock });
      expect(component).toBeDefined();

      // Verify Sentry capture
      expect(Sentry.captureException).toHaveBeenCalledWith(
        mockError,
        expect.objectContaining({
          tags: expect.objectContaining({
            boundary: 'app-route',
          }),
          extra: expect.objectContaining({
            nextDigest: 'digest-route-123',
          }),
        })
      );

      // Verify Faro pushError
      expect(faroModule.pushFaroError).toHaveBeenCalledWith(
        mockError,
        expect.objectContaining({
          boundary: 'app-route',
          nextDigest: 'digest-route-123',
        })
      );

      // Verify structured logger
      expect(logErrorSpy).toHaveBeenCalledWith(
        'app_route_error',
        expect.objectContaining({
          error: mockError,
          boundary: 'app-route',
          error_code: 'digest-route-123',
        })
      );
    });
  });

  describe('app/global-error.tsx (Root Error Boundary)', () => {
    it('captures global error via Sentry, Faro, and structured logError', () => {
      const logErrorSpy = vi.spyOn(loggerModule, 'logError');
      const resetMock = vi.fn();
      const mockError = new Error('Root layout hydration crashed') as Error & { digest?: string };
      mockError.digest = 'global-digest-789';

      const component = GlobalError({ error: mockError, reset: resetMock });
      expect(component).toBeDefined();

      expect(Sentry.captureException).toHaveBeenCalledWith(
        mockError,
        expect.objectContaining({
          tags: expect.objectContaining({
            boundary: 'global',
          }),
          extra: expect.objectContaining({
            nextDigest: 'global-digest-789',
          }),
        })
      );

      expect(faroModule.pushFaroError).toHaveBeenCalledWith(
        mockError,
        expect.objectContaining({
          boundary: 'global',
          nextDigest: 'global-digest-789',
        })
      );

      expect(logErrorSpy).toHaveBeenCalledWith(
        'global_app_error',
        expect.objectContaining({
          error: mockError,
          boundary: 'global',
          error_code: 'global-digest-789',
        })
      );
    });
  });

  describe('app/not-found.tsx (404 Navigation)', () => {
    it('logs informative page_not_found event on render', () => {
      const logInfoSpy = vi.spyOn(loggerModule, 'logInfo');

      const component = NotFound();
      expect(component).toBeDefined();

      expect(logInfoSpy).toHaveBeenCalledWith(
        'page_not_found',
        expect.objectContaining({
          route: 'not_found',
          status_code: 404,
          boundary: 'not-found',
        })
      );
    });
  });
});
