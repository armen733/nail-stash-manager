# Customer app: automatic bulk-sale display

The admin app already changes `products.price_usd` when a bulk sale starts. The customer app should additionally read the active-sale comparison data once when loading its catalog:

```ts
const { data: activeSales, error } = await supabase.rpc(
  "get_active_bulk_product_discounts"
);

if (error) throw error;

const saleByProductId = new Map(
  (activeSales ?? []).map((sale) => [sale.product_id, sale])
);
```

Each row contains:

- `product_id`: match this to the product's real `id`, not its name or SKU.
- `sale_name`: the manager's sale name or reason, such as “Black Friday”.
- `discount_percent`: the percentage off.
- `original_price`: show this crossed out.
- `sale_price`: show this as the current price; it matches `products.price_usd`.

Example product-price rendering:

```tsx
const sale = saleByProductId.get(product.id);

{sale ? (
  <div aria-label={`${sale.sale_name}: ${sale.discount_percent}% off`}>
    <span>{sale.sale_name} · {sale.discount_percent}% off</span>
    <div>
      <s aria-label={`Previous price $${Number(sale.original_price).toFixed(2)}`}>
        ${Number(sale.original_price).toFixed(2)}
      </s>
      <strong aria-label={`Sale price $${Number(sale.sale_price).toFixed(2)}`}>
        ${Number(sale.sale_price).toFixed(2)}
      </strong>
    </div>
  </div>
) : (
  <strong>${Number(product.price_usd).toFixed(2)}</strong>
)}
```

Use the same comparison on product cards and product-detail pages. Keep the cart and checkout at the current `products.price_usd`; do not apply the percentage a second time. No promo code is involved.

When a sale ends, or its product price is later edited manually, that product disappears from this feed and the normal price display returns automatically. NÉRA x OhLaLa never appears in this feed.
