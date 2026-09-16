import { test as base, expect, type Page } from '@playwright/test';

import { caption } from '../training/caption';
import { buildVideoOutputPath, resolveHoldMs } from './pacing';

export type NarrateFn = (
  page: Page,
  text: string,
  action: () => Promise<void>,
  holdMs?: number
) => Promise<void>;

async function narrate(
  page: Page,
  text: string,
  action: () => Promise<void>,
  holdMs?: number
): Promise<void> {
  await caption(page, text, 800);
  await action();
  await page.waitForTimeout(resolveHoldMs(holdMs));
}

export const test = base.extend<{ narrate: NarrateFn }>({
  // eslint-disable-next-line no-empty-pattern
  page: async ({ page }, use, testInfo) => {
    await use(page);
    const video = page.video();
    if (!video) return;
    // Video.saveAs() "waits until the page is closed and the video is fully
    // saved" (Playwright docs) — the base `page`/`context` fixtures don't
    // close the page until AFTER this fixture's own teardown code returns,
    // so without an explicit close() here saveAs() blocks forever (a real
    // deadlock, not a slow test) until the whole test's global timeout kills
    // it. Close explicitly first so saveAs() can actually resolve.
    await page.close().catch(() => undefined);
    const locale = process.env['TUTORIAL_LOCALE'] ?? 'es-MX';
    await video.saveAs(buildVideoOutputPath(testInfo.file, testInfo.title, locale));
  },
  // eslint-disable-next-line no-empty-pattern
  narrate: async ({}, use) => {
    await use(narrate);
  },
});

export { expect };
