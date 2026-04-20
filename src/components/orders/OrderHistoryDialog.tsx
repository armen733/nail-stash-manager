import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, History, Clock, User } from "lucide-react";
import { format } from "date-fns";

interface Snapshot {
  status: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  notes: string | null;
  subtotal: number;
  tax: number;
  total: number;
  discount_code?: string | null;
  discount_amount?: number | null;
  items: Array<{
    product_name: string | null;
    product_sku: string | null;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
}

interface HistoryRow {
  id: string;
  edited_at: string;
  edited_by: string | null;
  snapshot: Snapshot;
  editor_name?: string;
}

interface Props {
  orderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OrderHistoryDialog({ orderId, open, onOpenChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  useEffect(() => {
    if (!open || !orderId) return;
    (async () => {
      setLoading(true);
      try {
        const { data } = await (supabase as any)
          .from("order_edit_history")
          .select("id, edited_at, edited_by, snapshot")
          .eq("order_id", orderId)
          .order("edited_at", { ascending: false });

        const rows = (data || []) as HistoryRow[];
        // Fetch editor names
        const editorIds = Array.from(new Set(rows.map((r) => r.edited_by).filter(Boolean))) as string[];
        if (editorIds.length > 0) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", editorIds);
          const nameMap = new Map((profs || []).map((p) => [p.id, p.full_name]));
          rows.forEach((r) => {
            if (r.edited_by) r.editor_name = nameMap.get(r.edited_by) || "Unknown";
          });
        }
        setHistory(rows);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, orderId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Edit History
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : history.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            No edits recorded for this order.
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Showing {history.length} previous version{history.length === 1 ? "" : "s"} of this order (most recent first).
              Each snapshot represents the order state <strong>before</strong> that edit.
            </p>
            {history.map((row, idx) => {
              const snap = row.snapshot;
              return (
                <div key={row.id} className="border rounded-lg p-4 bg-muted/30 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Version {history.length - idx}</Badge>
                      <Badge variant="secondary">{snap.status}</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {format(new Date(row.edited_at), "MMM d, yyyy h:mm a")}
                      </span>
                      {row.editor_name && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {row.editor_name}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Customer */}
                  {(snap.customer_name || snap.customer_email) && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Customer: </span>
                      <span className="font-medium">{snap.customer_name || "—"}</span>
                      {snap.customer_email && <span className="text-muted-foreground ml-1">({snap.customer_email})</span>}
                    </div>
                  )}

                  {/* Items */}
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Items</div>
                    <div className="space-y-1">
                      {snap.items.map((it, i) => (
                        <div key={i} className="flex justify-between text-sm bg-background/50 rounded px-2 py-1">
                          <div>
                            <span className="font-medium">{it.product_name || "Unknown product"}</span>
                            {it.product_sku && <span className="text-xs text-muted-foreground ml-1">({it.product_sku})</span>}
                            <span className="text-muted-foreground"> × {it.quantity}</span>
                          </div>
                          <span className="font-medium">${it.line_total.toFixed(2)}</span>
                        </div>
                      ))}
                      {snap.items.length === 0 && (
                        <div className="text-xs text-muted-foreground italic">No items</div>
                      )}
                    </div>
                  </div>

                  {/* Totals */}
                  <div className="flex justify-end gap-6 text-sm border-t pt-2">
                    <div>
                      <span className="text-muted-foreground">Subtotal: </span>
                      <span className="font-medium">${Number(snap.subtotal).toFixed(2)}</span>
                    </div>
                    {snap.discount_amount ? (
                      <div>
                        <span className="text-muted-foreground">Discount: </span>
                        <span className="font-medium">−${Number(snap.discount_amount).toFixed(2)}</span>
                      </div>
                    ) : null}
                    <div>
                      <span className="text-muted-foreground">Tax: </span>
                      <span className="font-medium">${Number(snap.tax).toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Total: </span>
                      <span className="font-semibold text-primary">${Number(snap.total).toFixed(2)}</span>
                    </div>
                  </div>

                  {snap.notes && (
                    <div className="text-xs text-muted-foreground border-t pt-2">
                      <span className="uppercase tracking-wide">Notes: </span>
                      {snap.notes}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
