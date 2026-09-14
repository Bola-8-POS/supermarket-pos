import { describe, expect, it } from 'vitest';
import { FEATURE_KEYS, isFeatureEnabled } from './features';
import type { LicensePayload } from './types';

const base: LicensePayload = {
  v: 1, tenant_id: 't', tenant_slug: 's', tenant_name: 'n', terminal_id: 'x', plan: 'monthly',
  status: 'active', period_end: null, grace_days: 0, updates_until: null, max_terminals: 1,
  issued_at: '2026-09-14T00:00:00Z', lease_until: '2026-11-14T00:00:00Z',
};

describe('isFeatureEnabled', () => {
  it('is always true when enforcement is off', () => {
    expect(isFeatureEnabled('report_export', null, false)).toBe(true);
    expect(isFeatureEnabled('report_export', { ...base, features: [] }, false)).toBe(true);
  });
  it('is false with no payload when enforced', () => {
    expect(isFeatureEnabled('report_export', null, true)).toBe(false);
  });
  it('treats absent/null features as unlimited', () => {
    for (const key of FEATURE_KEYS) {
      expect(isFeatureEnabled(key, base, true)).toBe(true);
      expect(isFeatureEnabled(key, { ...base, features: null }, true)).toBe(true);
    }
  });
  it('allows only listed keys when features is an array (fail closed)', () => {
    const demo: LicensePayload = { ...base, plan: 'demo', features: ['promotions', 'unknown_key'] };
    expect(isFeatureEnabled('promotions', demo, true)).toBe(true);
    expect(isFeatureEnabled('report_export', demo, true)).toBe(false);
    expect(isFeatureEnabled('purchase_orders', demo, true)).toBe(false);
  });
});
