import { useState, useMemo } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Package, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProductLite {
  id: string;
  name: string;
  sku: string;
  price_usd: number;
  stock_on_hand?: number | null;
  image_url?: string | null;
  product_images?: { image_url: string }[];
}

interface Props {
  products: ProductLite[];
  value: string;
  onChange: (productId: string) => void;
  placeholder?: string;
}

function getThumb(p: ProductLite): string | null {
  if (p.image_url) return p.image_url;
  if (p.product_images && p.product_images.length > 0) return p.product_images[0].image_url;
  return null;
}

export function ProductPicker({ products, value, onChange, placeholder = "Choose product" }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = useMemo(() => products.find((p) => p.id === value), [products, value]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku || "").toLowerCase().includes(q)
    );
  }, [products, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-auto min-h-[72px] px-2 py-1.5"
        >
          {selected ? (
            <div className="flex items-center gap-3 min-w-0">
              {getThumb(selected) ? (
                <img
                  src={getThumb(selected)!}
                  alt=""
                  className="h-16 w-16 rounded object-cover flex-shrink-0 bg-muted"
                  loading="lazy"
                />
              ) : (
                <div className="h-16 w-16 rounded bg-muted flex items-center justify-center flex-shrink-0">
                  <Package className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
              <div className="text-left min-w-0">
                <div className="text-sm font-medium truncate">{selected.name}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {selected.sku} · stock: {selected.stock_on_hand ?? "∞"}
                </div>
              </div>
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronDown className="h-4 w-4 text-muted-foreground opacity-50 flex-shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(95vw,520px)] p-0 bg-popover z-50"
        align="start"
      >
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Search by name or SKU…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
        </div>
        <ScrollArea className="h-[360px]">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No products match "{search}"
            </div>
          ) : (
            <div className="p-1">
              {filtered.map((p) => {
                const thumb = getThumb(p);
                const isSelected = p.id === value;
                const lowStock = (p.stock_on_hand ?? Infinity) <= 5;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onChange(p.id);
                      setOpen(false);
                      setSearch("");
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 p-2 rounded-md text-left hover:bg-accent transition-colors",
                      isSelected && "bg-accent"
                    )}
                  >
                    {thumb ? (
                      <img
                        src={thumb}
                        alt=""
                        className="h-12 w-12 rounded object-cover flex-shrink-0 bg-muted"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded bg-muted flex items-center justify-center flex-shrink-0">
                        <Package className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{p.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {p.sku} · ${Number(p.price_usd).toFixed(2)}
                      </div>
                      <div className={cn(
                        "text-[11px] mt-0.5",
                        lowStock ? "text-destructive" : "text-muted-foreground"
                      )}>
                        Stock: {p.stock_on_hand ?? "∞"}
                      </div>
                    </div>
                    {isSelected && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
