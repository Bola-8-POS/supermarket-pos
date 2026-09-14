/**
 * Shared demo staff — the ONLY place their names/PINs are defined. `scripts/seed-demo.ts`
 * creates them and `pages/login/DemoLoginHint` displays them. Plain-Node-importable: no
 * React, no Vite env, no path aliases.
 */
// Pins are 6 digits (repeated-digit, easy to read aloud) to satisfy the DB's
// `pin_length` CHECK constraint (LENGTH(pin) = 6, supabase/migrations/20260414000002)
// and domain.ts's PinSchema (`/^\d{6}$/`) — every other profile in this app has a
// 6-digit PIN, and a 4-digit demo PIN fails `ensureStaffAccount`'s profile insert.
export const DEMO_STAFF = [
  { name: 'Ana Admin', role: 'admin', pin: '000000' },
  { name: 'Luis Gerente', role: 'manager', pin: '111111' },
  { name: 'Sofía Cajera', role: 'cashier', pin: '222222' },
] as const satisfies readonly { name: string; role: 'admin' | 'manager' | 'cashier'; pin: string }[];
