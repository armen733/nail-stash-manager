import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logAudit } from "@/lib/audit-log";
import { Loader2, DollarSign } from "lucide-react";
import { format } from "date-fns";

export interface PayableOrder {
  id: string;
  invoice_number: string | null;
  total: number;
  amount_paid: number;
  balance_due: number;
  salon_id: string | null;
}

interface Props {
  order: PayableOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecorded: () => void;
}

const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "check", label: "Check" },
  { value: "transfer", label: "Bank transfer" },
  { value: "other", label: "Other" },
];

export function RecordPaymentDialog({ order, open, onOpenChange, onRecorded }: Props) {
  const { toast } = useToast();
  const [amount, setAmount] = useState<number>(0);
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [paidAt, setPaidAt] = useState(format(new Date(), "yyyy-MM-dd"));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (order && open) {
      setAmount(Number(order.balance_due) || 0);
      setMethod("cash");
      setReference("");
      setNotes("");
      setPaidAt(format(new Date(), "yyyy-MM-dd"));
    }
  }, [order, open]);

  const handleSave = async () => {
    if (!order) return;
    if (!amount || amount <= 0) {
      toast({ title: "Enter an amount greater than 0", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("payments").insert({
        order_id: order.id,
        salon_id: order.salon_id,
        amount,
        method,
        reference: reference || null,
        notes: notes || null,
        paid_at: new Date(paidAt).toISOString(),
        created_by: user?.id ?? null,
      });
      if (error) throw error;

      await logAudit({
        action: "payment",
        entityType: "order",
        entityId: order.id,
        entityLabel: order.invoice_number ?? order.id.slice(0, 8),
        summary: `Recorded $${amount.toFixed(2)} ${method} payment against ${order.invoice_number ?? order.id.slice(0, 8)}`,
        metadata: { amount, method, reference },
      });

      toast({ title: "Payment recorded", description: `$${amount.toFixed(2)} applied to ${order.invoice_number ?? "order"}.` });
      onRecorded();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Record Payment
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-md border p-3 bg-muted/30 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Invoice</span><span className="font-medium">{order.invoice_number ?? order.id.slice(0, 8)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span>${Number(order.total).toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Already paid</span><span>${Number(order.amount_paid).toFixed(2)}</span></div>
            <div className="flex justify-between font-semibold border-t pt-1 mt-1"><span>Balance due</span><span className="text-primary">${Number(order.balance_due).toFixed(2)}</span></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount</Label>
              <Input
                type="number" step="0.01" min={0.01}
                value={amount}
                onChange={(e) => setAmount(parseFloat(e.target.value || "0"))}
              />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => (<SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Reference (check #, transaction ID…)</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
