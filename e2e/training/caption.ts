import type { Page } from '@playwright/test';

const BANNER_ID = '__training-caption-banner';

/** Shows an on-screen step caption for the training video, then pauses so it reads clearly. */
export async function caption(page: Page, text: string, pauseMs = 1800): Promise<void> {
  await page.evaluate(
    ({ id, text }) => {
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement('div');
        el.id = id;
        Object.assign(el.style, {
          position: 'fixed',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: '2147483647',
          background: 'rgba(15,23,42,0.92)',
          color: '#fff',
          padding: '10px 22px',
          borderRadius: '10px',
          fontSize: '19px',
          fontWeight: '600',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
          pointerEvents: 'none',
          maxWidth: '85vw',
          textAlign: 'center',
        });
        document.body.appendChild(el);
      }
      el.textContent = text;
    },
    { id: BANNER_ID, text }
  );
  await page.waitForTimeout(pauseMs);
}

/** Removes the caption banner (e.g. before a receipt/summary screenshot beat). */
export async function clearCaption(page: Page): Promise<void> {
  await page.evaluate(id => document.getElementById(id)?.remove(), BANNER_ID);
}
