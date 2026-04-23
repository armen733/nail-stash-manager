import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Undo2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logAudit } from "@/lib/audit-log";

interface OrderItemRow {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  products?: { name?: string | null; sku?: string | null } | null;
}

interface OrderForReturn {
  id: string;
  invoice_number?: string | null;
  salon_id?: string | null;
  salons?: { name?: string | null } | null;
  customer_name?: string | null;
  total: number;
  amount_paid?: number;
  order_items?: OrderItemRow[];
}

interface Props {
  order: OrderForReturn | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted?: () => void;
}

interface LineState {
  selected: boolean;
  qty: number;
}

export function ReturnDialog({ order, open, onOpenChange, onCompleted }: Props) {
  const { toast } = useToast();
  const [lines, setLines] = useState<Record<string, LineState>>({});
  const [refundMethod, setRefundMethod] = useState<"cash" | "store_credit">("cash");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && order) {
      const init: Record<string, LineState> = {};
      (order.order_items || []).forEach((it) => {
        init[it.id] = { selected: false, qty: it.quantity };
      });
      setLines(init);
      setRefundMethod(order.salon_id ? "store_credit" : "cash");
      setReason("");
      setNotes("");
    }
  }, [open, order]);

  const refundTotal = useMemo(() => {
    if (!order) return 0;
    return (order.order_items || []).reduce((sum, it) => {
      const ls = lines[it.id];
      if (!ls?.selected) return sum;
      const qty = Math.max(0, Math.min(ls.qty, it.quantity));
      return sum + qty * Number(it.unit_price);
    }, 0);
  }, [lines, order]);

  const selectedCount = Object.values(lines).filter((l) => l.selected).length;

  const toggleLine = (id: string, max: number) => {
    setLines((prev) => ({
      ...prev,
      [id]: { selected: !prev[id]?.selected, qty: prev[id]?.qty ?? max },
    }));
  };

  const updateQty = (id: string, qty: number, max: number) => {
    const clamped = Math.max(1, Math.min(qty || 1, max));
    setLines((prev) => ({ ...prev, [id]: { selected: true, qty: clamped } }));
  };

  const handleSubmit = async () => {
    if (!order) return;
    if (refundTotal <= 0) {
      toast({ title: "Nothing to return", description: "Select at least one item with quantity > 0.", variant: "destructive" });
      return;
    }
    if (refundMethod === "store_credit" && !order.salon_id) {
      toast({ title: "No salon on order", description: "Store credit requires a salon. Use cash refund instead.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id ?? null;

      // 1) Create return header
      const { data: ret, error: retErr } = await supabase
        .from("returns")
        .insert({
          order_id: order.id,
          salon_id: order.salon_id ?? null,
          refund_method: refundMethod,
          refund_amount: refundTotal,
          reason: reason || null,
          notes: notes || null,
          created_by: userId,
        })
        .select("id")
        .single();
      if (retErr) throw retErr;

      // 2) Create return_items
      const itemsToInsert = (order.order_items || [])
        .filter((it) => lines[it.id]?.selected)
        .map((it) => {
          const qty = Math.max(1, Math.min(lines[it.id].qty, it.quantity));
          const lineTotal = qty * Number(it.unit_price);
          return {
            return_id: ret.id,
            order_item_id: it.id,
            product_id: it.product_id,
            quantity: qty,
            unit_price: Number(it.unit_price),
            line_total: lineTotal,
          };
        });

      const { error: itemsErr } = await supabase.from("return_items").insert(itemsToInsert);
      if (itemsErr) throw itemsErr;

      // 3) If store_credit, add a positive credit entry for the salon
      if (refundMethod === "store_credit" && order.salon_id) {
        const { error: credErr } = await supabase.from("salon_credits").insert({
          salon_id: order.salon_id,
          amount: refundTotal,
          source: "return",
          reference_id: ret.id,
          notes: `Return on order ${order.invoice_number ?? order.id.slice(0, 8)}`,
          created_by: userId,
        });
        if (credErr) throw credErr;
      }

      // 4) Audit log — use short order id for consistency in the audit log
      const label = order.id.slice(0, 8);
      const summary =
        refundMethod === "cash"
          ? `Cash refund $${refundTotal.toFixed(2)} on order ${label} (${itemsToInsert.length} line${itemsToInsert.length === 1 ? "" : "s"}, items not restocked)`
          : `Store credit $${refundTotal.toFixed(2)} issued to ${order.salons?.name ?? "salon"} for order ${label}`;

      await logAudit({
        action: "update",
        entityType: "order",
        entityId: order.id,
        entityLabel: label,
        summary,
        metadata: {
          return_id: ret.id,
          refund_method: refundMethod,
          refund_amount: refundTotal,
          line_count: itemsToInsert.length,
          restocked: false,
          reason: reason || null,
        },
      });

      toast({
        title: refundMethod === "cash" ? "Refund recorded" : "Store credit issued",
        description:
          refundMethod === "cash"
            ? `Order total reduced by $${refundTotal.toFixed(2)}.`
            : `$${refundTotal.toFixed(2)} added to ${order.salons?.name ?? "salon"} credit balance.`,
      });

      onCompleted?.();
      onOpenChange(false);
    } catch (err: any) {
      console.error(err);
      toast({ title: "Return failed", description: err.message ?? "Could not process return.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!order) return null;
  const items = order.order_items || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="h-5 w-5 text-primary" />
            Return items
          </DialogTitle>
          <DialogDescription>
            Order {order.invoice_number ?? order.id.slice(0, 8)} · {order.salons?.name ?? order.customer_name ?? "Walk-in"}
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Returned items are <strong>not restocked</strong> (treated as damaged). This affects only the financial side.
          </AlertDescription>
        </Alert>

        {items.length === 0 ? (
          <div className="text-center text-muted-foreground py-6">No items on this order.</div>
        ) : (
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Select items to return</Label>
            <div className="border rounded-md divide-y">
              {items.map((it) => {
                const ls = lines[it.id];
                const lineTotal = ls?.selected ? Math.max(0, Math.min(ls.qty, it.quantity)) * Number(it.unit_price) : 0;
                return (
                  <div key={it.id} className="flex items-center gap-3 p-3">
                    <Checkbox
                      checked={ls?.selected ?? false}
                      onCheckedChange={() => toggleLine(it.id, it.quantity)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{it.products?.name ?? "Unknown product"}</div>
                      <div className="text-xs text-muted-foreground">
                        {it.products?.sku ?? ""} · ${Number(it.unit_price).toFixed(2)} each · ordered {it.quantity}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={it.quantity}
                        value={ls?.qty ?? it.quantity}
                        disabled={!ls?.selected}
                        onChange={(e) => updateQty(it.id, parseInt(e.target.value, 10), it.quantity)}
                        className="w-16 h-8 text-center"
                      />
                      <div className="w-20 text-right text-sm font-semibold">
                        ${lineTotal.toFixed(2)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Refund method</Label>
          <RadioGroup
            value={refundMethod}
            onValueChange={(v) => setRefundMethod(v as "cash" | "store_credit")}
            className="grid grid-cols-1 sm:grid-cols-2 gap-2"
          >
            <label className="flex items-start gap-2 border rounded-md p-3 cursor-pointer hover:bg-muted/50">
              <RadioGroupItem value="cash" id="cash" className="mt-0.5" />
              <div>
                <div className="text-sm font-medium">Cash refund</div>
                <div className="text-xs text-muted-foreground">Reduces this order's total. You hand cash back.</div>
              </div>
            </label>
            <label className={`flex items-start gap-2 border rounded-md p-3 cursor-pointer hover:bg-muted/50 ${!order.salon_id ? "opacity-50 pointer-events-none" : ""}`}>
              <RadioGroupItem value="store_credit" id="store_credit" className="mt-0.5" disabled={!order.salon_id} />
              <div>
                <div className="text-sm font-medium">Store credit</div>
                <div className="text-xs text-muted-foreground">
                  {order.salon_id ? "Adds credit to the salon's balance for future orders." : "Requires a salon on the order."}
                </div>
              </div>
            </label>
          </RadioGroup>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="reason" className="text-xs uppercase tracking-wide text-muted-foreground">Reason</Label>
            <Input
              id="reason"
              placeholder="Defective, wrong item…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="notes" className="text-xs uppercase tracking-wide text-muted-foreground">Notes</Label>
            <Textarea
              id="notes"
              rows={1}
              placeholder="Optional"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center justify-between border-t pt-3">
          <div className="text-sm text-muted-foreground">
            {selectedCount} item{selectedCount === 1 ? "" : "s"} selected
          </div>
          <div className="text-lg font-bold text-primary">
            Refund: ${refundTotal.toFixed(2)}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving || refundTotal <= 0}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Undo2 className="h-4 w-4 mr-2" />}
            {refundMethod === "cash" ? "Refund cash" : "Issue store credit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
