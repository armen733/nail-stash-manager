# Bulk product discounts

- Add a **Bulk discount** action on the Products page.
- Choose **All products** or one or more categories, enter a percentage, and preview affected products and old/new prices.
- Exclude **NÉRA x OhLaLa** always, including when “All products” is selected.
- Apply discounts directly to product selling prices so the separate customer website uses the reduced prices automatically.
- Save each product’s original price and show active/past sales in the manager app.
- Add **End sale & restore prices**; never overwrite a price that was manually changed after the sale started.
- Apply and restore through owner-checked database operations so bulk changes cannot partially run or be used by customer accounts.

## Technical details

- Add owner-only bulk-sale and saved-price tables plus transactional apply/end functions.
- Add a focused `BulkDiscountDialog` component and wire it into the existing Products bulk-action area.
- Add small tests for price rounding, category targeting, partner exclusion, and safe restoration.
- Verify the manager flow in the preview without starting a real sale or changing live product prices.
