import { supabase } from "@/integrations/supabase/client";

/** Latest recorded partner payout; sales on orders created after paid_at are unpaid. */
export async function getLastPartnerPayout(locationId: string) {
  const { data } = await supabase
    .from("partner_payouts")
    .select("paid_at, period_end")
    .eq("location_id", locationId)
    .order("paid_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { paid_at: string; period_end: string } | null) ?? null;
}
