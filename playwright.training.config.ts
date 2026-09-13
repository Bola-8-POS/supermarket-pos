import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

// Generates narrated screen-recording videos for the user manual / training
// deck. Separate from the CI-critical suite (playwright.config.ts) — not run
// by `npm run test:e2e`. Single worker so each spec's video isn't interleaved
// with unrelated activity.
export default defineConfig({
  testDir: './e2e/training',
  outputDir: './e2e-results-training',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:1520',
    headless: true,
    viewport: { width: 1440, height: 900 },
    trace: 'off',
    video: {
      mode: 'on',
      size: { width: 1440, height: 900 },
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
