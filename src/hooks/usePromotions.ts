import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const PROMOTIONS_QUERY_KEY = ["promotions"] as const;
export const LOYALTY_SETTINGS_QUERY_KEY = ["loyalty-settings"] as const;

export interface DiscountCode {
  id: string;
  code: string;
  discount_percent: number;
  valid_from: string | null;
  valid_until: string | null;
  max_uses: number | null;
  current_uses: number | null;
  min_order_amount: number | null;
  is_active: boolean | null;
  created_at: string | null;
}

export interface LoyaltyTransaction {
  id: string;
  user_id: string;
  points: number;
  type: string;
  order_id: string | null;
  description: string | null;
  created_at: string | null;
}

export interface UserTier {
  id: string;
  user_id: string;
  current_tier: string | null;
  tier_discount_percent: number | null;
  monthly_spend: number | null;
  spend_month: string | null;
  tier_valid_until: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  loyalty_points: number | null;
}

export interface LoyaltySettings {
  id: string;
  points_per_dollar: number;
  points_required_for_redemption: number;
  redemption_value_usd: number;
}

export interface PromotionsData {
  discountCodes: DiscountCode[];
  loyaltyTransactions: LoyaltyTransaction[];
  userTiers: UserTier[];
  profiles: Profile[];
  loyaltySettings: LoyaltySettings | null;
}

const fetchPromotionsData = async (): Promise<PromotionsData> => {
  const [codesRes, transactionsRes, tiersRes, profilesRes, settingsRes] = await Promise.all([
    supabase.from("discount_codes").select("*").order("created_at", { ascending: false }),
    supabase.from("loyalty_transactions").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.from("user_tiers").select("*").order("updated_at", { ascending: false }),
    supabase.from("profiles").select("id, email, full_name, loyalty_points"),
    supabase.from("loyalty_settings").select("*").limit(1).single(),
  ]);

  if (codesRes.error) throw codesRes.error;
  if (transactionsRes.error) throw transactionsRes.error;
  if (tiersRes.error) throw tiersRes.error;
  if (profilesRes.error) throw profilesRes.error;

  return {
    discountCodes: codesRes.data || [],
    loyaltyTransactions: transactionsRes.data || [],
    userTiers: tiersRes.data || [],
    profiles: profilesRes.data || [],
    loyaltySettings: settingsRes.data || null,
  };
};

export function usePromotions() {
  return useQuery({
    queryKey: PROMOTIONS_QUERY_KEY,
    queryFn: fetchPromotionsData,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes cache
  });
}

export function useDeleteDiscountCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("discount_codes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROMOTIONS_QUERY_KEY });
      toast.success("Discount code deleted");
    },
    onError: (error: any) => {
      toast.error("Error deleting discount code: " + error.message);
    },
  });
}

export function useToggleDiscountCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("discount_codes")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: PROMOTIONS_QUERY_KEY });
      toast.success(`Code ${variables.is_active ? "activated" : "deactivated"}`);
    },
    onError: (error: any) => {
      toast.error("Error updating code: " + error.message);
    },
  });
}

export function useUpdateLoyaltySettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      id, 
      points_per_dollar, 
      points_required_for_redemption, 
      redemption_value_usd 
    }: { 
      id: string; 
      points_per_dollar: number; 
      points_required_for_redemption: number; 
      redemption_value_usd: number;
    }) => {
      const { error } = await supabase
        .from("loyalty_settings")
        .update({
          points_per_dollar,
          points_required_for_redemption,
          redemption_value_usd,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROMOTIONS_QUERY_KEY });
      toast.success("Loyalty settings updated");
    },
    onError: (error: any) => {
      toast.error("Error saving settings: " + error.message);
    },
  });
}
