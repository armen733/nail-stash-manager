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
  // Fetch all products with pagination to bypass 1000 row limit
  const PAGE_SIZE = 1000;
  let allProductsData: any[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("name")
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (error) throw error;

    if (data && data.length > 0) {
      allProductsData = [...allProductsData, ...data];
      hasMore = data.length === PAGE_SIZE;
      page++;
    } else {
      hasMore = false;
    }
  }

  const allProducts = allProductsData as Product[];

  // Fetch all product images with pagination
  let allImagesData: any[] = [];
  page = 0;
  hasMore = true;

  while (hasMore) {
    const { data: imagesData, error: imagesError } = await (supabase as any)
      .from("product_images")
      .select("*")
      .order("display_order")
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (imagesError) throw imagesError;

    if (imagesData && imagesData.length > 0) {
      allImagesData = [...allImagesData, ...imagesData];
      hasMore = imagesData.length === PAGE_SIZE;
      page++;
    } else {
      hasMore = false;
    }
  }

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
