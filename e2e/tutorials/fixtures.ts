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
    const locale = process.env['TUTORIAL_LOCALE'] ?? 'es-MX';
    await video.saveAs(buildVideoOutputPath(testInfo.file, testInfo.title, locale));
  },
  // eslint-disable-next-line no-empty-pattern
  narrate: async ({}, use) => {
    await use(narrate);
  },
});

export { expect };
