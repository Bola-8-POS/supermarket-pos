// Staff sign-in: exchanges a staff id and PIN for a session.
// The caller sends no user token (nobody is signed in yet); the function
// looks the account up with the service role and signs in on the caller's
// behalf, with attempt limiting shared with the in-app PIN checks (Task 2's
// pin_attempt_begin, pin_attempt_retry_after and pin_attempt_record).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts'

const BodySchema = z.object({
  staffId: z.string().uuid(),
  pin: z.string().regex(/^\d{6}$/),
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'INVALID_REQUEST' }, 405)

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return json({ error: 'INVALID_REQUEST' }, 400)
  }
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) return json({ error: 'INVALID_REQUEST' }, 400)
  const { staffId, pin } = parsed.data

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const noSession = { auth: { persistSession: false, autoRefreshToken: false } }
  const admin = createClient(supabaseUrl, serviceRoleKey, noSession)

  // Keyed per staff member and caller address, so one network cannot lock a
  // staff member out for another.
  const address = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  const key = `login:${staffId}:${address}`

  // Serialized per key: counts this attempt up front (returns 0) or refuses
  // it outright when already locked (returns the seconds still locked,
  // without counting it again). This is what keeps a parallel burst from
  // exceeding the attempt budget.
  const { data: began, error: beginError } = await admin.rpc('pin_attempt_begin', { p_key: key })
  if (beginError) {
    console.error('staff-sign-in: attempt lookup failed', beginError.message)
    return json({ error: 'UNAVAILABLE' }, 503)
  }
  if (typeof began === 'number' && began > 0) return json({ error: 'LOCKED', retryAfter: began }, 429)

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('email, is_active, must_change_pin')
    .eq('id', staffId)
    .maybeSingle()
  if (profileError) {
    console.error('staff-sign-in: profile lookup failed', profileError.message)
    return json({ error: 'UNAVAILABLE' }, 503)
  }

  let session: { access_token: string; refresh_token: string } | null = null
  if (profile?.is_active && profile.email) {
    const signedOut = createClient(supabaseUrl, anonKey, noSession)
    const { data, error } = await signedOut.auth.signInWithPassword({ email: profile.email, password: pin })
    if (error && error.status !== 400) {
      // Not a credential failure (rate limit, outage). The attempt stays counted.
      console.error('staff-sign-in: auth service error', error.status)
      return json({ error: 'UNAVAILABLE' }, 503)
    }
    session = data.session
  }

  if (!session) {
    // The attempt was already counted by pin_attempt_begin above; read the
    // lock now in force instead of recording a second failure.
    const { data: wait } = await admin.rpc('pin_attempt_retry_after', { p_key: key })
    return json({ error: 'INVALID_CREDENTIALS', retryAfter: typeof wait === 'number' ? wait : 0 }, 401)
  }

  await admin.rpc('pin_attempt_record', { p_key: key, p_success: true })
  return json({
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    mustChangePin: profile?.must_change_pin === true,
  })
})
