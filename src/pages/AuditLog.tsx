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
};

const PAGE_SIZE = 100;

const AuditLog = () => {
  const { toast } = useToast();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [entityFilter, setEntityFilter] = useState<string>("all");
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
  }, [entries, search, actionFilter, entityFilter]);

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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search user, action, entity…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
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
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">When</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead className="hidden md:table-cell">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No audit entries match your filters yet. Activity will be recorded as users
                      create, update, or delete records across the app.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(e.created_at), "MMM dd, HH:mm:ss")}
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
                      <TableCell>
                        <div className="capitalize text-xs text-muted-foreground">
                          {e.entity_type}
                        </div>
                        <div className="font-medium text-sm truncate max-w-[200px]">
                          {e.entity_label ?? "—"}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-[400px]">
                        {e.summary ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))
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
