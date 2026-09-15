import { createPrivateKey, sign } from 'node:crypto';
import { TEST_LICENSE_PRIVATE_KEY_PEM } from './license-keys';

const b64url = (b: Buffer) =>
  b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export type TokenOverrides = Partial<{
  plan: 'monthly' | 'yearly' | 'lifetime' | 'demo';
  features: string[] | null;
  period_end: string | null;
  grace_days: number;
  lease_until: string;
  status: 'active' | 'suspended';
}>;

/** Sign a license payload exactly like the server does (raw r||s signature = WebCrypto format). */
export function signTestToken(terminalId: string, overrides: TokenOverrides = {}): string {
  const now = Date.now();
  const payload = {
    v: 1,
    tenant_id: 'e2e-tenant',
    tenant_slug: 'e2e',
    tenant_name: 'E2E Store',
    terminal_id: terminalId,
    plan: 'monthly',
    status: 'active',
    period_end: new Date(now + 30 * 86_400_000).toISOString(),
    grace_days: 7,
    updates_until: null,
    max_terminals: 1,
    features: null,
    issued_at: new Date(now).toISOString(),
    lease_until: new Date(now + 60 * 86_400_000).toISOString(),
    ...overrides,
  };
  const body = Buffer.from(JSON.stringify(payload));
  const sig = sign('sha256', body, {
    key: createPrivateKey(TEST_LICENSE_PRIVATE_KEY_PEM),
    dsaEncoding: 'ieee-p1363',
  });
  return `${b64url(body)}.${b64url(sig)}`;
}

export const demoToken = (terminalId: string, daysLeft = 14) =>
  signTestToken(terminalId, {
    plan: 'demo',
    features: ['promotions', 'purchase_orders'],
    grace_days: 0,
    period_end: new Date(Date.now() + daysLeft * 86_400_000).toISOString(),
    lease_until: new Date(Date.now() + 14 * 86_400_000).toISOString(),
  });

/** Decode the payload half of a token (Node side — mirrors src/shared/lib/license/token.ts::decodeToken). */
export function decodeTestTokenPayload(token: string): Record<string, unknown> {
  const [payloadPart] = token.split('.');
  if (!payloadPart) throw new Error('Malformed test token');
  return JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
}
