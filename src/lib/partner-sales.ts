// Manual orders reduce stock when saved, including their initial Draft status.
// Match the sales statuses used by inventory analytics.
export const PARTNER_SALE_STATUSES = ["Draft", "Confirmed", "Shipped", "Delivered", "Paid"] as const;