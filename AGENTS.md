# Project Architecture Rules

- Shipping labels are fetched through the authenticated `shippo-label` function instead of opening Shippo URLs directly, because browser privacy tools can block Shippo-hosted label links.
- Shipping-label authorization uses `public.user_roles`; never authorize from browser state or the legacy profile role alone.
- Confirmation emails resolve photos and SKUs from saved order-item product IDs, with identity-preserving legacy fallbacks, because product names are shared across variants.
- Drill-bit dimensions use category_attributes with the existing diameter key and optional head_length/total_length keys; normalize legacy mm suffixes and decimal commas to preserve measurements when editing.
