import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  alreadyAssigned: Set<string>;
  onAssigned: () => void;
}

export default function ProductPickerDialog({ open, onOpenChange, storeId, alreadyAssigned, onAssigned }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setSearch("");
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, category")
        .order("sku");
      if (error) toast.error(error.message);
      setProducts((data ?? []) as Product[]);
      setLoading(false);
    })();
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => !alreadyAssigned.has(p.id))
      .filter((p) =>
        !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.category.toLowerCase().includes(q),
      );
  }, [products, search, alreadyAssigned]);

  const toggle = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAssign = async () => {
    if (selected.size === 0) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    const rows = Array.from(selected).map((product_id) => ({
      supply_store_id: storeId,
      product_id,
    }));
    const { error } = await supabase.from("supply_store_products").insert(rows);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Added ${rows.length} product${rows.length === 1 ? "" : "s"}`);
    onAssigned();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Products</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by SKU, name, or category…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 min-h-[44px]"
          />
        </div>

        <div className="flex-1 overflow-y-auto border rounded-md">
          {loading ? (
            <div className="text-center py-8 text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              {products.length === 0 ? "No products yet." : "No products to add."}
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 cursor-pointer"
                >
                  <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggle(p.id)} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {p.sku} · {p.category}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAssign} disabled={saving || selected.size === 0}>
            Add {selected.size > 0 ? `(${selected.size})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
