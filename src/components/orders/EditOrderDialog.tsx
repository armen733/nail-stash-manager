import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProductPicker } from "./ProductPicker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Minus, AlertTriangle, Loader2, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getDefaultLocationId } from "@/lib/default-location";
import { useToast } from "@/hooks/use-toast";
import { useTaxSettings } from "@/hooks/useTaxSettings";
import { logAudit } from "@/lib/audit-log";

interface ProductLite {
  id: string;
  name: string;
  sku: string;
  price_usd: number;
  stock_on_hand: number | null;
  image_url?: string | null;
  product_images?: { image_url: string }[];
}

interface SalonLite { id: string; name: string; }

interface OrderItemRow {
  id?: string; // existing item id
  product_id: string;
  quantity: number;
  unit_price: number;
}

interface OrderForEdit {
  id: string;
  status: string;
  salon_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  notes: string | null;
  technician_name?: string | null;
  subtotal: number;
  tax: number;
  total: number;
  discount_code?: string | null;
  discount_amount?: number | null;
  profile_id?: string | null;
  created_by?: string | null;
  order_items?: Array<{
    id: string;
    quantity: number;
    unit_price: number;
    product_id: string;
    products?: { name: string; sku?: string };
  }>;
}

const ORDER_STATUSES = ["Draft", "Confirmed", "Shipped", "Delivered", "Paid"] as const;

interface Props {
  order: OrderForEdit | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: ProductLite[];
  salons: SalonLite[];
  onSaved: () => void;
}

export function EditOrderDialog({ order, open, onOpenChange, products, salons, onSaved }: Props) {
  const { toast } = useToast();
  const { calculateTax } = useTaxSettings();
  const [saving, setSaving] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [warningAccepted, setWarningAccepted] = useState(false);

  const [items, setItems] = useState<OrderItemRow[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [salonId, setSalonId] = useState<string>("none");
  const [status, setStatus] = useState<string>("Draft");
  const [notes, setNotes] = useState("");
  const [technicianName, setTechnicianName] = useState("");
  const [discountCode, setDiscountCode] = useState("");
  const [discountInput, setDiscountInput] = useState<string>("");
  const [discountType, setDiscountType] = useState<"amount" | "percent">("amount");
  const [pointsRedeemed, setPointsRedeemed] = useState<number>(0);
  const [loyalty, setLoyalty] = useState<{ available: number; perDollar: number; minRedeem: number; redeemValue: number } | null>(null);

  // Detect Stripe orders: no created_by + has customer_email
  const isStripeOrder = useMemo(() => {
    if (!order) return false;
    return !order.created_by && !!order.customer_email;
  }, [order]);

  const isSensitiveStatus = order?.status === "Paid" || order?.status === "Delivered";

  useEffect(() => {
    if (!order || !open) return;
    setItems(
      (order.order_items || []).map((it) => ({
        id: it.id,
        product_id: it.product_id,
        quantity: it.quantity,
        unit_price: it.unit_price,
      }))
    );
    setCustomerName(order.customer_name || "");
    setCustomerEmail(order.customer_email || "");
    setCustomerPhone(order.customer_phone || "");
    setCustomerAddress(order.customer_address || "");
    setSalonId(order.salon_id || "none");
    setStatus(order.status);
    setNotes(order.notes || "");
    setTechnicianName(order.technician_name || "");
    setDiscountCode(order.discount_code || "");
    // If the original discount looks like a clean % of the original subtotal,
    // restore it as a percentage so edits (added/removed items) keep the same rate.
    const origDiscount = Number(order.discount_amount || 0);
    const origSubtotal = Number(order.subtotal || 0);
    let restoredAsPercent = false;
    if (origDiscount > 0 && origSubtotal > 0) {
      const pct = (origDiscount / origSubtotal) * 100;
      const rounded = Math.round(pct * 2) / 2; // allow .5 steps
      if (rounded > 0 && rounded < 100 && Math.abs(pct - rounded) < 0.05) {
        setDiscountType("percent");
        setDiscountInput(String(rounded));
        restoredAsPercent = true;
      }
    }
    if (!restoredAsPercent) {
      setDiscountInput(origDiscount ? String(origDiscount) : "");
      setDiscountType("amount");
    }

    setPointsRedeemed(Number((order as any).points_redeemed || 0));
    setWarningAccepted(false);
  }, [order, open]);

  // Load loyalty info for the order's customer
  useEffect(() => {
    if (!order || !open || !order.profile_id) { setLoyalty(null); return; }
    (async () => {
      const [profileRes, settingsRes] = await Promise.all([
        supabase.from("profiles").select("loyalty_points").eq("id", order.profile_id!).maybeSingle(),
        supabase.from("loyalty_settings").select("points_per_dollar, points_required_for_redemption, redemption_value_usd").maybeSingle(),
      ]);
      const available = Number(profileRes.data?.loyalty_points ?? 0);
      const perDollar = Number(settingsRes.data?.points_per_dollar ?? 1);
      const minRedeem = Number(settingsRes.data?.points_required_for_redemption ?? 100);
      const redeemValue = Number(settingsRes.data?.redemption_value_usd ?? 5);
      setLoyalty({ available, perDollar, minRedeem, redeemValue });
    })();
  }, [order, open]);

  // Check warning on open for sensitive statuses
  useEffect(() => {
    if (open && isSensitiveStatus && !warningAccepted) {
      setShowWarning(true);
    }
  }, [open, isSensitiveStatus, warningAccepted]);

  const subtotal = useMemo(
    () => items.reduce((s, it) => s + it.quantity * it.unit_price, 0),
    [items]
  );
  const discountAmount = useMemo(() => {
    const v = parseFloat(discountInput) || 0;
    const raw = discountType === "percent" ? subtotal * (v / 100) : v;
    return Math.min(subtotal, Math.max(0, raw));
  }, [discountInput, discountType, subtotal]);
  const loyaltyDiscount = useMemo(() => {
    if (!loyalty || !pointsRedeemed) return 0;
    const blocks = Math.floor(pointsRedeemed / loyalty.minRedeem);
    return blocks * loyalty.redeemValue;
  }, [loyalty, pointsRedeemed]);
  const taxableSubtotal = Math.max(0, subtotal - discountAmount - loyaltyDiscount);
  const tax = calculateTax(taxableSubtotal);
  const total = taxableSubtotal + tax;

  const stockWarnings = useMemo(() => {
    if (!order) return [];
    // For each line, compute net delta vs original to know if we'll run out of stock
    const originalById = new Map<string, number>();
    (order.order_items || []).forEach((oi) => {
      originalById.set(oi.product_id, (originalById.get(oi.product_id) || 0) + oi.quantity);
    });
    const newById = new Map<string, number>();
    items.forEach((it) => {
      if (!it.product_id) return;
      newById.set(it.product_id, (newById.get(it.product_id) || 0) + it.quantity);
    });
    const warnings: { name: string; delta: number; available: number }[] = [];
    newById.forEach((newQty, pid) => {
      const oldQty = originalById.get(pid) || 0;
      const delta = newQty - oldQty; // positive means more stock needed
      if (delta > 0) {
        const p = products.find((pr) => pr.id === pid);
        const available = p?.stock_on_hand ?? 0;
        if (p && p.stock_on_hand !== null && delta > available) {
          warnings.push({ name: p.name, delta, available });
        }
      }
    });
    return warnings;
  }, [items, order, products]);

  const addItem = () => setItems([...items, { product_id: "", quantity: 1, unit_price: 0 }]);
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: keyof OrderItemRow, value: any) => {
    const next = [...items];
    next[idx] = { ...next[idx], [field]: value };
    if (field === "product_id") {
      const p = products.find((pr) => pr.id === value);
      if (p) next[idx].unit_price = p.price_usd;
    }
    setItems(next);
  };

  const handleSave = async () => {
    if (!order) return;
    if (items.length === 0) {
      toast({ title: "Error", description: "Order must have at least one item", variant: "destructive" });
      return;
    }
    if (items.some((it) => !it.product_id)) {
      toast({ title: "Error", description: "Select a product for every line", variant: "destructive" });
      return;
    }
    if (stockWarnings.length > 0) {
      const msg = stockWarnings.map((w) => `${w.name}: needs ${w.delta} more, only ${w.available} available`).join("\n");
      if (!confirm(`⚠️ STOCK WARNING:\n\n${msg}\n\nProceed anyway?`)) return;
    }

    setSaving(true);
    try {
      // 0) Snapshot the current order BEFORE any changes (for edit history)
      const { data: { user } } = await supabase.auth.getUser();
      const snapshot = {
        status: order.status,
        salon_id: order.salon_id,
        customer_name: order.customer_name,
        customer_email: order.customer_email,
        customer_phone: order.customer_phone,
        customer_address: order.customer_address,
        notes: order.notes,
        subtotal: order.subtotal,
        tax: order.tax,
        total: order.total,
        discount_code: order.discount_code || null,
        discount_amount: order.discount_amount || null,
        items: (order.order_items || []).map((it) => ({
          product_id: it.product_id,
          product_name: it.products?.name || null,
          product_sku: it.products?.sku || null,
          quantity: it.quantity,
          unit_price: it.unit_price,
          line_total: it.quantity * it.unit_price,
        })),
      };
      await (supabase as any).from("order_edit_history").insert({
        order_id: order.id,
        edited_by: user?.id || null,
        snapshot,
      });

      const originalById = new Map<string, number>();
      (order.order_items || []).forEach((oi) => {
        originalById.set(oi.product_id, (originalById.get(oi.product_id) || 0) + oi.quantity);
      });
      const newById = new Map<string, number>();
      items.forEach((it) => {
        newById.set(it.product_id, (newById.get(it.product_id) || 0) + it.quantity);
      });
      const allPids = new Set<string>([...originalById.keys(), ...newById.keys()]);

      // 2) Apply stock deltas via stock_movements (Main Warehouse). Trigger syncs stock_on_hand.
      const defaultLocId = await getDefaultLocationId();
      const { data: userData } = await supabase.auth.getUser();
      const editorId = userData.user?.id ?? null;
      const moveRows: any[] = [];
      for (const pid of allPids) {
        const delta = (newById.get(pid) || 0) - (originalById.get(pid) || 0);
        if (delta === 0 || !defaultLocId) continue;
        if (delta > 0) {
          // more units sold -> deduct from main
          moveRows.push({
            product_id: pid,
            movement_type: "sale",
            quantity: delta,
            from_location_id: defaultLocId,
            to_location_id: null,
            reason: `Order edit ${order.id.slice(0, 8)}`,
            reference_type: "order_edit",
            reference_id: order.id,
            created_by: editorId,
          });
        } else {
          // fewer units -> return to main
          moveRows.push({
            product_id: pid,
            movement_type: "return",
            quantity: Math.abs(delta),
            from_location_id: null,
            to_location_id: defaultLocId,
            reason: `Order edit ${order.id.slice(0, 8)}`,
            reference_type: "order_edit",
            reference_id: order.id,
            created_by: editorId,
          });
        }
      }
      if (moveRows.length > 0) {
        const { error: mvErr } = await supabase.from("stock_movements").insert(moveRows);
        if (mvErr) throw mvErr;
      }

      // 3) Replace order_items: delete all then insert new
      const { error: delErr } = await supabase.from("order_items").delete().eq("order_id", order.id);
      if (delErr) throw delErr;

      const newRows = items.map((it) => ({
        order_id: order.id,
        product_id: it.product_id,
        quantity: it.quantity,
        unit_price: it.unit_price,
        line_total: it.quantity * it.unit_price,
      }));
      const { error: insErr } = await supabase.from("order_items").insert(newRows);
      if (insErr) throw insErr;

      // 4) Update order header
      const { error: updErr } = await supabase
        .from("orders")
        .update({
          status: status as any,
          salon_id: salonId === "none" ? null : salonId,
          customer_name: customerName || null,
          customer_email: customerEmail || null,
          customer_phone: customerPhone || null,
          customer_address: customerAddress || null,
          notes: notes || null,
          technician_name: technicianName || null,
          discount_code: discountCode || null,
          discount_amount: discountAmount || null,
          subtotal,
          tax,
          total,
        })
        .eq("id", order.id);
      if (updErr) throw updErr;

      // 5) Sync referral commission if exists for this order
      const { data: existingCommission } = await supabase
        .from("referral_commissions")
        .select("id, referrer_id, commission_rate, commission_amount, order_subtotal")
        .eq("order_id", order.id)
        .maybeSingle();

      if (existingCommission) {
        const newCommissionAmount = (taxableSubtotal * Number(existingCommission.commission_rate)) / 100;
        const oldCommissionAmount = Number(existingCommission.commission_amount);
        const oldOrderSubtotal = Number(existingCommission.order_subtotal);

        await supabase
          .from("referral_commissions")
          .update({
            order_subtotal: taxableSubtotal,
            commission_amount: newCommissionAmount,
          })
          .eq("id", existingCommission.id);

        // Adjust cached referrer stats by deltas
        const { data: refData } = await supabase
          .from("referrers")
          .select("total_revenue, total_commission")
          .eq("id", existingCommission.referrer_id)
          .single();
        if (refData) {
          await supabase
            .from("referrers")
            .update({
              total_revenue: Number(refData.total_revenue) - oldOrderSubtotal + taxableSubtotal,
              total_commission: Number(refData.total_commission) - oldCommissionAmount + newCommissionAmount,
            })
            .eq("id", existingCommission.referrer_id);
        }
      }

      // Audit log: capture what changed at a high level
      const statusChanged = order.status !== status;
      const totalChanged = Math.abs(Number(order.total) - total) > 0.001;
      const summaryParts: string[] = [];
      if (statusChanged) summaryParts.push(`status ${order.status} → ${status}`);
      if (totalChanged) summaryParts.push(`total $${Number(order.total).toFixed(2)} → $${total.toFixed(2)}`);
      if (items.length !== (order.order_items?.length ?? 0)) {
        summaryParts.push(`items ${order.order_items?.length ?? 0} → ${items.length}`);
      }
      await logAudit({
        action: "update",
        entityType: "order",
        entityId: order.id,
        entityLabel: order.id.slice(0, 8),
        summary: summaryParts.length > 0
          ? `Edited order: ${summaryParts.join(", ")}`
          : "Edited order",
        metadata: {
          status_before: order.status,
          status_after: status,
          total_before: Number(order.total),
          total_after: total,
          item_count_before: order.order_items?.length ?? 0,
          item_count_after: items.length,
        },
      });

      // Send Telegram edit notification (best effort)
      try {
        const origQtyByPid = new Map<string, number>();
        const origItemByPid = new Map<string, any>();
        (order.order_items || []).forEach((oi) => {
          origQtyByPid.set(oi.product_id, (origQtyByPid.get(oi.product_id) || 0) + oi.quantity);
          origItemByPid.set(oi.product_id, oi);
        });
        const changes: string[] = [];
        if (statusChanged) changes.push(`Status: ${order.status} → ${status}`);
        if (totalChanged) changes.push(`Total: $${Number(order.total).toFixed(2)} → $${total.toFixed(2)}`);
        const currentPids = new Set(items.map((it) => it.product_id));
        for (const it of items) {
          const p = products.find((pp) => pp.id === it.product_id);
          const label = p ? `${p.name}${p.sku ? ` (${p.sku})` : ''}` : 'Item';
          const prev = origQtyByPid.get(it.product_id);
          if (prev === undefined) changes.push(`Added: ${label} x${it.quantity}`);
          else if (prev !== it.quantity) changes.push(`Qty: ${label} ${prev} → ${it.quantity}`);
        }
        for (const [pid, qty] of origQtyByPid.entries()) {
          if (!currentPids.has(pid)) {
            const oi = origItemByPid.get(pid);
            const label = oi?.products?.name ? `${oi.products.name}${oi.products.sku ? ` (${oi.products.sku})` : ''}` : 'Item';
            changes.push(`Removed: ${label} x${qty}`);
          }
        }
        if (order.notes !== (notes || null)) changes.push('Notes updated');
        if ((order.technician_name || null) !== (technicianName || null)) changes.push(`Technician → ${technicianName || 'N/A'}`);
        if ((order.discount_amount || 0) !== (discountAmount || 0)) {
          changes.push(`Discount: $${Number(order.discount_amount || 0).toFixed(2)} → $${(discountAmount || 0).toFixed(2)}`);
        }

        const itemsPayload = items.map((it) => {
          const p = products.find((pp) => pp.id === it.product_id);
          return {
            product_name: p?.name || 'Product',
            sku: p?.sku || '',
            quantity: it.quantity,
            line_total: it.quantity * it.unit_price,
          };
        });

        const salonObj = salons.find((s) => s.id === salonId);
        await supabase.functions.invoke('notify-new-order', {
          body: {
            orderId: order.id,
            isEdit: true,
            changes,
            orderData: {
              customer_name: customerName || salonObj?.name || null,
              customer_email: customerEmail || null,
              customer_phone: customerPhone || null,
              customer_address: customerAddress || null,
              items: itemsPayload,
              subtotal,
              tax,
              total,
              discount_amount: discountAmount || 0,
              discount_code: discountCode || null,
              technician_name: technicianName || null,
              notes: notes || null,
            },
          },
        });
      } catch (notifyErr) {
        console.error('Telegram edit notification failed:', notifyErr);
      }

      toast({ title: "Order updated", description: "Items, stock, and totals were updated." });
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!order) return null;

  return (
    <>
      <AlertDialog open={showWarning} onOpenChange={setShowWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Editing a {order.status} order
            </AlertDialogTitle>
            <AlertDialogDescription>
              This order is already <strong>{order.status}</strong>. Changes will affect stock levels,
              dashboard statistics, and referral commissions. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setShowWarning(false); onOpenChange(false); }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowWarning(false); setWarningAccepted(true); }}>
              Continue editing
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={open && (!isSensitiveStatus || warningAccepted)} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Order</DialogTitle>
          </DialogHeader>

          {isStripeOrder && (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This order was paid through Stripe. Editing is disabled to keep records in sync with the payment.
              </AlertDescription>
            </Alert>
          )}

          <div className={isStripeOrder ? "opacity-50 pointer-events-none space-y-4" : "space-y-4"}>
            {/* Customer contact */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Email</Label>
                <Input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label>Address</Label>
                <Input value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} />
              </div>
            </div>


            {/* Salon + Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Salon</Label>
                <Select value={salonId} onValueChange={setSalonId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No salon</SelectItem>
                    {salons.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ORDER_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Technician */}
            <div>
              <Label>Technician Name</Label>
              <Input
                value={technicianName}
                onChange={(e) => setTechnicianName(e.target.value)}
                placeholder="e.g. Meline"
              />
            </div>

            {/* Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-base">Items</Label>
                <Button type="button" size="sm" variant="outline" onClick={addItem}>
                  <Plus className="h-4 w-4 mr-1" /> Add item
                </Button>
              </div>
              <div className="space-y-2">
                {items.map((it, idx) => (
                  <div key={idx} className="p-2 rounded-md border bg-muted/30 space-y-1">
                    <div className="flex gap-2 items-start">
                      <div className="flex-1 min-w-0">
                        <Label className="text-xs">Product</Label>
                        <ProductPicker
                          products={products}
                          value={it.product_id}
                          onChange={(v) => updateItem(idx, "product_id", v)}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeItem(idx)}
                        className="text-destructive mt-5 shrink-0 h-7 w-7"
                        aria-label="Remove item"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <div className="flex gap-2 items-end">
                      <div>
                        <Label className="text-[10px] leading-3">Qty</Label>
                        <div className="flex items-center gap-0.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            onClick={() => updateItem(idx, "quantity", Math.max(1, (Number(it.quantity) || 1) - 1))}
                            disabled={Number(it.quantity) <= 1}
                            aria-label="Decrease quantity"
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            value={it.quantity}
                            onChange={(e) => {
                              const raw = e.target.value;
                              if (raw === "") {
                                updateItem(idx, "quantity", "" as any);
                                return;
                              }
                              const n = parseInt(raw, 10);
                              if (!isNaN(n)) updateItem(idx, "quantity", Math.max(1, n));
                            }}
                            onBlur={(e) => {
                              const n = parseInt(e.target.value, 10);
                              updateItem(idx, "quantity", isNaN(n) || n < 1 ? 1 : n);
                            }}
                            className="h-7 w-11 text-center text-xs px-1"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            onClick={() => updateItem(idx, "quantity", (Number(it.quantity) || 0) + 1)}
                            aria-label="Increase quantity"
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="w-20">
                        <Label className="text-[10px] leading-3">Price</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          value={it.unit_price}
                          onChange={(e) => updateItem(idx, "unit_price", parseFloat(e.target.value || "0"))}
                          className="h-7 text-xs px-2"
                        />
                      </div>
                      <div className="flex-1 text-right">
                        <div className="text-[10px] leading-3 text-muted-foreground">Total</div>
                        <div className="h-7 flex items-center justify-end font-medium text-sm">
                          ${((Number(it.quantity) || 0) * it.unit_price).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {items.length === 0 && (
                  <div className="text-sm text-muted-foreground text-center py-4 border rounded-md">
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No items. Click "Add item" to start.
                  </div>
                )}
              </div>
            </div>

            {stockWarnings.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <div className="font-medium mb-1">Stock issues:</div>
                  <ul className="list-disc pl-4 text-sm">
                    {stockWarnings.map((w, i) => (
                      <li key={i}>{w.name}: needs {w.delta} more, only {w.available} available</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Discount */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Discount code</Label>
                <Input value={discountCode} onChange={(e) => setDiscountCode(e.target.value)} placeholder="Optional" />
              </div>
              <div>
                <Label>Discount</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={discountInput}
                    onChange={(e) => setDiscountInput(e.target.value)}
                    placeholder="0"
                  />
                  <div className="flex border rounded-md overflow-hidden">
                    <button
                      type="button"
                      className={`px-3 text-xs ${discountType === "amount" ? "bg-primary text-primary-foreground" : "bg-background"}`}
                      onClick={() => setDiscountType("amount")}
                    >
                      $
                    </button>
                    <button
                      type="button"
                      className={`px-3 text-xs ${discountType === "percent" ? "bg-primary text-primary-foreground" : "bg-background"}`}
                      onClick={() => setDiscountType("percent")}
                    >
                      %
                    </button>
                  </div>
                </div>
                {discountType === "percent" && discountAmount > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">= ${discountAmount.toFixed(2)} off</p>
                )}
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label>Notes</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            {/* Totals */}
            <div className="border-t pt-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-sm text-primary">
                  <span>Discount</span>
                  <span>−${discountAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax</span>
                <span>${tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-semibold text-lg border-t pt-2">
                <span>Total</span>
                <span className="text-primary">${total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || isStripeOrder}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
}
