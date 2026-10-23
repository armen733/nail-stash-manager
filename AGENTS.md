# Project Architecture Rules

- Shipping labels are fetched through the authenticated `shippo-label` function instead of opening Shippo URLs directly, because browser privacy tools can block Shippo-hosted label links.
- Shipping-label authorization uses `public.user_roles`; never authorize from browser state or the legacy profile role alone.
- Confirmation emails resolve photos and SKUs from saved order-item product IDs, with identity-preserving legacy fallbacks, because product names are shared across variants.
- Drill-bit dimensions use category_attributes with the existing diameter key and optional head_length/total_length keys; normalize legacy mm suffixes and decimal commas to preserve measurements when editing.
- Warehouse location logos live in `stock_locations.logo_url` (uploaded to the public `brand-assets` bucket) and render ahead of the type-specific fallback icons; when a new `location_type` value is added, update every location-type union and icon map so no screen renders an undefined icon.
- Undiscountable product categories (currently the partner category "NÉRA x OhLaLa") are enforced server-side in `stripe-hosted-checkout`: the promo discount is limited to the other cart items and tax is recomputed, because partner payouts are calculated on full price.
- Partner sales reports share the inventory analytics status set, including saved manual Draft orders, because those orders already reduce stock on creation.
- Dashboard statistics and category drill-down sale queries use stable ID-ordered pagination through fetchAllRows, because the Data API caps each response at 1,000 rows and silently omits later sales otherwise.
