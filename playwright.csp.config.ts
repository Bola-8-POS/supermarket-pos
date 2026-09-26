import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

/**
 * Derives the extra `connect-src` origins the local Supabase stack needs
 * under the web build's CSP (`vite.config.ts`'s `preview` header), from
 * `VITE_SUPABASE_URL` rather than a hard-coded host — the local stack may be
 * `127.0.0.1` or `localhost` depending on how it was started, and the
 * committed `WEB_CSP` (what `firebase.json` ships) must never carry either.
 */
function deriveCspExtraConnect(): string {
  const supabaseUrl = process.env['VITE_SUPABASE_URL'];
  if (!supabaseUrl) return '';
  try {
    const parsed = new URL(supabaseUrl);
    const httpOrigin = `${parsed.protocol}//${parsed.host}`;
    const wsScheme = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsOrigin = `${wsScheme}//${parsed.host}`;
    return `${httpOrigin} ${wsOrigin}`;
  } catch {
    return '';
  }
}

const CSP_EXTRA_CONNECT = deriveCspExtraConnect();

export default defineConfig({
  testDir: './e2e',
  testMatch: ['e2e/csp/**/*.spec.ts'],
  // ponytail: routed under artifacts/ (already .gitignore'd) instead of adding
  // a new e2e-results-csp/ entry to .gitignore, which carries unrelated
  // pending changes this suite must not ride along with.
  outputDir: './artifacts/e2e-results-csp',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  globalSetup: path.join(__dirname, 'e2e', 'global-setup.ts'),
  globalTeardown: path.join(__dirname, 'e2e', 'global-teardown.ts'),
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:1525',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
  projects: [{ name: 'chromium', use: {} }],
  webServer: {
    command: 'npm run build:web && npx vite preview --port 1525 --strictPort',
    url: 'http://localhost:1525',
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      ...process.env,
      CSP_EXTRA_CONNECT,
      // A production Vite build (import.meta.env.PROD) defaults license
      // enforcement ON when VITE_LICENSE_ENFORCE is unset (src/shared/lib/
      // license/config.ts), which the dev server this repo's other e2e
      // suites use never hits (PROD is false there). This spec exercises the
      // app/CSP surface, not the license gate — an unrelated concern with
      // its own suite (playwright.license.config.ts) — so it builds with
      // enforcement explicitly off.
      VITE_LICENSE_ENFORCE: 'false',
    },
  },
});
