# Bulk product discounts
- [x] Add automatic percentage discounts for all products or selected categories, excluding NÉRA x OhLaLa.
- [x] Save original prices and restore them safely when a sale ends.
- [x] Verify category selection, price previews, sale history, and phone layout without changing live product prices; applying/ending a real sale remains untested.
- [x] Share active sale names and original/discounted prices with the customer app and document its crossed-out-price display; verified anonymously with no live sale, while the separate customer app's UI remains unchanged.

# Drill-bit measurements
- [x] Update field labels and add optional length fields.
- [x] Save numeric millimeter values and display product dimensions.
- [x] Verify fields and product details.
# OhLaLa partner logo
- [x] Add a partner location type and the OhLaLa location.
- [x] Store and display the partner logo on warehouse screens.
- [x] Verify the logo renders in the list and location detail.
# OhLaLa no-discount rule
- [x] Block promo discounts on the OhLaLa category at payment.
- [ ] Customer app note (hide/ignore discount on these items) — waits on user pasting it.
# OhLaLa print report
- [x] Diagnose and correct missing sales in partner reports.
- [x] Add a mobile-safe return action to the print window, hidden on paper.
- [x] Verify the report and return action with saved orders.

# Complete Dashboard statistics
- [x] Remove row-limit truncation from Dashboard statistics and related category drill-downs.
- [x] Test pagination and compare the OhLaLa totals with saved sales: 14 units, 8 products, $247.50 in October.
- [ ] Verify the Dashboard breakdown signed in as a manager — the requesting user's account redirects to Orders; waiting for the intended manager account.

# Category breakdown phone layout
- [x] Keep category totals and per-product sales/profit inside the phone screen without changing data or photos.
- [x] Verify isolated layout at 320px, 390px, and desktop widths with no clipped amounts; live manager-screen check remains blocked by the current account's access above.

# OhLaLa report Print button
- [x] Replace inline report handlers with directly attached Print and Back actions.
- [x] Verify both report options invoke printing and Back closes the report, using saved products in an isolated signed-in report; native iPhone print dialog remains unverified.

# OhLaLa document privacy
- [x] Replace browser-page printing with a generated PDF so browser footers cannot expose the app address.
- [x] Verify both PDF reports contain no app URLs and retain product information and totals; native iPhone printing remains unverified.
