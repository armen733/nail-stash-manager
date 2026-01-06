import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CategoryFieldConfig {
  id: string;
  category: string;
  field_name: string;
  field_label: string;
  field_type: "text" | "number" | "select" | "textarea";
  options: string[] | null;
  is_required: boolean;
  display_order: number;
  placeholder: string | null;
  created_at: string;
  updated_at: string;
}

export const CATEGORY_FIELD_CONFIGS_QUERY_KEY = ["category_field_configs"] as const;

const fetchCategoryFieldConfigs = async (): Promise<CategoryFieldConfig[]> => {
  const { data, error } = await supabase
    .from("category_field_configs")
    .select("*")
    .order("category")
    .order("display_order");

  if (error) throw error;
  
  // Parse JSON options field
  return (data || []).map(item => ({
    ...item,
    field_type: item.field_type as CategoryFieldConfig["field_type"],
    options: item.options ? (typeof item.options === 'string' ? JSON.parse(item.options) : item.options) : null,
  })) as CategoryFieldConfig[];
};

export function useCategoryFieldConfigs() {
  return useQuery({
    queryKey: CATEGORY_FIELD_CONFIGS_QUERY_KEY,
    queryFn: fetchCategoryFieldConfigs,
    staleTime: 1000 * 60 * 30, // 30 minutes
  });
}

// Helper to get unique categories that have field configs
export function getCategoriesWithConfigs(data: CategoryFieldConfig[]): string[] {
  const categories = data.map(item => item.category);
  return Array.from(new Set(categories)).sort();
}

// Helper to get field configs for a specific category
export function getFieldsForCategory(data: CategoryFieldConfig[], category: string): CategoryFieldConfig[] {
  if (!category) return [];
  
  return data
    .filter(item => item.category === category)
    .sort((a, b) => a.display_order - b.display_order);
}
