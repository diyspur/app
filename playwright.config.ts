import { defineConfig, devices } from '@playwright/test';

process.env.QA_SEASON_SLUG = process.env.QA_SEASON_SLUG || 't1-verity';
process.env.QA_BOOK_SLUG = process.env.QA_BOOK_SLUG || 'verity';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000', trace: 'retain-on-failure', ...devices['Desktop Chrome'] },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'npm run dev -- --hostname 127.0.0.1',
        url: 'http://127.0.0.1:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          PROMETHEUS_SCRAPE_TOKEN:
            process.env.PROMETHEUS_SCRAPE_TOKEN || 'diyspur_prometheus_secret_token_change_me',
          NEXT_PUBLIC_POSTHOG_KEY:
            process.env.NEXT_PUBLIC_POSTHOG_KEY || 'phc_test_dummy_key_for_testing',
          NEXT_PUBLIC_POSTHOG_HOST:
            process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
          QA_SEASON_SLUG: process.env.QA_SEASON_SLUG || 't1-verity',
          QA_BOOK_SLUG: process.env.QA_BOOK_SLUG || 'verity',
        },
      },
});

