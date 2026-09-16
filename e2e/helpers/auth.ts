import { expect, type Page } from '@playwright/test';

const fastE2e = process.env.FAST_E2E === '1' || process.env.FAST_E2E === 'true';

// The app's cold-start locale is es-MX with no English fallback (`fallbackLng: 'es-MX'`),
// so a genuinely fresh session renders Spanish. Staff-picked locale only applies after
// login. These helpers match both locales rather than assuming en-US.
export const WHO_ARE_YOU_RE = /who are you|quién eres/i;
const OPENING_CASH_RE = /opening cash|fondo de caja/i;
const DRAWER_FLOAT_RE = /^(drawer float|fondo de caja)$/i;
const START_SHIFT_RE = /^(start shift|iniciar turno)$/i;
const LOGOUT_RE = /^(logout|cerrar sesión)$/i;
/** Digits 1-9 use aria-label="Key N" in both locales; PINKeypad's "0" key is the
 * one translated string (`pinKeypad.key0`: "Key 0" en-US, "Tecla 0" es-MX). */
const KEY_0_RE = /^(key 0|tecla 0)$/i;

export type StaffRole = 'cashier' | 'manager' | 'admin' | 'kitchen';

function envOrThrow(key: string): string {
  const v = process.env[key];
  if (!v || v.trim() === '') {
    throw new Error(`Missing required env: ${key} (set in bar-pos/.env.local)`);
  }
  return v.trim();
}

export function staffForRole(role: StaffRole): { name: string; pin: string } {
  if (role === 'cashier') {
    // Env var names deliberately unchanged (E2E_BARTENDER_*) — internal-only,
    // never user-visible, avoids a CI secret-store rename (RESEARCH.md Pitfall 5).
    return { name: envOrThrow('E2E_BARTENDER_NAME'), pin: envOrThrow('E2E_BARTENDER_PIN') };
  }
  if (role === 'manager') {
    return { name: envOrThrow('E2E_MANAGER_NAME'), pin: envOrThrow('E2E_MANAGER_PIN') };
  }
  if (role === 'kitchen') {
    return { name: envOrThrow('E2E_KITCHEN_NAME'), pin: envOrThrow('E2E_KITCHEN_PIN') };
  }
  return { name: envOrThrow('E2E_ADMIN_NAME'), pin: envOrThrow('E2E_ADMIN_PIN') };
}

export async function enterPin(page: Page, pin: string): Promise<void> {
  for (const ch of pin) {
    const label = ch === '0' ? KEY_0_RE : `Key ${ch}`;
    await page.getByRole('button', { name: label }).click();
  }
}

/** PIN login for an explicit staff name/PIN (e.g. second bartender). */
export async function loginAsNamed(page: Page, name: string, pin: string): Promise<void> {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: WHO_ARE_YOU_RE })).toBeVisible({
    timeout: fastE2e ? 15_000 : 60_000,
  });
  await page.getByRole('button', { name: new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i') }).click();

  await expect(page.getByRole('heading', { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })).toBeVisible({
    timeout: 15_000,
  });
  await enterPin(page, pin);

  const openingDialog = page.getByRole('alertdialog', { name: OPENING_CASH_RE });
  const opened = await openingDialog
    .waitFor({ state: 'visible', timeout: 8_000 })
    .then(() => true)
    .catch(() => false);

  if (opened) {
    const drawerInput = page.getByLabel(DRAWER_FLOAT_RE);
    await expect(drawerInput).toBeVisible({ timeout: 10_000 });
    await drawerInput.fill('0');
    await page.getByRole('button', { name: START_SHIFT_RE }).click();
  }

  // LoginPage has <Navigate to="/pos"> when isAuthenticated becomes true, which can
  // race with navigate('/home') in PINLoginForm. Accept either landing URL — callers
  // that need a specific page will navigate explicitly afterwards.
  await expect(page).toHaveURL(/\/(home|pos)/, { timeout: fastE2e ? 12_000 : 45_000 });
}

/**
 * PIN login: staff grid → PIN keypad (Key 0–9) → optional opening-cash shift start → /home.
 */
export async function loginAs(page: Page, role: StaffRole): Promise<void> {
  const { name, pin } = staffForRole(role);
  await loginAsNamed(page, name, pin);
}

/**
 * Navigate to a protected route after a fresh login. A full `page.goto()` reload
 * re-mounts the whole SPA and re-restores the Supabase session + persisted staff
 * store from scratch; that restore can occasionally lose the race against
 * ProtectedRoute's first render and bounce to the PIN/staff-picker screen. Retry
 * once — mirrors what a real user does on a stale reload — instead of failing
 * the whole test on a timing hiccup this helper isn't in a position to root-cause
 * deeper without instrumenting the app's hydration internals.
 */
export async function gotoAuthed(page: Page, path: string): Promise<void> {
  await page.goto(path, { timeout: 15_000, waitUntil: 'domcontentloaded' }).catch(() => undefined);

  const bounced = await page
    .getByRole('heading', { name: WHO_ARE_YOU_RE })
    .isVisible()
    .catch(() => false);
  if (!bounced) {
    return;
  }

  await page.goto(path, { timeout: 15_000, waitUntil: 'domcontentloaded' }).catch(() => undefined);
  await expect(page.getByRole('heading', { name: WHO_ARE_YOU_RE })).not.toBeVisible({
    timeout: 5_000,
  });
}

export async function logout(page: Page): Promise<void> {
  // Already logged out (staff picker / PIN screen) — nothing to do.
  const alreadyOnLogin = await page
    .getByRole('heading', { name: WHO_ARE_YOU_RE })
    .isVisible()
    .catch(() => false);
  if (alreadyOnLogin) {
    return;
  }

  // Dismiss any open alert dialog that might block the Logout button
  const alertDialog = page.getByRole('alertdialog');
  const alertDialogVisible = await alertDialog.isVisible().catch(() => false);
  if (alertDialogVisible) {
    await page.keyboard.press('Escape');
    await alertDialog.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => undefined);
  }

  // The AI-assistant side panel is a persistent `dialog` (not `alertdialog`) that can
  // overlay the Logout button — close it explicitly if open. Bounded — never let a
  // stuck click here consume the caller's cleanup-hook budget.
  const assistantCloseBtn = page.getByRole('button', { name: /close assistant|cerrar asistente/i });
  const assistantOpen = await assistantCloseBtn.isVisible().catch(() => false);
  if (assistantOpen) {
    await assistantCloseBtn.click({ timeout: 3_000 }).catch(() => undefined);
  }

  // Logout button only lives on /home. Prefer the in-app "Home" nav link (SPA
  // navigation) over a full page.goto — a full reload re-triggers caja/realtime
  // fetches that can be slow/erroring under test load and has stalled this hook
  // in practice. Fall back to page.goto with an explicit bounded timeout.
  if (!page.url().includes('/home')) {
    const homeLink = page.getByRole('link', { name: 'Home' });
    const homeLinkVisible = await homeLink.isVisible().catch(() => false);
    if (homeLinkVisible) {
      await homeLink.click({ timeout: 5_000 }).catch(() => undefined);
    } else {
      await page.goto('/home', { timeout: 15_000, waitUntil: 'domcontentloaded' }).catch(() => undefined);
    }
  }

  const logoutBtn = page.getByRole('button', { name: LOGOUT_RE });
  const logoutVisible = await logoutBtn
    .waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (!logoutVisible) {
    // Not authenticated / no Logout affordance on this screen — treat as already logged out.
    return;
  }

  await logoutBtn.click({ timeout: 5_000 }).catch(() => undefined);
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 }).catch(() => undefined);
}
