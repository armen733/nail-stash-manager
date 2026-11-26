# Show bulk-sale prices in the customer app

- Expose only active sale details needed by storefronts: product ID, sale name, discount percentage, original price, and current sale price.
- Keep manager-only sale history and sale controls private; ended sales disappear from the customer feed.
- Add a small customer-app integration guide showing the sale badge, crossed-out original price, and discounted price.
- Verify public read access without creating or changing a real sale.

## Technical notes

Use a read-only database function for active sale rows, granted to anonymous and signed-in shoppers. The separate customer app must add the display code from its own project; this admin app cannot change its interface directly.
