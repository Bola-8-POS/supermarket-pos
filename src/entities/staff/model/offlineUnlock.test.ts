import { beforeEach, describe, expect, it } from 'vitest';
import { checkOfflineUnlock, clearOfflineUnlock, rememberOfflineUnlock } from './offlineUnlock';

describe('offlineUnlock', () => {
  beforeEach(() => {
    clearOfflineUnlock();
  });

  it('accepts only the remembered staff member with the remembered PIN', async () => {
    await rememberOfflineUnlock('staff-a', '246810');
    expect(await checkOfflineUnlock('staff-a', '246810')).toBe(true);
    expect(await checkOfflineUnlock('staff-a', '246811')).toBe(false);
    expect(await checkOfflineUnlock('staff-b', '246810')).toBe(false);
  });

  it('accepts nothing before remember and after clear', async () => {
    expect(await checkOfflineUnlock('staff-a', '246810')).toBe(false);
    await rememberOfflineUnlock('staff-a', '246810');
    clearOfflineUnlock();
    expect(await checkOfflineUnlock('staff-a', '246810')).toBe(false);
  });
});
