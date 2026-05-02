# Highlight Customer-App Orders in Green

Make orders that came from the customer app visually distinct in the orders list, so you can spot them instantly while scrolling.

## How we detect them

Customer-app orders have `created_by IS NULL` in the database (they're inserted anonymously / by the customer's session, not by a logged-in admin). Admin-created orders always have `created_by` set to the staff user's ID. This is already returned by the existing `select("*")` query — no DB changes needed.

## Visual treatment

For both the **Active** and **Completed** order card lists in `src/pages/Orders.tsx`:

- **Left border:** 4px emerald-500 accent stripe down the left side of the card
- **Background:** subtle emerald tint (`bg-emerald-500/5`, slightly stronger in dark mode)
- **Hover:** slightly deeper emerald tint
- **Badge:** small "Customer App" pill next to the customer name (emerald colored), so it's labeled, not just colored

Admin-created orders keep their current neutral look — no change.

```text
┌─────────────────────────────────┐
│▌ Ling Chen  [Customer App]  4/30│  ← green stripe + tint + badge
│▌ Confirmed › Shipped › Delivered│
│▌ Carbide Nail Drill Bit × 2     │
│▌ $75.00          [Print][Share] │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│  Lily's Salon              4/29 │  ← unchanged (admin-created)
│  Confirmed                      │
│  $120.00         [Print][Share] │
└─────────────────────────────────┘
```

## Files to change

- `src/pages/Orders.tsx` — both the active orders map (~line 2376) and completed orders map (~line 2527): wrap the `Card` className with conditional emerald styling when `!order.created_by`, and add the small badge next to the customer name.

That's it. No schema change, no new query, no impact on any other page.
