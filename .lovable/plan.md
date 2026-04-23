

## Make audit Entity & Details actually informative

Two problems on `/audit-log`:
1. **Entity column truncates product names** — you can't see what was edited (`Carbide Nail Drill Blt (CADB...`)
2. **Details just says "Updated product"** — doesn't tell you *what* changed (photo? stock? name? category?)

### Fix 1 — Entity column shows full text

`src/pages/AuditLog.tsx`:
- Remove `truncate max-w-[200px]` on the entity label cell. Let it wrap to 2-3 lines instead so the full `name (SKU)` is always readable.
- Same treatment for the Details column: remove `max-w-[400px]` clip, allow wrapping. Keep min-width so the column doesn't get crushed.

### Fix 2 — Detailed change tracking on product update

`src/pages/Products.tsx` — replace the current "price-only diff" logic with a full field-by-field diff before calling `logAudit`. Build a `changes[]` array by comparing `editingProduct` vs `productData`:

| Field changed | Summary fragment |
|---|---|
| `name` | `name "Old" → "New"` |
| `sku` | `SKU OLD → NEW` |
| `category` / `subcategory` / `variant_name` / `bit_type` / `material` / `shape` / `grit` / `direction` / `unit` | `category "Old" → "New"` (etc.) |
| `price_usd` / `salon_price_usd` / `wholesale_price_usd` / `cost_usd` | `price $X → $Y` (already done — keep) |
| `stock_on_hand` | `stock 5 → 12` |
| `reorder_level` | `reorder level 10 → 20` |
| `supplier` / `supplier_sku` | `supplier "Old" → "New"` |
| `is_parent` / `parent_product_id` / `sibling_group_id` | `linked to parent / sibling group` |
| `category_attributes` (JSONB) | `attributes updated` (which keys changed) |
| **New image uploaded** (`imageFiles.length > 0`) | `added N photo(s)` |
| **Existing image removed** (compare `existingImages` length to original) | `removed N photo(s)` |

Final summary becomes e.g.
- `Updated product: price $12.05 → $12.04, added 1 photo`
- `Updated product: name "Carbide" → "Carbide Pro", stock 5 → 12`
- `Updated product: added 2 photo(s)`

If nothing diffs (rare — re-save without changes), keep `Updated product (no field changes)` so it's obvious.

### Fix 3 — Same richer detail for other entities (light pass)

While I'm in there, do the same diff approach for these existing `update` calls so Details is never just "Updated":
- **Salon** (`src/pages/Salons.tsx`) — diff name/address/phone/owner
- **Stock** (`src/components/warehouse/StockActionDialog.tsx`) — already mentions action; add `qty X → Y` and location name
- **Order edits** (`src/components/orders/EditOrderDialog.tsx`) — already mentions total diff; add line-item count change if items added/removed

(Order create/delete and returns already have good summaries — leave alone.)

### Files changed
- `src/pages/AuditLog.tsx` — column wrapping
- `src/pages/Products.tsx` — full diff builder for product update + image add/remove tracking
- `src/pages/Salons.tsx` — diff salon fields
- `src/components/warehouse/StockActionDialog.tsx` — qty/location in summary
- `src/components/orders/EditOrderDialog.tsx` — item count change in summary

### Not touched
- Image rendering / `LazyImage` / thumbnail logic (per project memory rule)
- Database schema, RLS, edge functions — none needed
- The `entity_label` format (kept as `name (SKU)` for products, short order ID for orders)

### Result

After these changes, your screenshot row would read:

> **Entity:** Product · Carbide Nail Drill Bit (CADB033)
> **Details:** Updated product: price $8.50 → $9.00, added 1 photo

Instead of generic "Updated product".

