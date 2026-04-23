import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, Download, History, Filter, RefreshCw } from "lucide-react";
import { downloadCSV } from "@/lib/csv-export";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface AuditEntry {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  summary: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const ACTION_VARIANTS: Record<string, string> = {
  create: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  update: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  delete: "bg-destructive/15 text-destructive border-destructive/30",
  export: "bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/30",
  import: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  payout: "bg-primary/15 text-primary border-primary/30",
  payment: "bg-primary/15 text-primary border-primary/30",
};

type Severity = "critical" | "warning" | "info";

/**
 * Severity rules (most → least specific):
 *  - CRITICAL (red):  any delete, role/user changes, payouts, payments, refunds, price changes
 *  - WARNING (yellow): stock movements, order status changes, imports, bulk updates
 *  - INFO (neutral):   everything else (creates, plain edits, exports)
 */
function getSeverity(e: { action: string; entity_type: string; summary: string | null }): Severity {
  const a = e.action.toLowerCase();
  const t = e.entity_type.toLowerCase();
  const s = (e.summary ?? "").toLowerCase();

  if (a === "delete") return "critical";
  if (a === "payout" || a === "payment") return "critical";
  if (t === "user" || t === "commission") return "critical";
  if (s.includes("price") || s.includes("cost") || s.includes("refund")) return "critical";

  if (t === "stock" || t === "warehouse") return "warning";
  if (s.includes("status") || s.includes("bulk")) return "warning";
  if (a === "import") return "warning";

  return "info";
}

const SEVERITY_ROW: Record<Severity, string> = {
  critical: "border-l-4 border-l-destructive bg-destructive/[0.04] hover:bg-destructive/[0.08]",
  warning: "border-l-4 border-l-amber-500 bg-amber-500/[0.04] hover:bg-amber-500/[0.08]",
  info: "border-l-4 border-l-transparent",
};

const SEVERITY_BADGE: Record<Severity, string> = {
  critical: "bg-destructive/15 text-destructive border-destructive/40",
  warning: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40",
  info: "bg-muted text-muted-foreground border-border",
};

const PAGE_SIZE = 100;

const AuditLog = () => {
  const { toast } = useToast();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const fetchEntries = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      setEntries((data ?? []) as AuditEntry[]);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (actionFilter !== "all" && e.action !== actionFilter) return false;
      if (entityFilter !== "all" && e.entity_type !== entityFilter) return false;
      if (severityFilter !== "all" && getSeverity(e) !== severityFilter) return false;
      if (!q) return true;
      return (
        (e.actor_name ?? "").toLowerCase().includes(q) ||
        (e.actor_email ?? "").toLowerCase().includes(q) ||
        (e.entity_label ?? "").toLowerCase().includes(q) ||
        (e.summary ?? "").toLowerCase().includes(q) ||
        e.entity_type.toLowerCase().includes(q) ||
        e.action.toLowerCase().includes(q)
      );
    });
  }, [entries, search, actionFilter, entityFilter, severityFilter]);

  const uniqueActions = useMemo(
    () => Array.from(new Set(entries.map((e) => e.action))).sort(),
    [entries]
  );
  const uniqueEntities = useMemo(
    () => Array.from(new Set(entries.map((e) => e.entity_type))).sort(),
    [entries]
  );

  const exportCsv = () => {
    const rows = filtered.map((e) => ({
      "Date/Time": format(new Date(e.created_at), "yyyy-MM-dd HH:mm:ss"),
      User: e.actor_name ?? "",
      Email: e.actor_email ?? "",
      Action: e.action,
      "Entity Type": e.entity_type,
      "Entity": e.entity_label ?? "",
      Summary: e.summary ?? "",
    }));
    downloadCSV(rows, "audit-log");
    toast({ title: "Exported", description: `${rows.length} entries downloaded.` });
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in pb-20 md:pb-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <History className="h-6 w-6 text-primary" /> Audit Log
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Activity history across the system · {filtered.length} of {entries.length} entries
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchEntries} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" /> Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search user, action, entity…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger><SelectValue placeholder="All severities" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                <SelectItem value="critical">🔴 Critical only</SelectItem>
                <SelectItem value="warning">🟡 Warning only</SelectItem>
                <SelectItem value="info">⚪ Info only</SelectItem>
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger><SelectValue placeholder="All actions" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {uniqueActions.map((a) => (
                  <SelectItem key={a} value={a} className="capitalize">{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={entityFilter} onValueChange={setEntityFilter}>
              <SelectTrigger><SelectValue placeholder="All entity types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All entity types</SelectItem>
                {uniqueEntities.map((e) => (
                  <SelectItem key={e} value={e} className="capitalize">{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground pt-1">
            <span className="font-medium">Legend:</span>
            <Badge variant="outline" className={SEVERITY_BADGE.critical}>🔴 Critical</Badge>
            <span>deletes, payouts, prices, user changes</span>
            <span className="hidden sm:inline text-border">·</span>
            <Badge variant="outline" className={SEVERITY_BADGE.warning}>🟡 Warning</Badge>
            <span>stock, status changes, imports</span>
            <span className="hidden sm:inline text-border">·</span>
            <Badge variant="outline" className={SEVERITY_BADGE.info}>⚪ Info</Badge>
            <span>routine creates/updates</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">When</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead className="hidden md:table-cell">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No audit entries match your filters yet. Activity will be recorded as users
                      create, update, or delete records across the app.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((e) => {
                    const sev = getSeverity(e);
                    return (
                      <TableRow key={e.id} className={SEVERITY_ROW[sev]}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(e.created_at), "MMM dd, HH:mm:ss")}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`capitalize text-[10px] ${SEVERITY_BADGE[sev]}`}>
                            {sev}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-sm">{e.actor_name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground truncate max-w-[180px]">
                            {e.actor_email ?? ""}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`capitalize ${ACTION_VARIANTS[e.action] ?? ""}`}
                          >
                            {e.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="min-w-[200px] align-top">
                          <div className="capitalize text-xs text-muted-foreground">
                            {e.entity_type}
                          </div>
                          <div className="font-medium text-sm break-words whitespace-normal">
                            {e.entity_label ?? "—"}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-muted-foreground min-w-[280px] break-words whitespace-normal align-top">
                          {e.summary ?? "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {entries.length >= limit && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
            Load {PAGE_SIZE} more
          </Button>
        </div>
      )}
    </div>
  );
};

export default AuditLog;
