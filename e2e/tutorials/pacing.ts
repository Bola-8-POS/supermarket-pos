import path from 'node:path';

/**
 * Pure pacing/path helpers for the tutorial-video harness. Zero Playwright
 * import — safely importable from Vitest without ever touching a browser.
 */

export const MIN_HOLD_MS = 2000;
export const MAX_HOLD_MS = 4000;
export const RAW_VIDEO_DIR = path.join('e2e-results-tutorials', 'raw');

/**
 * Resolves the post-action hold duration: defaults to 3000ms, clamps any
 * explicit value into the [MIN_HOLD_MS, MAX_HOLD_MS] range.
 */
export function resolveHoldMs(explicitMs?: number): number {
  if (explicitMs === undefined) return 3000;
  if (explicitMs < MIN_HOLD_MS) return MIN_HOLD_MS;
  if (explicitMs > MAX_HOLD_MS) return MAX_HOLD_MS;
  return explicitMs;
}

/**
 * Builds the raw `.webm` output path for a recorded scenario:
 * e2e-results-tutorials/raw/<domain>/<slug>.<locale>.webm
 * where <domain> is the spec file's parent directory name and <slug> is the
 * test title lowercased with non-alphanumeric runs collapsed to a single
 * hyphen (leading/trailing hyphens stripped).
 */
export function buildVideoOutputPath(specFile: string, testTitle: string, locale: string): string {
  const domain = path.basename(path.dirname(specFile));
  const slug = testTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return path.join(RAW_VIDEO_DIR, domain, `${slug}.${locale}.webm`);
}
