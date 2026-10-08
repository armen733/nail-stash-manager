import { Product } from "./types";

export const dimensionKeys = ["diameter", "head_length", "total_length"] as const;

// Existing diameter entries may include an mm suffix or decimal comma.
export function millimeterValue(value: string | number | null | undefined): string {
  if (value == null) return "";
  return String(value).trim().replace(/\s*mm$/i, "").replace(",", ".").trim();
}

export function DrillBitDimensions({ product }: { product: Product }) {
  if (product.category.trim().toLowerCase() !== "nail drill bits") return null;
  const labels = ["Bit-head diameter", "Head length", "Total length"];
  const measurements = dimensionKeys.flatMap((key, index) => {
    const value = millimeterValue(product.category_attributes?.[key]);
    return value ? [{ key, label: labels[index], value }] : [];
  });
  if (!measurements.length) return null;
  return (
    <dl className="space-y-2 text-sm border-t pt-3">
      {measurements.map(({ key, label, value }) => (
        <div key={key} className="flex flex-wrap justify-between gap-x-4 gap-y-1">
          <dt className="font-medium">{label}</dt>
          <dd>{value} mm</dd>
        </div>
      ))}
    </dl>
  );
}