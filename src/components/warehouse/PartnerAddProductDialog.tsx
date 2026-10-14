import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const PARTNER_CATEGORY = "NÉRA x OhLaLa";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  locationId: string;
  partnerName: string;
  onSaved: () => void;
}

export function PartnerAddProductDialog({ open, onOpenChange, locationId, partnerName, onSaved }: Props) {
  const [types, setTypes] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [subType, setSubType] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase
      .from("category_variant_types")
      .select("variant_type, display_order")
      .eq("category", PARTNER_CATEGORY)
      .order("display_order")
      .then(({ data }) => setTypes((data ?? []).map((d) => d.variant_type)));
  }, [open]);

  const reset = () => {
    setName(""); setSubType(""); setSku(""); setPrice(""); setQty(""); setDescription(""); setFiles([]);
  };

  const save = async () => {
    const p = Number(price);
    const q = Math.max(0, Math.floor(Number(qty) || 0));
    if (!name.trim() || !sku.trim() || !(p > 0)) {
      toast.error("Name, SKU and price are required");
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: prod, error } = await supabase
        .from("products")
        .insert({
          name: name.trim(),
          sku: sku.trim(),
          category: PARTNER_CATEGORY,
          variant_name: subType || null,
          bit_type: subType || null,
          price_usd: p,
          cost_usd: 0,
          stock_on_hand: 0,
          description: description.trim() || null,
          supplier: partnerName,
        })
        .select("id")
        .single();
      if (error) throw error;

      const urls: string[] = [];
      for (const f of files) {
        const path = `${prod.id}/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
        const up = await supabase.storage.from("product-images").upload(path, f);
        if (up.error) { toast.error(`Photo upload failed: ${up.error.message}`); continue; }
        urls.push(supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl);
      }
      if (urls.length) {
        await supabase.from("product_images").insert(
          urls.map((image_url, i) => ({ product_id: prod.id, image_url, display_order: i })),
        );
        await supabase.from("products").update({ image_url: urls[0] }).eq("id", prod.id);
      }

      if (q > 0) {
        const { error: mErr } = await supabase.from("stock_movements").insert({
          product_id: prod.id,
          movement_type: "receive",
          quantity: q,
          to_location_id: locationId,
          unit_cost: 0,
          reason: `Received from ${partnerName} (free partner stock)`,
          created_by: user?.id ?? null,
        });
        if (mErr) throw mErr;
      }

      toast.success(`${name} added to ${PARTNER_CATEGORY}`);
      reset();
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Could not add product");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add product from {partnerName}</DialogTitle>
          <DialogDescription>
            Goes into “{PARTNER_CATEGORY}”, shows on the website, and the stock is counted as received from {partnerName} at no cost.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Product name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div>
            <Label>Type</Label>
            <Select value={subType} onValueChange={setSubType}>
              <SelectTrigger><SelectValue placeholder="Choose type" /></SelectTrigger>
              <SelectContent>{types.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>SKU *</Label><Input value={sku} onChange={(e) => setSku(e.target.value)} /></div>
            <div><Label>Price (USD) *</Label><Input type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
          </div>
          <div><Label>Quantity received</Label><Input type="number" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
          <div><Label>Description</Label><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div>
            <Label>Photos</Label>
            <Input type="file" accept="image/*" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Add product"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
