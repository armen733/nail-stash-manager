import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, Plus, Printer, Receipt, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Expense {
  id: string;
  category: string;
  description: string | null;
  amount: number;
  expense_date: string;
  notes: string | null;
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

  const total = useMemo(() => expenses.reduce((s, e) => s + Number(e.amount || 0), 0), [expenses]);

  const byCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of expenses) map[e.category] = (map[e.category] || 0) + Number(e.amount || 0);
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [expenses]);

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
        </CardContent>
      )}
    </Card>
  );
}
