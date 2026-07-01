import { supabase } from "@/integrations/supabase/client";
import { openPrintableCatalog, type CompanyBrand } from "./wholesale-catalog-print";
import neraBeautyLogo from "@/assets/nera-beauty-logo.png";
import { toast } from "sonner";

const BRAND_EMAIL = "info@nerabeautyus.com";
const SAMPLE_DISCOUNT = 30;
const SAMPLE_MARKUP = 10;

export async function printSamplePricingSheet() {
  const { data: brandData } = await supabase
    .from("company_settings")
    .select("company_name, logo_url, contact_phone, contact_email, website, instagram, address, tagline")
    .maybeSingle();

  // Grab a handful of real products across categories to use as an example
  const { data: products, error } = await supabase
    .from("products")
    .select("sku, name, category, price_usd")
    .gt("price_usd", 0)
    .order("category")
    .order("sku");

  if (error || !products || products.length === 0) {
    toast.error("Could not load products for the sample sheet");
    return;
  }

  // Pick up to 2 SKUs per category, cap at ~10 rows so it stays "example" size
  const perCategory: Record<string, typeof products> = {};
  for (const p of products) {
    (perCategory[p.category] ||= []).push(p);
  }
  const picked: typeof products = [];
  Object.values(perCategory).forEach((list) => {
    picked.push(...list.slice(0, 2));
  });
  const sample = picked.slice(0, 10);

  const rows = sample.map((p) => ({
    sku: p.sku,
    name: p.name,
    category: p.category,
    basePrice: Number(p.price_usd ?? 0),
    discountPercent: SAMPLE_DISCOUNT,
    markupPercent: SAMPLE_MARKUP,
  }));

  const baseBrand: CompanyBrand = (brandData as CompanyBrand) ?? {
    company_name: "NÉRA Beauty",
    logo_url: null,
    contact_phone: null,
    contact_email: null,
    website: "NeraBeautyUS.com",
    instagram: "NeraBeautyUS",
    address: null,
    tagline: "Premium nail care · Wholesale Partnership",
  };

  openPrintableCatalog({
    brand: {
      ...baseBrand,
      logo_url: new URL(neraBeautyLogo, window.location.origin).href,
      contact_email: BRAND_EMAIL,
    },
    store: {
      name: "Sample Wholesale Partner",
      contact_name: `Example sheet · ${SAMPLE_DISCOUNT}% wholesale discount · ${SAMPLE_MARKUP}% suggested markup`,
      phone: null,
      email: null,
      address: null,
    },
    rows,
  });
}
