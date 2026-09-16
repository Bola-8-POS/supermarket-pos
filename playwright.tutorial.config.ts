import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

// Generates comprehensive per-domain tutorial-video recordings for the
// website/user manual. Separate from the CI-critical suite
// (playwright.config.ts) — not run by `npm run test:e2e`. Single worker so
// each spec's video isn't interleaved with unrelated activity. Cloned from
// playwright.training.config.ts with a longer timeout (Plan 34-06's
// full-walkthrough spec has far more steps) and a true HD viewport.
export default defineConfig({
  testDir: './e2e/tutorials',
  outputDir: './e2e-results-tutorials',
  // e2e/tutorials/**/*.test.ts files are plain Vitest unit tests for the
  // harness helpers themselves (pacing.ts/i18n-selectors.ts/locale.ts), not
  // Playwright specs — mirrors playwright.config.ts's own testIgnore entry
  // for the identical reason: loading a file that imports from 'vitest'
  // inside Playwright's test runner throws
  // `Cannot redefine property: Symbol($$jest-matchers-object)` and silently
  // aborts discovery for the entire run.
  testIgnore: [/\.test\.ts$/],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:1520',
    headless: true,
    viewport: { width: 1920, height: 1080 },
    trace: 'off',
    video: {
      mode: 'on',
      size: { width: 1920, height: 1080 },
    },
    screenshot: 'off',
  },
  projects: [{ name: 'chromium', use: {} }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:1520',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
