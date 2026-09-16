import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getServiceClient } from '../helpers/supabase';

vi.mock('../helpers/supabase', () => ({
  getServiceClient: vi.fn(),
}));

function mockChain(result: { error: { message: string } | null }) {
  const eq = vi.fn().mockResolvedValue(result);
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ update });
  return { from, update, eq };
}

describe('seedStaffLocale', () => {
  beforeEach(() => {
    vi.mocked(getServiceClient).mockReset();
    process.env['VITE_SUPABASE_URL'] = 'http://127.0.0.1:55321';
  });

  it('calls update/eq with the locale and staff name against a local URL', async () => {
    const { seedStaffLocale } = await import('./locale');
    const chain = mockChain({ error: null });
    vi.mocked(getServiceClient).mockReturnValue(chain as never);

    await seedStaffLocale('Ana Admin', 'en-US');

    expect(chain.from).toHaveBeenCalledWith('profiles');
    expect(chain.update).toHaveBeenCalledWith({ locale: 'en-US' });
    expect(chain.eq).toHaveBeenCalledWith('name', 'Ana Admin');
  });

  it('rejects with a message containing the underlying error text', async () => {
    const { seedStaffLocale } = await import('./locale');
    const chain = mockChain({ error: { message: 'boom' } });
    vi.mocked(getServiceClient).mockReturnValue(chain as never);

    await expect(seedStaffLocale('Ana Admin', 'en-US')).rejects.toThrow(/boom/);
  });

  it('rejects without calling getServiceClient for a non-local URL', async () => {
    const { seedStaffLocale } = await import('./locale');
    process.env['VITE_SUPABASE_URL'] = 'https://example.supabase.co';

    await expect(seedStaffLocale('Ana Admin', 'en-US')).rejects.toThrow();
    expect(getServiceClient).not.toHaveBeenCalled();
  });
});
