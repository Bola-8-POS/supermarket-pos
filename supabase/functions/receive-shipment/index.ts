import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.23.8';

const BodySchema = z.object({
  supplierId: z.string().uuid(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().positive().max(9999),
        costPrice: z.number().nonnegative(),
        expiryDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional(),
      })
    )
    .min(1)
    .max(50),
  poId: z.string().uuid().nullable().optional(),
  idempotencyKey: z.string().uuid().optional(),
});
const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST')
    return json(
      { success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'POST required' } },
      405
    );
  const auth = req.headers.get('Authorization');
  if (!auth)
    return json(
      { success: false, error: { code: 'AUTH_REQUIRED', message: 'Not authenticated' } },
      401
    );
  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();
  if (authError || !user)
    return json(
      { success: false, error: { code: 'AUTH_REQUIRED', message: 'Not authenticated' } },
      401
    );
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid shipment request' } },
      400
    );
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error } = await admin.rpc('receive_shipment', {
    p_staff_id: user.id,
    p_supplier_id: parsed.data.supplierId,
    p_items: parsed.data.items.map(item => ({
      product_id: item.productId,
      quantity: item.quantity,
      cost_price: item.costPrice,
      expiry_date: item.expiryDate ?? null,
    })),
    p_po_id: parsed.data.poId ?? null,
    p_idempotency_key: parsed.data.idempotencyKey ?? null,
  });
  if (error || !data?.ok)
    return json(
      {
        success: false,
        error: {
          code: data?.code ?? 'RECEIVE_SHIPMENT_FAILED',
          message: data?.message ?? error?.message ?? 'Shipment could not be received',
        },
      },
      data?.code === 'FORBIDDEN' ? 403 : 400
    );
  return json({ success: true, shipmentId: data.shipmentId, idempotent: data.idempotent });
});
