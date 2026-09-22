// Change the signed-in staff member's own PIN (the forced first-login change).
// Both credential stores are written in one server-side operation with
// compensation, see _shared/credentials.ts.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts'
import { recordAudit } from '../_shared/audit.ts'
import { verifyCaller } from '../_shared/caller.ts'
import { writeCredential } from '../_shared/credentials.ts'

const BodySchema = z.object({
  newPin: z.string().regex(/^\d{6}$/),
  terminalId: z.string().optional(),
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

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const caller = await verifyCaller(req, admin)
  if (!caller.ok) return json({ error: caller.error }, caller.status)

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return json({ error: 'Invalid request' }, 400)
  }
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) return json({ error: 'Invalid request' }, 400)
  const { newPin, terminalId } = parsed.data

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('pin, must_change_pin')
    .eq('id', caller.id)
    .single()
  if (profileError || !profile) return json({ error: 'Insufficient role' }, 403)
  if (newPin === profile.pin) return json({ error: 'SAME_PIN' }, 400)

  // The Auth password is written with the caller's own token (PUT
  // /auth/v1/user): a self update keeps the current session, while an admin
  // update would end every session of the user, including the one making
  // this call. The same token is what the restore step relies on.
  const setPassword = async (_id: string, pin: string) => {
    const resp = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        Authorization: req.headers.get('Authorization')!,
        apikey: Deno.env.get('SUPABASE_ANON_KEY')!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password: pin }),
    })
    if (resp.ok) return { error: null }
    const body = (await resp.json().catch(() => ({}))) as { msg?: string; message?: string }
    return { error: { message: body.msg ?? body.message ?? `auth update failed (${resp.status})` } }
  }

  const result = await writeCredential(
    {
      setPassword,
      updateProfile: async (id, patch) => await admin.from('profiles').update(patch).eq('id', id),
    },
    {
      userId: caller.id,
      previousPin: profile.pin,
      newPin,
      profilePatch: { pin: newPin, must_change_pin: false },
    }
  )

  if (!result.ok) {
    if (result.code === 'AUTH_WRITE_FAILED') return json({ error: result.message }, 400)
    if (result.code === 'COMPENSATED') {
      return json({ error: 'CREDENTIAL_WRITE_FAILED: nothing changed, try again' }, 409)
    }
    await recordAudit(admin, {
      action: 'permission.force_pin_change',
      entityType: 'staff',
      entityId: caller.id,
      before: null,
      after: { partialFailure: true, authUpdateSucceeded: true, profileUpdateFailed: true },
      source: 'edge',
      actorId: caller.id,
      terminalId,
    })
    return json(
      { error: 'PARTIAL_FAILURE: credential changed but staff record failed to sync, contact support' },
      500
    )
  }

  // Same action name clear_must_change_pin records; never the PIN itself.
  await recordAudit(admin, {
    action: 'permission.force_pin_change',
    entityType: 'staff',
    entityId: caller.id,
    before: { must_change_pin: profile.must_change_pin },
    after: { must_change_pin: false },
    source: 'edge',
    actorId: caller.id,
    terminalId,
  })

  return json({ ok: true })
})
