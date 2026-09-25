import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'

const SHIPPO_API = 'https://api.goshippo.com'

function parseAddress(raw: string) {
  // Expect "street, city, ST 12345" (optionally with country at end)
  const parts = (raw || '').split(',').map((p) => p.trim()).filter(Boolean)
  let street1 = parts[0] || ''
  let city = ''
  let state = ''
  let zip = ''
  const tail = parts.slice(1)
  for (const p of tail) {
    const m = p.match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/)
    if (m) { state = m[1].toUpperCase(); zip = m[2]; continue }
    const z = p.match(/^(\d{5}(?:-\d{4})?)$/)
    if (z) { zip = z[1]; continue }
    const st = p.match(/^([A-Za-z]{2})$/)
    if (st && !state) { state = st[1].toUpperCase(); continue }
    if (/^(usa|united states)$/i.test(p)) continue
    if (!city) city = p
    else street1 += `, ${p}`
  }
  return { street1, city, state, zip }
}

async function shippo(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(`${SHIPPO_API}${path}`, {
    ...init,
    headers: {
      Authorization: `ShippoToken ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  const text = await res.text()
  if (!res.ok) {
    console.error(`Shippo ${path} failed [${res.status}]: ${text}`)
    throw new Error(`[${res.status}] ${text}`)
  }
  return text ? JSON.parse(text) : {}
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const token = Deno.env.get('SHIPPO_API_KEY')
    if (!token) throw new Error('Shippo is not configured yet.')

    const authHeader = req.headers.get('Authorization') || ''
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: 'Not signed in' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: staffRole } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id)
      .in('role', ['Owner', 'Sales Rep'])
      .maybeSingle()
    if (!staffRole) {
      return new Response(JSON.stringify({ error: 'Not authorized' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json().catch(() => ({}))
    const action: string = body.action || 'rates'
    const orderId: string = body.order_id

    if (!orderId || typeof orderId !== 'string') {
      return new Response(JSON.stringify({ error: 'order_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: order, error: orderErr } = await admin
      .from('orders')
      .select('id, invoice_number, customer_name, customer_email, customer_phone, customer_address, tracking_number, shipping_label_url')
      .eq('id', orderId)
      .maybeSingle()
    if (orderErr) throw orderErr
    if (!order) throw new Error('Order not found')

    if (action === 'download') {
      if (!order.shipping_label_url) {
        return new Response(JSON.stringify({ error: 'This order does not have a shipping label.' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const labelResponse = await fetch(order.shipping_label_url)
      if (!labelResponse.ok) throw new Error('The shipping label could not be downloaded. Please create a new label.')
      const bytes = new Uint8Array(await labelResponse.arrayBuffer())
      let binary = ''
      for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
      }
      return new Response(JSON.stringify({ pdf_base64: btoa(binary) }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: settings } = await admin.from('shipping_settings').select('*').limit(1).maybeSingle()
    if (!settings || !settings.from_street1 || !settings.from_zip) {
      return new Response(JSON.stringify({ error: 'missing_from_address' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const to = parseAddress(order.customer_address || '')
    if (!to.street1 || !to.zip) {
      return new Response(JSON.stringify({ error: 'missing_to_address' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const addressFrom = {
      name: settings.from_name,
      street1: settings.from_street1,
      city: settings.from_city,
      state: settings.from_state,
      zip: settings.from_zip,
      country: 'US',
      phone: settings.from_phone,
      email: settings.from_email,
    }
    const addressTo = {
      name: order.customer_name || 'Customer',
      street1: to.street1,
      city: to.city,
      state: to.state,
      zip: to.zip,
      country: 'US',
      phone: order.customer_phone || settings.from_phone,
      email: order.customer_email || '',
    }
    const parcels = [{
      length: String(body.length ?? settings.default_length_in),
      width: String(body.width ?? settings.default_width_in),
      height: String(body.height ?? settings.default_height_in),
      distance_unit: 'in',
      weight: String(body.weight_oz ?? settings.default_weight_oz),
      mass_unit: 'oz',
    }]

    if (action === 'rates') {
      const shipment = await shippo('/shipments/', token, {
        method: 'POST',
        body: JSON.stringify({ address_from: addressFrom, address_to: addressTo, parcels, async: false }),
      })
      const rates = (shipment.rates || [])
        .filter((r: any) => /usps/i.test(r.provider))
        .map((r: any) => ({
          object_id: r.object_id,
          provider: r.provider,
          servicelevel: r.servicelevel?.name,
          amount: r.amount,
          currency: r.currency,
          days: r.estimated_days,
        }))
        .sort((a: any, b: any) => Number(a.amount) - Number(b.amount))
      return new Response(JSON.stringify({
        shipment_id: shipment.object_id,
        rates,
        messages: shipment.messages || [],
        test_mode: token.startsWith('shippo_test_'),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'buy') {
      const rateId: string = body.rate_id
      if (!rateId) throw new Error('rate_id is required')
      let tx = await shippo('/transactions/', token, {
        method: 'POST',
        body: JSON.stringify({ rate: rateId, label_file_type: 'PDF_4x6', async: false }),
      })
      // brief poll in case it's still queued
      for (let i = 0; i < 10 && tx.status === 'QUEUED'; i++) {
        await new Promise((r) => setTimeout(r, 1500))
        tx = await shippo(`/transactions/${tx.object_id}`, token)
      }
      if (tx.status !== 'SUCCESS') {
        const msg = (tx.messages || []).map((m: any) => m.text).join('; ') || 'Label purchase failed'
        return new Response(JSON.stringify({ error: msg }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const testMode = token.startsWith('shippo_test_')
      if (!testMode) {
        const { data: cur } = await admin.from('orders').select('status').eq('id', orderId).maybeSingle()
        const markShipped = cur && cur.status !== 'Shipped' && cur.status !== 'Delivered'
        await admin.from('orders').update({
          tracking_number: tx.tracking_number,
          shipping_label_url: tx.label_url,
          ...(markShipped ? { status: 'Shipped' } : {}),
        }).eq('id', orderId)
        if (markShipped) {
          try {
            await admin.functions.invoke('notify-order-shipped', { body: { orderId } })
          } catch (err) { console.error('shipped email failed', err) }
        }
      }

      return new Response(JSON.stringify({
        tracking_number: tx.tracking_number,
        label_url: tx.label_url,
        tracking_url: tx.tracking_url_provider,
        test_mode: testMode,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('shippo-label error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
