import { err, ok, type Result } from './result';

export const TERMINAL_ID_STORAGE_KEY = 'pos.terminal_id';
export const TERMINAL_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
export const DEFAULT_TERMINAL_ID = 'POS-1';

function readStored(): string | null {
  try {
    const v = localStorage.getItem(TERMINAL_ID_STORAGE_KEY);
    return v && TERMINAL_ID_PATTERN.test(v) ? v : null;
  } catch {
    return null;
  }
}

/** Per-install terminal identity: Settings → Hardware (localStorage) → VITE_TERMINAL_ID → POS-1. */
export function getTerminalId(): string {
  const stored = readStored();
  if (stored) return stored;
  const env = (import.meta.env.VITE_TERMINAL_ID as string | undefined)?.trim();
  return env && TERMINAL_ID_PATTERN.test(env) ? env : DEFAULT_TERMINAL_ID;
}

export function setTerminalId(raw: string): Result<void> {
  const id = raw.trim();
  if (!TERMINAL_ID_PATTERN.test(id)) {
    return err({
      code: 'VALIDATION_ERROR',
      message: 'Terminal id must be 1-32 chars: letters, digits, _ or -',
    });
  }
  try {
    localStorage.setItem(TERMINAL_ID_STORAGE_KEY, id);
  } catch {
    /* ponytail: localStorage unavailable — value stays env/default for this session */
  }
  return ok(undefined);
}
