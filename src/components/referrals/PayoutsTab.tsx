import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Banknote, Search, Download, CheckCheck, FileText } from "lucide-react";
import { format } from "date-fns";
import { downloadCSV } from "@/lib/csv-export";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit-log";

interface Commission {
  id: string;
  order_id: string;
  referrer_id: string;
  customer_id: string;
  order_subtotal: number;
  commission_rate: number;
  commission_amount: number;
  status: string;
  paid_at: string | null;
  created_at: string;
  referrers: { name: string; referral_code: string } | null;
  profiles: { full_name: string; email: string } | null;
}

interface Referrer {
  id: string;
  name: string;
  referral_code: string;
  email: string | null;
  phone: string | null;
}

interface Props {
  commissions: Commission[];
  referrers: Referrer[];
  onAfterPayout: () => void;
}

interface PayoutGroup {
  referrer: Referrer;
  pending: Commission[];
  paid: Commission[];
  pendingTotal: number;
  paidTotal: number;
  oldestPendingDate: Date | null;
}

export function PayoutsTab({ commissions, referrers, onAfterPayout }: Props) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [confirmGroup, setConfirmGroup] = useState<PayoutGroup | null>(null);
  const [paying, setPaying] = useState(false);

  const groups: PayoutGroup[] = useMemo(() => {
    const map = new Map<string, PayoutGroup>();
    referrers.forEach((r) => {
      map.set(r.id, {
        referrer: r,
        pending: [],
        paid: [],
        pendingTotal: 0,
        paidTotal: 0,
        oldestPendingDate: null,
      });
    });
    commissions.forEach((c) => {
      const g = map.get(c.referrer_id);
      if (!g) return;
      if (c.status === "paid") {
        g.paid.push(c);
        g.paidTotal += Number(c.commission_amount);
      } else {
        g.pending.push(c);
        g.pendingTotal += Number(c.commission_amount);
        const d = new Date(c.created_at);
        if (!g.oldestPendingDate || d < g.oldestPendingDate) g.oldestPendingDate = d;
      }
    });
    const arr = Array.from(map.values()).filter(
      (g) => g.pending.length > 0 || g.paid.length > 0
    );
    arr.sort((a, b) => b.pendingTotal - a.pendingTotal);
    return arr;
  }, [commissions, referrers]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.referrer.name.toLowerCase().includes(q) ||
        g.referrer.referral_code.toLowerCase().includes(q) ||
        (g.referrer.email ?? "").toLowerCase().includes(q)
    );
  }, [groups, search]);

  const grandPending = filteredGroups.reduce((s, g) => s + g.pendingTotal, 0);
  const grandPaid = filteredGroups.reduce((s, g) => s + g.paidTotal, 0);
  const totalPendingCount = filteredGroups.reduce((s, g) => s + g.pending.length, 0);

  const handlePayoutGroup = async () => {
    if (!confirmGroup) return;
    setPaying(true);
    try {
      const ids = confirmGroup.pending.map((c) => c.id);
      const { error } = await supabase
        .from("referral_commissions")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;

      // Recompute referrer totals
      const { data: comms } = await supabase
        .from("referral_commissions")
        .select("order_subtotal, commission_amount")
        .eq("referrer_id", confirmGroup.referrer.id);
      const totalRevenue = (comms ?? []).reduce(
        (s, c) => s + Number(c.order_subtotal),
        0
      );
      const totalCommission = (comms ?? []).reduce(
        (s, c) => s + Number(c.commission_amount),
        0
      );
      await supabase
        .from("referrers")
        .update({ total_revenue: totalRevenue, total_commission: totalCommission })
        .eq("id", confirmGroup.referrer.id);

      await logAudit({
        action: "payout",
        entityType: "commission",
        entityId: confirmGroup.referrer.id,
        entityLabel: confirmGroup.referrer.name,
        summary: `Paid out ${ids.length} commissions totaling $${confirmGroup.pendingTotal.toFixed(
          2
        )} to ${confirmGroup.referrer.name}`,
        metadata: { count: ids.length, amount: confirmGroup.pendingTotal },
      });

      toast({
        title: "Payout recorded",
        description: `Paid $${confirmGroup.pendingTotal.toFixed(2)} to ${confirmGroup.referrer.name}`,
      });
      setConfirmGroup(null);
      onAfterPayout();
    } catch (err: any) {
      toast({ title: "Payout failed", description: err.message, variant: "destructive" });
    } finally {
      setPaying(false);
    }
  };

  const exportPayoutReport = () => {
    const rows = filteredGroups.flatMap((g) =>
      g.pending.length === 0
        ? []
        : [
            {
              Referrer: g.referrer.name,
              Code: g.referrer.referral_code,
              Email: g.referrer.email ?? "",
              Phone: g.referrer.phone ?? "",
              "Pending Count": g.pending.length,
              "Pending Amount": g.pendingTotal.toFixed(2),
              "Oldest Pending": g.oldestPendingDate
                ? format(g.oldestPendingDate, "yyyy-MM-dd")
                : "",
              "Lifetime Paid": g.paidTotal.toFixed(2),
            },
          ]
    );
    if (rows.length === 0) {
      toast({ title: "Nothing to export", variant: "destructive" });
      return;
    }
    downloadCSV(rows, "payout-report");
    toast({ title: "Exported", description: `${rows.length} payout rows downloaded.` });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Total pending</div>
            <div className="text-2xl font-bold mt-1">${grandPending.toFixed(2)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {totalPendingCount} commission{totalPendingCount === 1 ? "" : "s"} across{" "}
              {filteredGroups.filter((g) => g.pending.length > 0).length} referrer
              {filteredGroups.filter((g) => g.pending.length > 0).length === 1 ? "" : "s"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Lifetime paid</div>
            <div className="text-2xl font-bold mt-1 text-emerald-600">
              ${grandPaid.toFixed(2)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col items-start justify-center h-full gap-2">
            <Button variant="outline" size="sm" onClick={exportPayoutReport} className="w-full">
              <FileText className="h-4 w-4 mr-1" /> Export payout report
            </Button>
            <p className="text-xs text-muted-foreground">
              CSV with all referrers who currently have pending payouts.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search referrers…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base flex items-center gap-2">
            <Banknote className="h-4 w-4 text-primary" /> Payouts by referrer
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Referrer</TableHead>
                  <TableHead className="text-right">Pending #</TableHead>
                  <TableHead className="text-right">Pending $</TableHead>
                  <TableHead className="hidden sm:table-cell">Oldest pending</TableHead>
                  <TableHead className="text-right hidden md:table-cell">Lifetime paid</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredGroups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No referrer payouts to show.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredGroups.map((g) => (
                    <TableRow key={g.referrer.id}>
                      <TableCell>
                        <div className="font-medium">{g.referrer.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {g.referrer.referral_code}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {g.pending.length > 0 ? (
                          <Badge variant="secondary">{g.pending.length}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        ${g.pendingTotal.toFixed(2)}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                        {g.oldestPendingDate
                          ? format(g.oldestPendingDate, "MMM dd, yyyy")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right hidden md:table-cell text-emerald-600">
                        ${g.paidTotal.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant={g.pending.length > 0 ? "default" : "outline"}
                          disabled={g.pending.length === 0}
                          onClick={() => setConfirmGroup(g)}
                        >
                          <CheckCheck className="h-4 w-4 mr-1" /> Pay out
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmGroup} onOpenChange={(o) => !o && setConfirmGroup(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm payout</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmGroup && (
                <>
                  Mark <strong>{confirmGroup.pending.length}</strong> commission
                  {confirmGroup.pending.length === 1 ? "" : "s"} totaling{" "}
                  <strong>${confirmGroup.pendingTotal.toFixed(2)}</strong> as paid to{" "}
                  <strong>{confirmGroup.referrer.name}</strong>?
                  <br />
                  <br />
                  <span className="text-xs text-muted-foreground">
                    This will record a payout entry in the audit log. The action cannot be
                    automatically reversed.
                  </span>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={paying}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePayoutGroup} disabled={paying}>
              {paying ? "Processing…" : "Confirm payout"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
