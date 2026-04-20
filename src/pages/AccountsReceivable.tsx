import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Wallet, Search, Download, RefreshCw, ExternalLink } from "lucide-react";
import { downloadCSV } from "@/lib/csv-export";
import { differenceInDays, format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface ARRow {
  salon_id: string | null;
  salon_name: string;
  current: number;     // 0-30
  bucket_30: number;   // 31-60
  bucket_60: number;   // 61-90
  bucket_90: number;   // 90+
  total_due: number;
  oldest_days: number;
  open_invoices: number;
}

const PAID_STATUS = "Paid";

const AccountsReceivable = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ARRow[]>([]);
  const [search, setSearch] = useState("");

  const fetchAR = async () => {
    setLoading(true);
    try {
      // Fetch all unpaid orders with salon info
      const { data, error } = await supabase
        .from("orders")
        .select("id, salon_id, order_date, total, amount_paid, balance_due, status, salons(name)")
        .gt("balance_due", 0)
        .neq("status", PAID_STATUS);
      if (error) throw error;

      const map = new Map<string, ARRow>();
      const today = new Date();
      (data || []).forEach((o: any) => {
        const key = o.salon_id ?? "_walkin";
        const name = o.salons?.name ?? "Walk-in / no salon";
        const days = differenceInDays(today, new Date(o.order_date));
        const due = Number(o.balance_due);

        const r = map.get(key) ?? {
          salon_id: o.salon_id,
          salon_name: name,
          current: 0, bucket_30: 0, bucket_60: 0, bucket_90: 0,
          total_due: 0, oldest_days: 0, open_invoices: 0,
        };
        if (days <= 30) r.current += due;
        else if (days <= 60) r.bucket_30 += due;
        else if (days <= 90) r.bucket_60 += due;
        else r.bucket_90 += due;
        r.total_due += due;
        r.oldest_days = Math.max(r.oldest_days, days);
        r.open_invoices += 1;
        map.set(key, r);
      });

      setRows(Array.from(map.values()).sort((a, b) => b.total_due - a.total_due));
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAR(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.salon_name.toLowerCase().includes(q));
  }, [rows, search]);

  const totals = useMemo(() => filtered.reduce((acc, r) => ({
    current: acc.current + r.current,
    bucket_30: acc.bucket_30 + r.bucket_30,
    bucket_60: acc.bucket_60 + r.bucket_60,
    bucket_90: acc.bucket_90 + r.bucket_90,
    total_due: acc.total_due + r.total_due,
    open_invoices: acc.open_invoices + r.open_invoices,
  }), { current: 0, bucket_30: 0, bucket_60: 0, bucket_90: 0, total_due: 0, open_invoices: 0 }), [filtered]);

  const exportCsv = () => {
    downloadCSV(filtered.map((r) => ({
      Salon: r.salon_name,
      "Open Invoices": r.open_invoices,
      "Oldest (days)": r.oldest_days,
      "0-30": r.current.toFixed(2),
      "31-60": r.bucket_30.toFixed(2),
      "61-90": r.bucket_60.toFixed(2),
      "90+": r.bucket_90.toFixed(2),
      "Total Due": r.total_due.toFixed(2),
    })), `accounts-receivable-${format(new Date(), "yyyyMMdd")}`);
    toast({ title: "Exported", description: `${filtered.length} salons.` });
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in pb-20 md:pb-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" /> Accounts Receivable
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Outstanding balances per salon · {totals.open_invoices} open invoice{totals.open_invoices === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchAR} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Aging summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">0–30 days</div>
          <div className="text-xl font-bold">${totals.current.toFixed(2)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">31–60 days</div>
          <div className="text-xl font-bold text-amber-600">${totals.bucket_30.toFixed(2)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">61–90 days</div>
          <div className="text-xl font-bold text-orange-600">${totals.bucket_60.toFixed(2)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">90+ days</div>
          <div className="text-xl font-bold text-destructive">${totals.bucket_90.toFixed(2)}</div>
        </CardContent></Card>
        <Card className="bg-primary/5 border-primary/30"><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Total outstanding</div>
          <div className="text-xl font-bold text-primary">${totals.total_due.toFixed(2)}</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-base">By Salon</CardTitle>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search salon…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Salon</TableHead>
                  <TableHead className="text-center">Invoices</TableHead>
                  <TableHead className="text-center">Oldest</TableHead>
                  <TableHead className="text-right">0–30</TableHead>
                  <TableHead className="text-right">31–60</TableHead>
                  <TableHead className="text-right">61–90</TableHead>
                  <TableHead className="text-right">90+</TableHead>
                  <TableHead className="text-right">Total Due</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    🎉 No outstanding balances.
                  </TableCell></TableRow>
                ) : (
                  filtered.map((r) => (
                    <TableRow key={r.salon_id ?? "_walkin"}>
                      <TableCell className="font-medium">{r.salon_name}</TableCell>
                      <TableCell className="text-center">{r.open_invoices}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={
                          r.oldest_days > 90 ? "border-destructive/40 text-destructive" :
                          r.oldest_days > 60 ? "border-orange-500/40 text-orange-600" :
                          r.oldest_days > 30 ? "border-amber-500/40 text-amber-600" :
                          "border-emerald-500/40 text-emerald-700"
                        }>
                          {r.oldest_days}d
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">${r.current.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-amber-700 dark:text-amber-400">${r.bucket_30.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-orange-700 dark:text-orange-400">${r.bucket_60.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-destructive">${r.bucket_90.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-semibold">${r.total_due.toFixed(2)}</TableCell>
                      <TableCell>
                        {r.salon_id && (
                          <Button asChild variant="ghost" size="sm">
                            <Link to={`/salons/${r.salon_id}`}>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AccountsReceivable;
