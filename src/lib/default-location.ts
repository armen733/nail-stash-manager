import { supabase } from "@/integrations/supabase/client";

let cachedDefaultLocationId: string | null = null;

/**
 * Returns the id of the default (main) warehouse location.
 * Cached for the session. Falls back to first active warehouse if no default flag is set.
 */
export async function getDefaultLocationId(): Promise<string | null> {
  if (cachedDefaultLocationId) return cachedDefaultLocationId;

  const { data: defaultLoc } = await supabase
    .from("stock_locations")
    .select("id")
    .eq("is_default", true)
    .eq("is_active", true)
    .maybeSingle();

  if (defaultLoc?.id) {
    cachedDefaultLocationId = defaultLoc.id;
    return defaultLoc.id;
  }

  // Fallback: any active warehouse-type location
  const { data: anyWh } = await supabase
    .from("stock_locations")
    .select("id")
    .eq("type", "warehouse")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  cachedDefaultLocationId = anyWh?.id ?? null;
  return cachedDefaultLocationId;
}

export function clearDefaultLocationCache() {
  cachedDefaultLocationId = null;
}
