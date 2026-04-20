import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TrendingUp, Download, Receipt } from "lucide-react";
import { downloadCSV } from "@/lib/csv-export";
import { useToast } from "@/hooks/use-toast";
import { logAudit } from "@/lib/audit-log";

export interface PnLRow {
  warehouseId: string;
  warehouse: string;
  type: string;
  units: number;
  orders: number;
  revenue: number;
  cogs: number;
  // marginPct from sales aggregation (may be null when COGS unknown)
}

interface Props {
  rows: PnLRow[];
}

export function WarehousePnLTable({ rows }: Props) {
  const { toast } = useToast();

  const computed = useMemo(() => {
    return rows.map((r) => {
      const grossProfit = r.revenue - r.cogs;
      const marginPct = r.revenue > 0 ? (grossProfit / r.revenue) * 100 : null;
      return { ...r, grossProfit, marginPct };
    });
  }, [rows]);

  const totals = useMemo(
    () =>
      computed.reduce(
        (a, r) => ({
          revenue: a.revenue + r.revenue,
          cogs: a.cogs + r.cogs,
          grossProfit: a.grossProfit + r.grossProfit,
          units: a.units + r.units,
          orders: a.orders + r.orders,
        }),
        { revenue: 0, cogs: 0, grossProfit: 0, units: 0, orders: 0 }
      ),
    [computed]
  );
  const totalMarginPct =
    totals.revenue > 0 ? (totals.grossProfit / totals.revenue) * 100 : null;

  const exportPnL = async () => {
    const data = computed.map((r) => ({
      Warehouse: r.warehouse,
      Type: r.type,
      Units: r.units,
      Orders: r.orders,
      Revenue: r.revenue.toFixed(2),
      COGS: r.cogs.toFixed(2),
      "Gross Profit": r.grossProfit.toFixed(2),
      "Margin %": r.marginPct !== null ? r.marginPct.toFixed(1) : "n/a",
    }));
    data.push({
      Warehouse: "TOTAL",
      Type: "",
      Units: totals.units,
      Orders: totals.orders,
      Revenue: totals.revenue.toFixed(2),
      COGS: totals.cogs.toFixed(2),
      "Gross Profit": totals.grossProfit.toFixed(2),
      "Margin %": totalMarginPct !== null ? totalMarginPct.toFixed(1) : "n/a",
    });
    downloadCSV(data, "warehouse-pnl");
    await logAudit({
      action: "export",
      entityType: "warehouse",
      summary: "Exported per-warehouse P&L report",
      metadata: { rows: computed.length, totalRevenue: totals.revenue },
    });
    toast({ title: "Exported", description: "Per-warehouse P&L downloaded." });
  };

  if (computed.length === 0) {
    return (
      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Receipt className="h-5 w-5 text-primary" /> Per-warehouse P&L
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0">
          <p className="text-sm text-muted-foreground py-6 text-center">
            No sales recorded yet for this period.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-[var(--shadow-card)]">
      <CardHeader className="p-4 sm:p-6 flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Receipt className="h-5 w-5 text-primary" /> Per-warehouse P&L
        </CardTitle>
        <Button variant="outline" size="sm" onClick={exportPnL}>
          <Download className="h-4 w-4 mr-1" /> Export
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Warehouse</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Units</TableHead>
                <TableHead className="text-right hidden md:table-cell">Orders</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right hidden sm:table-cell">COGS</TableHead>
                <TableHead className="text-right">Gross Profit</TableHead>
                <TableHead className="text-right">Margin %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {computed.map((r) => (
                <TableRow key={r.warehouseId}>
                  <TableCell>
                    <div className="font-medium truncate">{r.warehouse}</div>
                    <Badge variant="secondary" className="text-[10px] capitalize mt-0.5">
                      {r.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right hidden sm:table-cell">
                    {r.units.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right hidden md:table-cell">
                    {r.orders}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    ${r.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </TableCell>
                  <TableCell className="text-right hidden sm:table-cell text-muted-foreground">
                    {r.cogs > 0
                      ? `$${r.cogs.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                      : "—"}
                  </TableCell>
                  <TableCell
                    className={`text-right font-semibold ${
                      r.grossProfit > 0
                        ? "text-emerald-600"
                        : r.grossProfit < 0
                        ? "text-destructive"
                        : ""
                    }`}
                  >
                    {r.cogs > 0
                      ? `$${r.grossProfit.toLocaleString(undefined, {
                          maximumFractionDigits: 0,
                        })}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.marginPct !== null ? (
                      <Badge
                        variant="outline"
                        className={`${
                          r.marginPct >= 30
                            ? "border-emerald-500/40 text-emerald-600"
                            : r.marginPct >= 10
                            ? ""
                            : "border-destructive/40 text-destructive"
                        }`}
                      >
                        {r.marginPct.toFixed(1)}%
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">n/a</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-bold">
                  <div className="flex items-center gap-1">
                    <TrendingUp className="h-3.5 w-3.5" /> Total
                  </div>
                </TableCell>
                <TableCell className="text-right hidden sm:table-cell font-bold">
                  {totals.units.toLocaleString()}
                </TableCell>
                <TableCell className="text-right hidden md:table-cell font-bold">
                  {totals.orders}
                </TableCell>
                <TableCell className="text-right font-bold">
                  ${totals.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </TableCell>
                <TableCell className="text-right hidden sm:table-cell font-bold text-muted-foreground">
                  ${totals.cogs.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </TableCell>
                <TableCell
                  className={`text-right font-bold ${
                    totals.grossProfit > 0
                      ? "text-emerald-600"
                      : totals.grossProfit < 0
                      ? "text-destructive"
                      : ""
                  }`}
                >
                  ${totals.grossProfit.toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}
                </TableCell>
                <TableCell className="text-right font-bold">
                  {totalMarginPct !== null ? `${totalMarginPct.toFixed(1)}%` : "—"}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
        <p className="text-[11px] text-muted-foreground p-3 border-t">
          Revenue uses the actual price recorded on each sale. COGS uses the product's cost_usd at
          the time of the sale. "—" means no cost data is set on the products sold from that
          warehouse.
        </p>
      </CardContent>
    </Card>
  );
}
