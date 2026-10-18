'use client';

import React from 'react';
import { TelemetryProvider } from './telemetry-provider';

/**
 * @deprecated Utilize `TelemetryProvider` de `@/components/analytics/telemetry-provider`.
 * Mantido para retrocompatibilidade com componentes legados.
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return <TelemetryProvider>{children}</TelemetryProvider>;
}

export { TelemetryProvider };
