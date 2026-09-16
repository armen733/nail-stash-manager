update orders o
set subtotal = round(o.subtotal - o.tax - o.shipping, 2)
where o.stripe_session_id is not null
  and round(o.subtotal - o.tax - o.shipping, 2) = (
    select round(coalesce(sum(oi.line_total),0), 2) from order_items oi where oi.order_id = o.id
  )
  and (o.tax > 0 or o.shipping > 0);