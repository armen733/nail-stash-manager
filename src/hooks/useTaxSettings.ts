import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TaxSettings {
  id: string;
  tax_rate: number;
  tax_name: string;
  is_active: boolean;
}

export function useTaxSettings() {
  const [taxSettings, setTaxSettings] = useState<TaxSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchTaxSettings = async () => {
    const { data, error } = await supabase
      .from("tax_settings")
      .select("*")
      .limit(1)
      .single();

    if (!error && data) {
      setTaxSettings(data as TaxSettings);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTaxSettings();
  }, []);

  const taxRate = taxSettings?.is_active ? (taxSettings?.tax_rate ?? 0) : 0;

  const calculateTax = (subtotal: number) => {
    return subtotal * (taxRate / 100);
  };

  const updateTaxSettings = async (updates: Partial<Pick<TaxSettings, 'tax_rate' | 'tax_name' | 'is_active'>>) => {
    if (!taxSettings) return;
    const { error } = await supabase
      .from("tax_settings")
      .update(updates)
      .eq("id", taxSettings.id);

    if (!error) {
      setTaxSettings({ ...taxSettings, ...updates });
    }
    return { error };
  };

  return { taxSettings, taxRate, calculateTax, updateTaxSettings, loading, refetch: fetchTaxSettings };
}
