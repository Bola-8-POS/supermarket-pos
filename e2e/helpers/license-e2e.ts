import type { Page } from '@playwright/test';
import { decodeTestTokenPayload } from './license-tokens';

const TERMINAL_KEY = 'pos.license.terminal_id';
const STORE_KEY = 'pos.license';

/** Seed the stable per-terminal id the app reads via `getTerminalId()` before first paint. */
export async function seedTerminal(page: Page, terminalId: string): Promise<void> {
  await page.addInitScript(
    ([k, id]) => {
      localStorage.setItem(k, id);
    },
    [TERMINAL_KEY, terminalId] as const
  );
}

/**
 * Seed a signed license token as if `applyToken` had already run. The zustand `persist`
 * store's `payload` (not `token`) is what `evaluateLicense`/`isFeatureEnabled` actually read,
 * so the token is decoded here (Node-side, no signature check needed for a value we trust)
 * and stored alongside it — matching what `applyToken` would have written after verifying it.
 */
export async function seedLicense(
  page: Page,
  terminalId: string,
  token: string,
  licenseKey = 'E2E0-0000-0000-0001'
): Promise<void> {
  await seedTerminal(page, terminalId);
  const payload = decodeTestTokenPayload(token);
  await page.addInitScript(
    ([k, t, key, p]) => {
      localStorage.setItem(
        k,
        JSON.stringify({
          state: {
            token: t,
            payload: p,
            licenseKey: key,
            lastHeartbeatAt: null,
            lastError: null,
            maxSeenNow: 0,
          },
          version: 0,
        })
      );
    },
    [STORE_KEY, token, licenseKey, payload] as const
  );
}

/** Matches both es-MX ("Seguir con la demo") and en-US ("Continue the demo") copy. */
export const CONTINUE_DEMO_RE = /seguir con la demo|continue the demo/i;
