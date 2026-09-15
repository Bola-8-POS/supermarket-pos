import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';
import { existsSync, readdirSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import path from 'path';
import { fileURLToPath } from 'url';
import { TEST_LICENSE_PUBLIC_KEY_SPKI } from './e2e/helpers/license-keys';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

// Same agent-browser Chrome discovery as playwright.config.ts — see comment there.
function findAgentBrowserChrome(): string | undefined {
  const browsersDir = path.join(homedir(), '.agent-browser', 'browsers');
  try {
    const highest = readdirSync(browsersDir)
      .filter(entry => entry.startsWith('chrome-'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
      .at(-1);
    if (!highest) return undefined;
    const binaryName = platform() === 'win32' ? 'chrome.exe' : 'chrome';
    const candidate = path.join(browsersDir, highest, binaryName);
    return existsSync(candidate) ? candidate : undefined;
  } catch {
    return undefined;
  }
}

const chromePath = findAgentBrowserChrome();

const fastE2e = process.env.FAST_E2E === '1' || process.env.FAST_E2E === 'true';
const slowMo = fastE2e ? 0 : 400;
const testTimeout = fastE2e ? 45_000 : 60_000;
const webServerTimeout = fastE2e ? 75_000 : 120_000;

/**
 * Hermetic license env: enforcement forced on, a TEST-ONLY signing key (never the real
 * embedded/prod SPKI), and a fake license-server URL that every spec routes with
 * `page.route()` — this suite never talks to a real license server or the POS Supabase DB.
 */
const LICENSE_ENV = {
  VITE_LICENSE_ENFORCE: 'true',
  VITE_LICENSE_PUBLIC_KEY: TEST_LICENSE_PUBLIC_KEY_SPKI,
  VITE_LICENSE_SERVER_URL: 'http://127.0.0.1:1522/__license',
  VITE_LICENSE_SERVER_ANON_KEY: 'e2e-anon',
};

export default defineConfig({
  testDir: './e2e/license',
  outputDir: './e2e-results-license',
  testIgnore: [/\.test\.ts$/],
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 1,
  timeout: testTimeout,
  expect: {
    timeout: fastE2e ? 5_000 : 10_000,
  },
  // Unlike playwright.config.ts, this suite never touches the POS Supabase DB —
  // every license-server call is intercepted via page.route() — so global-setup/
  // global-teardown (which prep/report against that DB) stay off.
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report-license', open: 'never' }],
  ],
  use: {
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    headless: true,
    slowMo,
    actionTimeout: fastE2e ? 10_000 : 15_000,
    navigationTimeout: fastE2e ? 15_000 : 30_000,
    viewport: { width: 1280, height: 800 },
    launchOptions: {
      headless: true,
      slowMo,
    },
  },
  projects: [
    {
      name: 'gate',
      use: {
        baseURL: 'http://localhost:1522',
        launchOptions: chromePath ? { executablePath: chromePath } : {},
      },
      testMatch: /(demo-start|demo-locks|paid-license)\.spec\.ts/,
    },
    {
      name: 'auto-start',
      use: {
        baseURL: 'http://localhost:1523',
        launchOptions: chromePath ? { executablePath: chromePath } : {},
      },
      testMatch: /demo-auto-start\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: 'npx vite --port 1522 --strictPort',
      url: 'http://localhost:1522',
      reuseExistingServer: false,
      timeout: webServerTimeout,
      env: { ...process.env, ...LICENSE_ENV },
    },
    {
      command: 'npx vite --port 1523 --strictPort',
      url: 'http://localhost:1523',
      reuseExistingServer: false,
      timeout: webServerTimeout,
      env: {
        ...process.env,
        ...LICENSE_ENV,
        VITE_LICENSE_SERVER_URL: 'http://127.0.0.1:1523/__license',
        VITE_DEMO_AUTO_START: 'true',
      },
    },
  ],
});
