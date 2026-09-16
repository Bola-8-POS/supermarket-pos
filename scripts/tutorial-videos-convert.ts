import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { globSync } from 'glob';

export const RAW_DIR = 'e2e-results-tutorials/raw';
export const OUT_DIR = 'tutorial-videos';

/** Given a path under RAW_DIR, returns the same relative path rooted at OUT_DIR with .webm -> .mp4. */
export function resolveOutputPath(rawWebmPath: string): string {
  const rel = path.relative(RAW_DIR, rawWebmPath).replace(/\.webm$/, '.mp4');
  return path.join(OUT_DIR, rel);
}

/** Fixed ffmpeg flag set: libx264/aac, web-embeddable (+faststart), broad-compat pix_fmt. */
export function buildFfmpegArgs(input: string, output: string): string[] {
  return [
    '-y',
    '-i',
    input,
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
    output,
  ];
}

function main(): void {
  const rawFiles = globSync(`${RAW_DIR}/**/*.webm`);
  if (rawFiles.length === 0) {
    console.error(`No .webm files found under ${RAW_DIR} — did the recording run first?`);
    process.exit(1);
  }

  for (const raw of rawFiles) {
    const out = resolveOutputPath(raw);
    mkdirSync(path.dirname(out), { recursive: true });
    console.log(`Converting ${raw} -> ${out}`);
    execFileSync('ffmpeg', buildFfmpegArgs(raw, out), { stdio: 'inherit' });
  }
  console.log(`Converted ${rawFiles.length} video(s) into ${OUT_DIR}/`);
}

// pathToFileURL (not a literal `file://${process.argv[1]}` template) so this
// guard matches correctly on Windows, where process.argv[1] uses backslashes
// and import.meta.url is a proper file:/// URL with forward slashes.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
