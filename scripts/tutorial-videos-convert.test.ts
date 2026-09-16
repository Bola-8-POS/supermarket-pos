import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildFfmpegArgs, OUT_DIR, RAW_DIR, resolveOutputPath } from './tutorial-videos-convert';

describe('resolveOutputPath', () => {
  it('rewrites a RAW_DIR-rooted .webm path to an OUT_DIR-rooted .mp4 path', () => {
    const raw = path.join(RAW_DIR, 'checkout', 'cashier-completes-a-cash-sale.es-MX.webm');
    expect(resolveOutputPath(raw)).toBe(
      path.join(OUT_DIR, 'checkout', 'cashier-completes-a-cash-sale.es-MX.mp4')
    );
  });
});

describe('buildFfmpegArgs', () => {
  it('returns the exact fixed flag array', () => {
    expect(buildFfmpegArgs('in.webm', 'out.mp4')).toEqual([
      '-y',
      '-i',
      'in.webm',
      '-c:v',
      'libx264',
      '-crf',
      '20',
      '-preset',
      'medium',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      'out.mp4',
    ]);
  });
});
