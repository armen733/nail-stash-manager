import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown, Factory, Paperclip, Plus, Printer, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

interface Attachment {
  name: string;
  path: string; // storage path within bucket
  size?: number;
  type?: string;
}

interface ProductionOrder {
  id: string;
  product_id: string | null;
  sku: string | null;
  supplier_sku: string | null;
  product_name: string | null;
  supplier_name: string | null;
  quantity: number;
  amount_spent: number;
  order_date: string;
  notes: string | null;
  attachments: Attachment[];
}

interface ProductOption {
  id: string;
  sku: string | null;
  supplier_sku: string | null;
  name: string;
}


interface Props {
  periodStart: Date;
  periodEnd: Date;
}

const BUCKET = "production-invoices";

export function ProductionOrdersSection({ periodStart, periodEnd }: Props) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState<boolean>(() => {
    try { return localStorage.getItem("analytics-production-open") === "1"; } catch { return false; }
  });
  const [adding, setAdding] = useState(false);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [productPickerOpen, setProductPickerOpen] = useState(false);

  // form state
  const [selectedProduct, setSelectedProduct] = useState<ProductOption | null>(null);
  const [supplier, setSupplier] = useState("");
  const [quantity, setQuantity] = useState("");
  const [amount, setAmount] = useState("");
  const [orderDate, setOrderDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const toggle = () => {
    setOpen((p) => {
      const next = !p;
      try { localStorage.setItem("analytics-production-open", next ? "1" : "0"); } catch {}
      return next;
    });
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("production_orders")
      .select("*")
      .gte("order_date", format(periodStart, "yyyy-MM-dd"))
      .lte("order_date", format(periodEnd, "yyyy-MM-dd"))
      .order("order_date", { ascending: false });
    if (error) {
      toast({ title: "Failed to load production orders", description: error.message, variant: "destructive" });
    } else {
      setOrders((data as any[]).map((o) => ({ ...o, attachments: o.attachments ?? [] })));
    }
    setLoading(false);
  };

  const loadProducts = async () => {
    const { data, error } = await supabase
      .from("products")
      .select("id, sku, supplier_sku, name")
      .order("name");
    if (!error && data) setProducts(data as ProductOption[]);
  };


  useEffect(() => {
    if (open) {
      load();
      if (products.length === 0) loadProducts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, periodStart.getTime(), periodEnd.getTime()]);

  const totalSpent = useMemo(() => orders.reduce((s, o) => s + Number(o.amount_spent || 0), 0), [orders]);
  const totalUnits = useMemo(() => orders.reduce((s, o) => s + Number(o.quantity || 0), 0), [orders]);

  const resetForm = () => {
    setSelectedProduct(null);
    setSupplier("");
    setQuantity("");
    setAmount("");
    setNotes("");
    setOrderDate(format(new Date(), "yyyy-MM-dd"));
    setPendingFiles([]);
  };

  const handleAdd = async () => {
    const qty = parseFloat(quantity);
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      toast({ title: "Enter amount spent", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Upload attachments first
      const attachments: Attachment[] = [];
      for (const file of pendingFiles) {
        const safeName = file.name.replace(/[^\w.\-]+/g, "_");
        const path = `${user?.id ?? "anon"}/${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || undefined,
        });
        if (upErr) {
          toast({ title: "Upload failed", description: upErr.message, variant: "destructive" });
          setUploading(false);
          return;
        }
        attachments.push({ name: file.name, path, size: file.size, type: file.type });
      }

      const { error } = await supabase.from("production_orders").insert({
        product_id: selectedProduct?.id ?? null,
        sku: selectedProduct?.sku ?? null,
        product_name: selectedProduct?.name ?? null,
        supplier_name: supplier || null,
        quantity: isNaN(qty) ? 0 : qty,
        amount_spent: amt,
        order_date: orderDate,
        notes: notes || null,
        attachments: attachments as any,
        created_by: user?.id,
      });
      if (error) {
        toast({ title: "Failed to save order", description: error.message, variant: "destructive" });
        setUploading(false);
        return;
      }
      toast({ title: "Production order saved" });
      resetForm();
      setAdding(false);
      load();
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (order: ProductionOrder) => {
    if (!confirm("Delete this production order?")) return;
    // best-effort remove files
    if (order.attachments?.length) {
      await supabase.storage.from(BUCKET).remove(order.attachments.map((a) => a.path));
    }
    const { error } = await supabase.from("production_orders").delete().eq("id", order.id);
    if (error) {
      toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
      return;
    }
    setOrders((p) => p.filter((o) => o.id !== order.id));
  };

  const openAttachment = async (path: string) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10);
    if (error || !data) {
      toast({ title: "Couldn't open file", description: error?.message, variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const handleFilesPick = (files: FileList | null) => {
    if (!files) return;
    setPendingFiles((prev) => [...prev, ...Array.from(files)]);
  };

  const handlePrint = () => {
    const rangeText = `${format(periodStart, "MMM d, yyyy")} - ${format(periodEnd, "MMM d, yyyy")}`;
    const rows = orders
      .map(
        (o) => `
        <tr>
          <td>${format(new Date(o.order_date), "MMM d, yyyy")}</td>
          <td>${escapeHtml(o.sku || "")}</td>
          <td>${escapeHtml(o.product_name || "")}</td>
          <td>${escapeHtml(o.supplier_name || "")}</td>
          <td style="text-align:right">${Number(o.quantity || 0)}</td>
          <td style="text-align:right">$${Number(o.amount_spent || 0).toFixed(2)}</td>
          <td>${escapeHtml(o.notes || "")}</td>
          <td>${(o.attachments || []).map((a) => escapeHtml(a.name)).join("<br>")}</td>
        </tr>`
      )
      .join("");
    const html = `<!doctype html><html><head><title>Production Orders</title>
      <style>
        @page { margin: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; padding: 24px; color: #111; }
        h1 { margin: 0 0 4px; font-size: 22px; }
        .sub { color: #555; margin-bottom: 16px; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { border: 1px solid #ddd; padding: 6px 8px; vertical-align: top; }
        th { background: #f3f4f6; text-align: left; }
        tfoot td { font-weight: 600; background: #fafafa; }
      </style></head><body>
      <h1>Production Orders</h1>
      <div class="sub">${rangeText} · ${orders.length} orders · Total spent $${totalSpent.toFixed(2)} · Units ${totalUnits}</div>
      <table>
        <thead>
          <tr><th>Date</th><th>SKU</th><th>Product</th><th>Supplier</th><th>Qty</th><th>Spent</th><th>Notes</th><th>Files</th></tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="8" style="text-align:center;color:#888">No orders</td></tr>`}</tbody>
        <tfoot>
          <tr><td colspan="4">Total</td><td style="text-align:right">${totalUnits}</td><td style="text-align:right">$${totalSpent.toFixed(2)}</td><td colspan="2"></td></tr>
        </tfoot>
      </table>
      <script>window.onload = () => { window.print(); }</script>
    </body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
  };

  return (
    <Card className="shadow-[var(--shadow-card)]">
      <CardHeader
        className="p-4 sm:p-6 cursor-pointer hover:bg-muted/30 transition-colors select-none"
        onClick={toggle}
      >
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Factory className="h-5 w-5 text-blue-500" />
            Production Orders
            {open && orders.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                · ${totalSpent.toFixed(2)} · {totalUnits} units
              </span>
            )}
          </CardTitle>
          <ChevronDown className={cn("h-5 w-5 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
        </div>
      </CardHeader>
      {open && (
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0 space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Total spent</div>
              <div className="text-xl font-semibold text-blue-500">${totalSpent.toFixed(2)}</div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Units produced</div>
              <div className="text-xl font-semibold">{totalUnits}</div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Orders</div>
              <div className="text-xl font-semibold">{orders.length}</div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {!adding && (
              <Button onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4 mr-2" /> Add production order
              </Button>
            )}
            <Button variant="outline" onClick={handlePrint} disabled={orders.length === 0}>
              <Printer className="h-4 w-4 mr-2" /> Print
            </Button>
          </div>

          {/* Add form */}
          {adding && (
            <div className="rounded-lg border p-3 sm:p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>SKU / Product</Label>
                  <Popover open={productPickerOpen} onOpenChange={setProductPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start font-normal">
                        {selectedProduct
                          ? `${selectedProduct.sku ?? "—"}${selectedProduct.supplier_sku ? ` / Supp: ${selectedProduct.supplier_sku}` : ""} · ${selectedProduct.name}`
                          : "Select product…"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0 w-[320px]" align="start">
                      <Command>
                        <CommandInput placeholder="Search SKU or name…" />
                        <CommandList>
                          <CommandEmpty>No products.</CommandEmpty>
                          <CommandGroup>
                            {products.map((p) => (
                              <CommandItem
                                key={p.id}
                                value={`${p.sku ?? ""} ${p.supplier_sku ?? ""} ${p.name}`}
                                onSelect={() => {
                                  setSelectedProduct(p);
                                  setProductPickerOpen(false);
                                }}
                              >
                                <span className="font-mono text-xs mr-2 text-muted-foreground">{p.sku ?? "—"}</span>
                                <span className="flex-1 truncate">{p.name}</span>
                                {p.supplier_sku && (
                                  <span className="font-mono text-xs text-blue-500 ml-2">Supp: {p.supplier_sku}</span>
                                )}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1">
                  <Label>Supplier</Label>
                  <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. Acme Co." />
                </div>
                <div className="space-y-1">
                  <Label>Quantity produced</Label>
                  <Input type="number" min="0" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label>Amount spent (USD)</Label>
                  <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
                </div>
                <div className="space-y-1">
                  <Label>Order date</Label>
                  <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Notes</Label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
                </div>
              </div>

              {/* Attachments */}
              <div className="space-y-2">
                <Label>Attachments (supplier invoices, receipts, etc.)</Label>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    <Paperclip className="h-4 w-4 mr-2" /> Attach files
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFilesPick(e.target.files)}
                  />
                  {pendingFiles.map((f, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">
                      {f.name}
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setPendingFiles((p) => p.filter((_, i) => i !== idx))}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => { setAdding(false); resetForm(); }} disabled={uploading}>
                  Cancel
                </Button>
                <Button onClick={handleAdd} disabled={uploading}>
                  {uploading ? "Saving…" : "Save order"}
                </Button>
              </div>
            </div>
          )}

          {/* List */}
          <div className="rounded-lg border divide-y">
            {loading ? (
              <div className="p-4 text-center text-sm text-muted-foreground">Loading…</div>
            ) : orders.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No production orders in this period.
              </div>
            ) : (
              orders.map((o) => (
                <div key={o.id} className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {o.sku && <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{o.sku}</span>}
                        <span className="font-medium text-sm">{o.product_name || "—"}</span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(o.order_date), "MMM d, yyyy")}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {o.supplier_name ? `${o.supplier_name} · ` : ""}qty {Number(o.quantity)}
                        {o.notes ? ` · ${o.notes}` : ""}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-blue-500 whitespace-nowrap">
                      ${Number(o.amount_spent).toFixed(2)}
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(o)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {o.attachments && o.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {o.attachments.map((a, i) => (
                        <button
                          key={i}
                          onClick={() => openAttachment(a.path)}
                          className="inline-flex items-center gap-1 text-xs rounded-md border bg-background px-2 py-1 hover:bg-muted"
                        >
                          <Paperclip className="h-3 w-3" />
                          {a.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
