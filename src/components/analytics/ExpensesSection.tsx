import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, Plus, Printer, Receipt, Trash2, Repeat, BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";
import { ProductionOrdersSection } from "./ProductionOrdersSection";

interface Expense {
  id: string;
  category: string;
  description: string | null;
  amount: number;
  expense_date: string;
  notes: string | null;
  is_recurring: boolean;
  recurring_frequency: string | null;
}


interface Props {
  periodStart: Date;
  periodEnd: Date;
}

const PRESET_CATEGORIES = [
  "SMM",
  "Accountant",
  "Bags",
  "Zippers",
  "Business Cards",
  "Gas",
  "Shipping",
  "Software",
  "Marketing",
  "Office Supplies",
  "Travel",
  "Meals",
  "Subscriptions",
  "Other",
];

export function ExpensesSection({ periodStart, periodEnd }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState<boolean>(() => {
    try { return localStorage.getItem("analytics-expenses-open") === "1"; } catch { return false; }
  });
  const [adding, setAdding] = useState(false);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);

  const [category, setCategory] = useState("SMM");
  const [customCategory, setCustomCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [expenseDate, setExpenseDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState("monthly");
  const [subscriptionsOnly, setSubscriptionsOnly] = useState(false);


  const toggle = () => {
    setOpen((p) => {
      const next = !p;
      try { localStorage.setItem("analytics-expenses-open", next ? "1" : "0"); } catch {}
      return next;
    });
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("business_expenses")
      .select("*")
      .gte("expense_date", format(periodStart, "yyyy-MM-dd"))
      .lte("expense_date", format(periodEnd, "yyyy-MM-dd"))
      .order("expense_date", { ascending: false });
    if (error) {
      toast({ title: "Failed to load expenses", description: error.message, variant: "destructive" });
    } else {
      setExpenses(data as Expense[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, periodStart.getTime(), periodEnd.getTime()]);

  const filteredExpenses = useMemo(
    () => (subscriptionsOnly ? expenses.filter((e) => e.is_recurring) : expenses),
    [expenses, subscriptionsOnly]
  );

  const total = useMemo(() => filteredExpenses.reduce((s, e) => s + Number(e.amount || 0), 0), [filteredExpenses]);

  const byCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of filteredExpenses) map[e.category] = (map[e.category] || 0) + Number(e.amount || 0);
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [filteredExpenses]);

  const recurringTotal = useMemo(
    () => expenses.filter((e) => e.is_recurring).reduce((s, e) => s + Number(e.amount || 0), 0),
    [expenses]
  );

  const handleAdd = async () => {
    const finalCat = category === "Other" && customCategory.trim() ? customCategory.trim() : category;
    const amt = parseFloat(amount);
    if (!finalCat || !amt || amt <= 0) {
      toast({ title: "Enter a category and amount", variant: "destructive" });
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("business_expenses").insert({
      category: finalCat,
      amount: amt,
      description: description || null,
      expense_date: expenseDate,
      created_by: user?.id,
    });
    if (error) {
      toast({ title: "Failed to add expense", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Expense added" });
    setAmount("");
    setDescription("");
    setCustomCategory("");
    setAdding(false);
    load();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("business_expenses").delete().eq("id", id);
    if (error) {
      toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
      return;
    }
    setExpenses((p) => p.filter((e) => e.id !== id));
  };

  const handlePrint = () => {
    const rangeText = `${format(periodStart, "MMM d, yyyy")} - ${format(periodEnd, "MMM d, yyyy")}`;
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const rows = expenses
      .map(
        (e) => `
          <tr>
            <td>${format(new Date(e.expense_date), "MMM d, yyyy")}</td>
            <td>${esc(e.category)}</td>
            <td>${esc(e.description || "")}</td>
            <td style="text-align:right">$${Number(e.amount).toFixed(2)}</td>
          </tr>`
      )
      .join("");
    const catRows = byCategory
      .map(
        ([cat, amt]) => `
          <tr><td>${esc(cat)}</td><td style="text-align:right">$${amt.toFixed(2)}</td></tr>`
      )
      .join("");
    const html = `<!doctype html><html><head><title>Expenses Report</title>
      <style>
        @page { margin: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; padding: 24px; color: #111; }
        h1 { margin: 0 0 4px; font-size: 22px; }
        h2 { font-size: 14px; margin: 18px 0 6px; }
        .sub { color: #555; margin-bottom: 16px; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 12px; }
        th, td { border: 1px solid #ddd; padding: 6px 8px; vertical-align: top; }
        th { background: #f3f4f6; text-align: left; }
        tfoot td { font-weight: 600; background: #fafafa; }
      </style></head><body>
      <h1>Expenses Report</h1>
      <div class="sub">${rangeText} · ${expenses.length} entries · Total $${total.toFixed(2)}</div>

      <h2>By category</h2>
      <table>
        <thead><tr><th>Category</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>${catRows || `<tr><td colspan="2" style="text-align:center;color:#888">—</td></tr>`}</tbody>
        <tfoot><tr><td>Total</td><td style="text-align:right">$${total.toFixed(2)}</td></tr></tfoot>
      </table>

      <h2>All entries</h2>
      <table>
        <thead><tr><th>Date</th><th>Category</th><th>Description</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4" style="text-align:center;color:#888">No entries</td></tr>`}</tbody>
        <tfoot><tr><td colspan="3">Total</td><td style="text-align:right">$${total.toFixed(2)}</td></tr></tfoot>
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
            <Receipt className="h-5 w-5 text-orange-500" />
            Expenses
            {open && expenses.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                · ${total.toFixed(2)}
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
              <div className="text-xs text-muted-foreground">Total in period</div>
              <div className="text-xl font-semibold text-orange-500">${total.toFixed(2)}</div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Entries</div>
              <div className="text-xl font-semibold">{expenses.length}</div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Top category</div>
              <div className="text-sm font-semibold truncate">
                {byCategory[0] ? `${byCategory[0][0]} · $${byCategory[0][1].toFixed(2)}` : "—"}
              </div>
            </div>
          </div>

          {/* Add form */}
          {adding ? (
            <div className="rounded-lg border p-3 sm:p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRESET_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {category === "Other" && (
                    <Input
                      className="mt-2"
                      placeholder="Custom category"
                      value={customCategory}
                      onChange={(e) => setCustomCategory(e.target.value)}
                    />
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Amount (USD)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Date</Label>
                  <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Description (optional)</Label>
                  <Input
                    placeholder="e.g. June invoice"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
                <Button onClick={handleAdd}>Save expense</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add expense
              </Button>
              <Button variant="outline" onClick={handlePrint} disabled={expenses.length === 0}>
                <Printer className="h-4 w-4 mr-2" /> Print
              </Button>
            </div>
          )}

          {/* List */}
          <div className="rounded-lg border divide-y">
            {loading ? (
              <div className="p-4 text-center text-sm text-muted-foreground">Loading…</div>
            ) : expenses.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No expenses logged for this period.
              </div>
            ) : (
              expenses.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{e.category}</span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(e.expense_date), "MMM d, yyyy")}
                      </span>
                    </div>
                    {e.description && (
                      <div className="text-xs text-muted-foreground truncate mt-0.5">{e.description}</div>
                    )}
                  </div>
                  <div className="text-sm font-semibold text-orange-500">${Number(e.amount).toFixed(2)}</div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(e.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>

          {/* Nested: Production Orders */}
          <ProductionOrdersSection periodStart={periodStart} periodEnd={periodEnd} />
        </CardContent>

      )}
    </Card>
  );
}
