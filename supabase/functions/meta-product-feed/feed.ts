export interface MetaFeedImage {
  image_url: string | null;
  display_order: number | null;
}

export interface MetaFeedProduct {
  id: string;
  name: string | null;
  sku: string | null;
  description: string | null;
  price_usd: number | string;
  category: string | null;
  image_url: string | null;
  stock_on_hand: number | null;
  stock_reserved?: number | null;
  variant_group?: string | null;
  sibling_group_id?: string | null;
  product_images?: MetaFeedImage[] | null;
}

export interface MetaFeedResult {
  csv: string;
  itemCount: number;
  skippedMissingImages: number;
}

const SITE_ORIGIN = "https://nerabeautyus.com";

const HEADERS = [
  "id",
  "title",
  "description",
  "price",
  "availability",
  "condition",
  "link",
  "image_link",
  "brand",
  "additional_image_link",
  "inventory",
  "item_group_id",
  "product_type",
];

function plainText(value: string | null | undefined, maxLength = 5000): string {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export function absoluteFeedUrl(
  value: string | null | undefined,
  siteOrigin = SITE_ORIGIN,
): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  try {
    const url = new URL(raw.startsWith("//") ? `https:${raw}` : raw, `${siteOrigin}/`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function getAvailableStock(product: Pick<MetaFeedProduct, "stock_on_hand" | "stock_reserved">): number {
  return Math.max(
    0,
    (Number(product.stock_on_hand) || 0) - (Number(product.stock_reserved) || 0),
  );
}

function productImages(product: MetaFeedProduct, siteOrigin: string): string[] {
  const ordered = [...(product.product_images ?? [])].sort(
    (a, b) => (a.display_order ?? Number.MAX_SAFE_INTEGER) -
      (b.display_order ?? Number.MAX_SAFE_INTEGER),
  );
  const urls = ordered.map((image) => absoluteFeedUrl(image.image_url, siteOrigin));
  const fallback = absoluteFeedUrl(product.image_url, siteOrigin);
  if (fallback) urls.push(fallback);
  return [...new Set(urls.filter((url): url is string => Boolean(url)))];
}

export function buildMetaProductFeed(
  products: MetaFeedProduct[],
  siteOrigin = SITE_ORIGIN,
): MetaFeedResult {
  const normalizedOrigin = siteOrigin.replace(/\/+$/, "");
  const skuCounts = new Map<string, number>();
  for (const product of products) {
    const sku = String(product.sku ?? "").trim();
    if (sku) skuCounts.set(sku, (skuCounts.get(sku) ?? 0) + 1);
  }

  const rows: string[] = [];
  let skippedMissingImages = 0;

  for (const product of products) {
    const images = productImages(product, normalizedOrigin);
    if (images.length === 0) {
      skippedMissingImages += 1;
      continue;
    }

    const sku = String(product.sku ?? "").trim();
    // Meta IDs must be unique. Prefer the searchable SKU, falling back to the
    // product UUID when a SKU is missing or duplicated in the manager catalog.
    const id = sku && skuCounts.get(sku) === 1 ? sku : product.id;
    const title = plainText(product.name, 150) || `NÉRA Beauty ${id}`;
    const available = getAvailableStock(product);
    const price = Number(product.price_usd);
    if (!Number.isFinite(price) || price < 0) continue;

    const values = [
      id,
      title,
      plainText(product.description) || title,
      `${price.toFixed(2)} USD`,
      available > 0 ? "in stock" : "out of stock",
      "new",
      `${normalizedOrigin}/product/${encodeURIComponent(product.id)}`,
      images[0],
      "NÉRA",
      images.slice(1, 11).join(","),
      available,
      product.variant_group || product.sibling_group_id || "",
      plainText(product.category, 750),
    ];
    rows.push(values.map(csvCell).join(","));
  }

  return {
    csv: `${HEADERS.join(",")}\n${rows.join("\n")}${rows.length ? "\n" : ""}`,
    itemCount: rows.length,
    skippedMissingImages,
  };
}
