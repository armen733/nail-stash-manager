import { supabase } from "@/integrations/supabase/client";
import { openPrintableCatalog, type CompanyBrand } from "./wholesale-catalog-print";
import neraBeautyLogo from "@/assets/nera-beauty-logo.png";

const BRAND_EMAIL = "info@nerabeautyus.com";

const SAMPLE_ROWS = [
  { sku: "DB-FLAME-M",  name: "Diamond Flame Bit — Medium",        category: "Diamond Bits",   basePrice: 8.5,  discountPercent: 30, markupPercent: 10 },
  { sku: "CB-BARREL-F", name: "Carbide Barrel Bit — Fine",         category: "Carbide Bits",   basePrice: 12,   discountPercent: 30, markupPercent: 10 },
  { sku: "CB-CONE-M",   name: "Carbide Cone Bit — Medium",         category: "Carbide Bits",   basePrice: 11.5, discountPercent: 30, markupPercent: 10 },
  { sku: "SB-180-50",   name: "Sanding Bands 180 grit — 50 pack",  category: "Sanding Bands",  basePrice: 9,    discountPercent: 30, markupPercent: 10 },
  { sku: "PD-XC-10",    name: "Pedicure Disc XC — 10 pack",        category: "Pedicure Discs", basePrice: 14,   discountPercent: 30, markupPercent: 10 },
  { sku: "NB-DUST-01",  name: "Nail Dust Brush — Pro",             category: "Nail Brushes",   basePrice: 6.5,  discountPercent: 30, markupPercent: 10 },
];

export async function printSamplePricingSheet() {
  const { data: brandData } = await supabase
    .from("company_settings")
    .select("company_name, logo_url, contact_phone, contact_email, website, instagram, address, tagline")
    .maybeSingle();

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
      contact_name: "Example — for demonstration only",
      phone: null,
      email: null,
      address: null,
    },
    rows: SAMPLE_ROWS,
  });
}
