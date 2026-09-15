import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// supabase.functions.invoke() sends `authorization` + `apikey` + `x-client-info`, so a
// browser preflight needs them allowed explicitly — without this the call fails CORS in
// every web build (useServerTimeDrift then silently disables clock-drift detection).
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }
  return new Response(
    JSON.stringify({ serverTime: new Date().toISOString() }),
    {
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    }
  )
})
