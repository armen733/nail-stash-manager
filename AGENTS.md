# Project Architecture Rules

- Shipping labels are fetched through the authenticated `shippo-label` function instead of opening Shippo URLs directly, because browser privacy tools can block Shippo-hosted label links.
- Shipping-label authorization uses `public.user_roles`; never authorize from browser state or the legacy profile role alone.
