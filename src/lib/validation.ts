import { z } from "zod";

// Product validation schema
export const productSchema = z.object({
  name: z.string().trim().min(1, "Product name is required").max(200, "Name too long"),
  category: z.string().trim().min(1, "Category is required"),
  material: z.string().trim().max(100).optional().nullable(),
  shape: z.string().trim().max(100).optional().nullable(),
  direction: z.string().trim().max(100).optional().nullable(),
  bit_type: z.string().trim().max(100).optional().nullable(),
  grit: z.string().trim().max(50).optional().nullable(),
  unit: z.string().trim().max(50).optional().nullable(),
  sku: z.string().trim().min(1, "SKU is required").max(50, "SKU too long"),
  price_usd: z.number().positive("Price must be positive").max(999999, "Price too high"),
  salon_price_usd: z.number().positive("Price must be positive").max(999999, "Price too high").optional().nullable(),
  wholesale_price_usd: z.number().positive("Price must be positive").max(999999, "Price too high").optional().nullable(),
  stock_on_hand: z.number().int().min(0, "Stock cannot be negative").max(999999),
  stock_reserved: z.number().int().min(0, "Reserved stock cannot be negative").max(999999),
  reorder_level: z.number().int().min(0, "Reorder level cannot be negative").max(999999),
  supplier: z.string().trim().max(200).optional().nullable(),
  is_parent: z.boolean().optional(),
  parent_product_id: z.string().uuid().optional().nullable(),
  variant_name: z.string().trim().max(100).optional().nullable(),
});

// Salon validation schema
export const salonSchema = z.object({
  name: z.string().trim().min(1, "Salon name is required").max(200, "Name too long"),
  contact_name: z.string().trim().max(200).optional().nullable(),
  phone: z.string().trim().max(20).regex(/^[0-9+\-\s()]*$/, "Invalid phone format").optional().nullable(),
  email: z.string().trim().email("Invalid email address").max(255).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

// Order validation schema
export const orderSchema = z.object({
  salon_id: z.string().uuid("Invalid salon ID").optional().nullable(),
  customer_name: z.string().trim().max(200).optional().nullable(),
  customer_email: z.string().trim().email("Invalid email").max(255).optional().nullable(),
  customer_phone: z.string().trim().max(20).regex(/^[0-9+\-\s()]*$/, "Invalid phone format").optional().nullable(),
  customer_address: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

// Profile validation schema
export const profileSchema = z.object({
  full_name: z.string().trim().min(1, "Name is required").max(200, "Name too long"),
  email: z.string().trim().email("Invalid email address").max(255),
});

export type ProductFormData = z.infer<typeof productSchema>;
export type SalonFormData = z.infer<typeof salonSchema>;
export type OrderFormData = z.infer<typeof orderSchema>;
export type ProfileFormData = z.infer<typeof profileSchema>;
