import { withSentryConfig } from '@sentry/nextjs/config';

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy-Report-Only',
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "img-src 'self' data: blob: https://*.supabase.co https://www.record.com.br https://*.record.com.br https://m.media-amazon.com https://images-na.ssl-images-amazon.com https://*.amazon.com.br https://*.amazon.com https://covers.openlibrary.org https://*.intrinseca.com.br https://loja.intrinseca.com.br https://rocco.com.br https://*.rocco.com.br https://ciadasletras.vtexassets.com https://*.vtexassets.com https://editora34.com.br https://*.editora34.com.br https://harpercollins.com.br https://*.harpercollins.com.br",
      "font-src 'self' data: https://fonts.gstatic.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.posthog.com https://*.sentry.io https://*.ingest.sentry.io https://*.ingest.us.sentry.io",
      "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
      "upgrade-insecure-requests",
    ].join('; '),
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  compress: true,
  reactStrictMode: true,
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'www.record.com.br' },
      { protocol: 'https', hostname: '**.record.com.br' },
      { protocol: 'https', hostname: 'images-na.ssl-images-amazon.com' },
      { protocol: 'https', hostname: 'm.media-amazon.com' },
      { protocol: 'https', hostname: '**.amazon.com.br' },
      { protocol: 'https', hostname: '**.amazon.com' },
      { protocol: 'https', hostname: 'covers.openlibrary.org' },
      { protocol: 'https', hostname: '**.intrinseca.com.br' },
      { protocol: 'https', hostname: 'loja.intrinseca.com.br' },
      { protocol: 'https', hostname: 'rocco.com.br' },
      { protocol: 'https', hostname: '**.rocco.com.br' },
      { protocol: 'https', hostname: 'ciadasletras.vtexassets.com' },
      { protocol: 'https', hostname: '**.vtexassets.com' },
      { protocol: 'https', hostname: 'editora34.com.br' },
      { protocol: 'https', hostname: '**.editora34.com.br' },
      { protocol: 'https', hostname: 'harpercollins.com.br' },
      { protocol: 'https', hostname: '**.harpercollins.com.br' },
    ],
  },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

const isSentryConfigured = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_AUTH_TOKEN);

export default isSentryConfigured
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.CI,
      telemetry: false,
      sourcemaps: { deleteSourcemapsAfterUpload: true },
    })
  : nextConfig;
