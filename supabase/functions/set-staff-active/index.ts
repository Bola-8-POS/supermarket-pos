// Deactivate or reactivate a staff member. The profile flips through the
// set_staff_active RPC (row lock, last-admin rule, audit row); the Auth user
// is banned or unbanned so the account cannot sign in or refresh a session.
// Deactivate: RPC first, then ban. Activate: unban first, then RPC. Either
// order leaves the account unable to act when the second step fails.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts'
import { recordAudit } from '../_shared/audit.ts'
import { verifyCaller } from '../_shared/caller.ts'

const BodySchema = z.object({
  staffId: z.string().uuid(),
  active: z.boolean(),
  terminalId: z.string().optional(),
})

// Long enough to outlive any session; 'none' lifts it.
const BAN_DURATION = '876000h'

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

const RPC_STATUS: Record<string, number> = { NOT_FOUND: 404, SELF: 400, LAST_ADMIN: 409 }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const caller = await verifyCaller(req, admin)
  if (!caller.ok) return json({ error: caller.error }, caller.status)

  const { data: permission, error: permissionError } = await admin
    .from('role_permissions')
    .select('id')
    .eq('role', caller.role)
    .eq('action', 'manage_staff')
    .maybeSingle()
  if (!permission) {
    console.error(
      'set-staff-active: manage_staff permission refused',
      caller.id,
      permissionError?.message ?? `role ${caller.role} lacks manage_staff`
    )
    return json({ error: 'Insufficient role' }, 403)
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return json({ error: 'Invalid request' }, 400)
  }
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) return json({ error: 'Invalid request' }, 400)
  const { staffId, active, terminalId } = parsed.data

  const setBan = (banned: boolean) =>
    admin.auth.admin.updateUserById(staffId, { ban_duration: banned ? BAN_DURATION : 'none' })
  const flip = () =>
    admin.rpc('set_staff_active', {
      p_staff_id: staffId,
      p_active: active,
      p_actor_id: caller.id,
      p_terminal_id: terminalId ?? null,
    })

  if (active) {
    const { error: unbanError } = await setBan(false)
    if (unbanError) {
      console.error('set-staff-active: sign-in state update failed', unbanError.message)
      return json({ error: 'Sign-in state update failed, retry' }, 500)
    }
  }

  const { data, error: rpcError } = await flip()
  const outcome = (data ?? { ok: false }) as { ok: boolean; code?: string; changed?: boolean }
  if (rpcError || !outcome.ok) {
    if (active) {
      // The record did not flip. When the target is still inactive, put the
      // ban back so the account stays unable to sign in. (A SELF refusal
      // names the active caller, whose ban must not be touched.)
      const { data: target, error: targetError } = await admin.from('profiles').select('is_active').eq('id', staffId).maybeSingle()
      if (targetError) console.error('set-staff-active: target read failed, ban not restored', targetError.message)
      if (target && target.is_active === false) {
        const { error: rebanError } = await setBan(true)
        if (rebanError) console.error('set-staff-active: ban restore failed', rebanError.message)
      }
    }
    if (rpcError) {
      console.error('set-staff-active: staff record update failed', rpcError.message)
      return json({ error: 'Staff record update failed, retry' }, 500)
    }
    return json({ error: outcome.code }, RPC_STATUS[outcome.code ?? ''] ?? 500)
  }

  if (!active) {
    // Runs even when the record was already inactive, so a retry after a
    // partial failure completes the ban.
    const { error: banError } = await setBan(true)
    if (banError) {
      console.error('set-staff-active: sign-in state update failed', banError.message)
      await recordAudit(admin, {
        action: 'staff.deactivate',
        entityType: 'staff',
        entityId: staffId,
        before: null,
        after: { partialFailure: true, profileUpdated: true, signInStateFailed: true },
        source: 'edge',
        actorId: caller.id,
        terminalId,
      })
      return json(
        { error: 'PARTIAL_FAILURE: staff record updated but sign-in state failed to sync, retry' },
        500
      )
    }
  }

  return json({ ok: true, changed: outcome.changed === true })
})
