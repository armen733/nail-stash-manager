// Product related types
export interface ProductImage {
  id: string;
  product_id: string;
  image_url: string;
  display_order: number;
}

export interface SiblingGroup {
  id: string;
  name: string;
  created_at?: string;
}

export interface Product {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  material: string | null;
  shape: string | null;
  direction: string | null;
  bit_type: string | null;
  grit: string | null;
  unit: string | null;
  sku: string;
  supplier_sku: string | null;
  price_usd: number;
  salon_price_usd: number | null;
  wholesale_price_usd: number | null;
  cost_usd: number | null;
  image_url: string | null;
  stock_on_hand: number | null;
  stock_reserved: number | null;
  reorder_level: number | null;
  supplier: string | null;
  is_parent: boolean | null;
  parent_product_id: string | null;
  variant_name: string | null;
  category_attributes: Record<string, string | number | null> | null;
  sibling_group_id: string | null;
  variants?: Product[];
  images?: ProductImage[];
  siblings?: Product[];
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface ProductFormData {
  name: string;
  description: string;
  category: string;
  material: string;
  shape: string;
  direction: string;
  bit_type: string;
  grit: string;
  unit: string;
  sku: string;
  supplier_sku: string;
  price_usd: string;
  salon_price_usd: string;
  wholesale_price_usd: string;
  cost_usd: string;
  stock_on_hand: string;
  stock_reserved: string;
  reorder_level: string;
  supplier: string;
  is_parent: boolean;
  parent_product_id: string;
  variant_name: string;
  category_attributes: Record<string, string>;
  sibling_group_id: string;
  sibling_group_name: string;
}

export const defaultFormData: ProductFormData = {
  name: "",
  category: "",
  material: "",
  shape: "",
  direction: "",
  bit_type: "",
  grit: "",
  unit: "piece",
  sku: "",
  supplier_sku: "",
  price_usd: "",
  salon_price_usd: "",
  wholesale_price_usd: "",
  cost_usd: "",
  stock_on_hand: "0",
  stock_reserved: "0",
  reorder_level: "10",
  supplier: "",
  is_parent: false,
  parent_product_id: "",
  variant_name: "",
  category_attributes: {},
  sibling_group_id: "",
  sibling_group_name: "",
};
