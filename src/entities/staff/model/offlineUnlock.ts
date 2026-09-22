/**
 * Offline unlock for the signed-in staff member only.
 *
 * PIN checks run on the server. When the terminal is offline the idle lock
 * would otherwise be impossible to open, so the PIN typed at sign-in is kept
 * as a salted PBKDF2 hash, in memory only (never persisted; gone after a
 * restart, after which unlocking needs a connection).
 */
const ITERATIONS = 310_000;

let remembered: { staffId: string; salt: Uint8Array; hash: string } | null = null;

async function derive(pin: string, salt: Uint8Array): Promise<string> {
  // eslint-disable-next-line i18next/no-literal-string -- WebCrypto key format/algorithm names
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    // eslint-disable-next-line i18next/no-literal-string -- WebCrypto algorithm names
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    material,
    256
  );
  return Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, '0')).join('');
}

export async function rememberOfflineUnlock(staffId: string, pin: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  remembered = { staffId, salt, hash: await derive(pin, salt) };
}

export async function checkOfflineUnlock(staffId: string, pin: string): Promise<boolean> {
  if (!remembered || remembered.staffId !== staffId) return false;
  return (await derive(pin, remembered.salt)) === remembered.hash;
}

export function clearOfflineUnlock(): void {
  remembered = null;
}
