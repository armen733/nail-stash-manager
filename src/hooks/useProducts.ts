import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Product, ProductImage } from "@/components/products/types";
import { useToast } from "@/hooks/use-toast";

export const PRODUCTS_QUERY_KEY = ["products"] as const;

export interface ProductsData {
  products: Product[];
  allProducts: Product[];
  maxPrice: number;
}

const fetchProductsData = async (): Promise<ProductsData> => {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("name");

  if (error) throw error;

  const allProducts = (data || []) as Product[];

  // Fetch all product images
  const { data: imagesData, error: imagesError } = await (supabase as any)
    .from("product_images")
    .select("*")
    .order("display_order");

  if (imagesError) throw imagesError;

  // Group variants under their parent products and attach images
  const parentProducts = (data || []).filter(p => p.is_parent || !p.parent_product_id);
  const variantProducts = (data || []).filter(p => p.parent_product_id && !p.is_parent);

  // Attach variants and images to their parents
  const productsWithVariants = parentProducts.map(parent => {
    const productImages = (imagesData || []).filter((img: any) => img.product_id === parent.id) as ProductImage[];
    if (parent.is_parent) {
      const variants = variantProducts.filter(v => v.parent_product_id === parent.id);
      return { ...parent, variants, images: productImages };
    }
    return { ...parent, images: productImages };
  });

  // Calculate max price for range filter
  const prices = (data || []).map(p => p.price_usd);
  const maxPrice = prices.length > 0 ? Math.ceil(Math.max(...prices) / 100) * 100 : 1000;

  return {
    products: productsWithVariants as Product[],
    allProducts,
    maxPrice,
  };
};

export function useProducts() {
  return useQuery({
    queryKey: PRODUCTS_QUERY_KEY,
    queryFn: fetchProductsData,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes cache
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
      toast({ title: "Success", description: "Product deleted successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useUpdateProductStock() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, stock_on_hand }: { id: string; stock_on_hand: number }) => {
      const { error } = await supabase
        .from("products")
        .update({ stock_on_hand })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
