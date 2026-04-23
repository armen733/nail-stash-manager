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

// Fetch products + images in parallel, both page-by-page.
// Products and images requests run concurrently (was sequential).
async function fetchAllPages<T>(table: string, orderBy: string): Promise<T[]> {
  const PAGE_SIZE = 1000;
  let all: T[] = [];
  let page = 0;
  // Fetch first page
  const { data, error } = await (supabase as any)
    .from(table)
    .select("*")
    .order(orderBy)
    .range(0, PAGE_SIZE - 1);
  if (error) throw error;
  if (!data || data.length === 0) return all;
  all = data as T[];
  if (data.length < PAGE_SIZE) return all;
  // Continue fetching subsequent pages
  page = 1;
  let hasMore = true;
  while (hasMore) {
    const { data: more, error: moreErr } = await (supabase as any)
      .from(table)
      .select("*")
      .order(orderBy)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (moreErr) throw moreErr;
    if (more && more.length > 0) {
      all = [...all, ...(more as T[])];
      hasMore = more.length === PAGE_SIZE;
      page++;
    } else {
      hasMore = false;
    }
  }
  return all;
}

const fetchProductsData = async (): Promise<ProductsData> => {
  // Run products + images requests in parallel instead of sequentially.
  const [allProductsData, allImagesData] = await Promise.all([
    fetchAllPages<any>("products", "name"),
    fetchAllPages<any>("product_images", "display_order"),
  ]);

  const allProducts = allProductsData as Product[];

  // Group variants under their parent products and attach images
  const parentProducts = allProductsData.filter(p => p.is_parent || !p.parent_product_id);
  const variantProducts = allProductsData.filter(p => p.parent_product_id && !p.is_parent);

  // Attach variants and images to their parents
  const productsWithVariants = parentProducts.map(parent => {
    const productImages = allImagesData.filter((img: any) => img.product_id === parent.id) as ProductImage[];
    if (parent.is_parent) {
      const variants = variantProducts.filter(v => v.parent_product_id === parent.id);
      return { ...parent, variants, images: productImages };
    }
    return { ...parent, images: productImages };
  });

  // Calculate max price for range filter
  const prices = allProductsData.map(p => p.price_usd);
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
      const errorStr = typeof error === 'string' ? error : (error?.message || error?.details || JSON.stringify(error) || '');
      const isForeignKeyError = errorStr.includes('order_items_product_id_fkey') || 
                                 errorStr.includes('foreign key constraint') ||
                                 error?.code === '23503';
      
      toast({
        title: isForeignKeyError ? "Cannot Delete Product" : "Error",
        description: isForeignKeyError 
          ? "This product cannot be deleted because it's part of existing orders. Consider marking it as discontinued instead."
          : errorStr,
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
