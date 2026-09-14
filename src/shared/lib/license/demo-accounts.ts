/**
 * Shared demo staff — the ONLY place their names/PINs are defined. `scripts/seed-demo.ts`
 * creates them and `pages/login/DemoLoginHint` displays them. Plain-Node-importable: no
 * React, no Vite env, no path aliases.
 */
export const DEMO_STAFF = [
  { name: 'Ana Admin', role: 'admin', pin: '0000' },
  { name: 'Luis Gerente', role: 'manager', pin: '1111' },
  { name: 'Sofía Cajera', role: 'cashier', pin: '2222' },
] as const satisfies readonly { name: string; role: 'admin' | 'manager' | 'cashier'; pin: string }[];
