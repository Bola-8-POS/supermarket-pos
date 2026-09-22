// Deno runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts'
import { recordAudit } from '../_shared/audit.ts'
import { verifyCaller } from '../_shared/caller.ts'
import { writeCredential } from '../_shared/credentials.ts'

const BodySchema = z.object({
  targetStaffId: z.string().uuid(),
  newPin: z.string().regex(/^\d{6}$/),
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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // Single admin client, reused for the caller check, target lookup and the
  // credential write below — don't construct two.
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

  const caller = await verifyCaller(req, supabaseAdmin)
  if (!caller.ok) return json({ error: caller.error }, caller.status)

  // D-01: single-stage, admin-only gate — stricter than create-staff's
  // ['admin','manager'] gate, deliberately, since this is a live-credential
  // overwrite on an existing account, not account creation.
  if (caller.role !== 'admin') return json({ error: 'Insufficient role' }, 403)

  let bodyJson: unknown
  try {
    bodyJson = await req.json()
  } catch {
    return json({ error: 'Invalid request' }, 400)
  }

  const parsed = BodySchema.safeParse(bodyJson)
  if (!parsed.success) return json({ error: 'Invalid request' }, 400)
  const { targetStaffId, newPin } = parsed.data

  // D-06: target must exist and be active. No self-target special-case
  // anywhere in this function (D-08) — targetStaffId === caller.id is an
  // ordinary case, identical code path.
  const { data: targetProfile, error: targetLookupError } = await supabaseAdmin
    .from('profiles')
    .select('id, name, is_active, pin')
    .eq('id', targetStaffId)
    .single()

  if (targetLookupError || !targetProfile) return json({ error: 'Staff member not found' }, 404)
  if (!targetProfile.is_active) return json({ error: 'Staff member is inactive' }, 400)

  // Both credential stores in one operation: Auth first, then the profile;
  // the previous Auth password is restored when the profile write fails.
  const result = await writeCredential(
    {
      setPassword: (id, pin) => supabaseAdmin.auth.admin.updateUserById(id, { password: pin }),
      updateProfile: async (id, patch) => await supabaseAdmin.from('profiles').update(patch).eq('id', id),
    },
    {
      userId: targetStaffId,
      previousPin: targetProfile.pin,
      newPin,
      profilePatch: { pin: newPin, must_change_pin: true },
    }
  )

  if (!result.ok) {
    if (result.code === 'AUTH_WRITE_FAILED') return json({ error: result.message }, 400)
    if (result.code === 'COMPENSATED') {
      return json({ error: 'CREDENTIAL_WRITE_FAILED: nothing changed, try again' }, 409)
    }
    // The two credential stores diverged and the restore did not land:
    // surface a distinct, loud error and record the divergence.
    await recordAudit(supabaseAdmin, {
      action: 'permission.admin_pin_reset',
      entityType: 'staff',
      entityId: targetStaffId,
      before: null,
      after: { partialFailure: true, authUpdateSucceeded: true, profileUpdateFailed: true },
      source: 'edge',
      actorId: caller.id,
    })
    return json(
      {
        error:
          'PARTIAL_FAILURE: credential changed but staff record failed to sync — contact support before this staff member logs in',
      },
      500
    )
  }

  await recordAudit(supabaseAdmin, {
    action: 'permission.admin_pin_reset',
    entityType: 'staff',
    entityId: targetStaffId,
    before: null,
    after: { mustChangePin: true }, // never log the raw newPin
    source: 'edge',
    actorId: caller.id, // unlike create-staff's null — actor is known and distinct from target here
  })

  return json({ id: targetProfile.id, name: targetProfile.name })
})
