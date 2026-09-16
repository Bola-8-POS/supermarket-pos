import { getServiceClient } from '../helpers/supabase';

/**
 * Seeds a staff member's `profiles.locale` directly via the service-role
 * client (mirrors every other e2e/helpers/supabase.ts setter). Throws BEFORE
 * calling getServiceClient() at all when VITE_SUPABASE_URL doesn't look
 * local — mirrors e2e/global-setup.ts's own localhost-only guard (T-34-02).
 */
export async function seedStaffLocale(staffName: string, locale: 'es-MX' | 'en-US'): Promise<void> {
  const url = process.env['VITE_SUPABASE_URL'] ?? '';
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(url)) {
    throw new Error(
      `seedStaffLocale(${staffName}): refusing to run against a non-local VITE_SUPABASE_URL ("${url}")`
    );
  }

  const admin = getServiceClient();
  const { error } = await admin.from('profiles').update({ locale }).eq('name', staffName);
  if (error) throw new Error(`seedStaffLocale(${staffName}): ${error.message}`);
}

/** Reads TUTORIAL_LOCALE, returning 'en-US' only on an exact match, 'es-MX' otherwise. */
export function currentTutorialLocale(): 'es-MX' | 'en-US' {
  return process.env['TUTORIAL_LOCALE'] === 'en-US' ? 'en-US' : 'es-MX';
}
