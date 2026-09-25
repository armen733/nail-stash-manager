// Checks USPS tracking (via Shippo) for shipped orders and marks them Delivered.
// Runs on a schedule; safe to call repeatedly.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const token = Deno.env.get('SHIPPO_API_KEY')!
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: orders, error } = await admin
      .from('orders')
      .select('id, status, tracking_number')
      .not('tracking_number', 'is', null)
      .neq('status', 'Delivered')
      .limit(100)
    if (error) throw error

    const results: any[] = []
    for (const o of orders || []) {
      try {
        const res = await fetch(`https://api.goshippo.com/tracks/usps/${encodeURIComponent(o.tracking_number)}`, {
          headers: { Authorization: `ShippoToken ${token}` },
        })
        if (!res.ok) { results.push({ id: o.id, err: res.status }); continue }
        const t = await res.json()
        const s = t?.tracking_status?.status as string | undefined
        let next: string | null = null
        if (s === 'DELIVERED') next = 'Delivered'
        else if ((s === 'TRANSIT' || s === 'PRE_TRANSIT') && o.status !== 'Shipped') next = 'Shipped'
        if (next) await admin.from('orders').update({ status: next }).eq('id', o.id)
        results.push({ id: o.id, usps: s, updated: next })
      } catch (e) {
        results.push({ id: o.id, err: String(e) })
      }
    }
    return new Response(JSON.stringify({ checked: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
