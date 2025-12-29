import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CategoryVariantType {
  id: string;
  category: string;
  variant_type: string;
  display_order: number;
  created_at: string;
}

export const CATEGORY_VARIANT_TYPES_QUERY_KEY = ["category_variant_types"] as const;

const fetchCategoryVariantTypes = async (): Promise<CategoryVariantType[]> => {
  const { data, error } = await supabase
    .from("category_variant_types")
    .select("*")
    .order("category")
    .order("display_order");

  if (error) throw error;
  return (data || []) as CategoryVariantType[];
};

export function useCategoryVariantTypes() {
  return useQuery({
    queryKey: CATEGORY_VARIANT_TYPES_QUERY_KEY,
    queryFn: fetchCategoryVariantTypes,
    staleTime: 1000 * 60 * 30, // 30 minutes - this data rarely changes
  });
}

// Helper to get unique categories from the mapping
export function getCategories(data: CategoryVariantType[]): string[] {
  const categories = data.map(item => item.category);
  return Array.from(new Set(categories)).sort();
}

// Helper to get variant types for a specific category
export function getVariantTypesForCategory(data: CategoryVariantType[], category: string): string[] {
  if (!category || category === "all") {
    const allTypes = data.map(item => item.variant_type);
    return Array.from(new Set(allTypes)).sort();
  }
  
  return data
    .filter(item => item.category === category)
    .sort((a, b) => a.display_order - b.display_order)
    .map(item => item.variant_type);
}
