import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';
import { existsSync, readdirSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import path from 'path';
import { fileURLToPath } from 'url';

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

/**
 * OPT-IN live-integration check — the one Task 14 exception to this repo's hermetic
 * license e2e (`playwright.license.config.ts`). This suite makes REAL network calls to a
 * REAL local license-server stack (Supabase + `functions serve`) in `pos-license-server`
 * — no `page.route()` mocking anywhere in `e2e/license-live/`. It never runs in CI and is
 * not part of `npm run test:e2e`; it exists to catch integration bugs the hermetic suite's
 * mocks can't (real edge-function behavior, real Postgres RLS/constraints, real signed
 * tokens from the real local signing key).
 *
 * Before running (`npm run test:e2e:license:live`):
 *   1. Start the local license-server stack: `cd D:\Projects\Code\pos-license-server && npx supabase start`
 *   2. Start its edge functions: `cd D:\Projects\Code\pos-license-server && supabase functions serve --env-file supabase/functions/.env --no-verify-jwt`
 *   3. Export the two local keys this config reads (from the license-server repo, read-only):
 *        `cd D:\Projects\Code\pos-license-server && npx supabase status -o env`
 *      then, in the shell that runs the test:
 *        PowerShell:  $env:LICENSE_LOCAL_ANON_KEY='<ANON_KEY>'; $env:LICENSE_LOCAL_SERVICE_ROLE_KEY='<SERVICE_ROLE_KEY>'
 *        bash:        export LICENSE_LOCAL_ANON_KEY='<ANON_KEY>' LICENSE_LOCAL_SERVICE_ROLE_KEY='<SERVICE_ROLE_KEY>'
 *   4. `npm run test:e2e:license:live` (from this worktree)
 *
 * `LICENSE_LOCAL_SERVICE_ROLE_KEY` isn't consumed here — the spec file reads it directly
 * from `process.env` for its server-side REST proof (Node context, not the browser build).
 *
 * No `VITE_LICENSE_PUBLIC_KEY` override: the embedded key in
 * `src/shared/lib/license/public-key.ts` already matches the local signing key
 * (verified in Task 11), so real tokens from the local `functions serve` verify as-is.
 */
const anonKey = process.env.LICENSE_LOCAL_ANON_KEY?.trim();
if (!anonKey) {
  // ponytail: fail soft, not silent — a clear console warning plus zero matched tests
  // beats either crashing the whole config or (worse) a false green from tests that
  // never actually ran. Fix by exporting LICENSE_LOCAL_ANON_KEY per the header comment.
  console.warn(
    '[playwright.license-live.config] LICENSE_LOCAL_ANON_KEY is not set — running nothing. ' +
      'Export it from `npx supabase status -o env` in D:\\Projects\\Code\\pos-license-server.'
  );
}

export default defineConfig({
  testDir: './e2e/license-live',
  outputDir: './e2e-results-license-live',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report-license-live', open: 'never' }],
  ],
  use: {
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    headless: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    viewport: { width: 1280, height: 800 },
    baseURL: 'http://localhost:1524',
    launchOptions: chromePath ? { executablePath: chromePath } : {},
  },
  projects: [
    {
      name: 'live',
      // No matching spec when the required key is missing — "running nothing" rather
      // than a hard config-load failure (the operator may just be browsing the repo).
      testMatch: anonKey ? /demo-lifecycle\.spec\.ts/ : /$never-matches^/,
    },
  ],
  webServer: {
    command: 'npx vite --port 1524 --strictPort',
    url: 'http://localhost:1524',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      VITE_LICENSE_ENFORCE: 'true',
      VITE_LICENSE_SERVER_URL: 'http://127.0.0.1:55321',
      VITE_LICENSE_SERVER_ANON_KEY: anonKey ?? '',
    },
  },
});
