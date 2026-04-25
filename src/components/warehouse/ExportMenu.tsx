import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { exportWarehouseReport, EXPORT_LABELS } from "@/lib/warehouse-exports";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  /** When provided, exports are scoped to this location and the location picker is hidden. */
  locationId?: string;
  scopeName?: string;
  size?: "sm" | "default";
  variant?: "outline" | "default" | "ghost";
}

type ReportType = keyof typeof EXPORT_LABELS;
type LocationOption = { id: string; name: string; type: string };
type RangeMode = "all" | "month" | "custom";

const monthOptions = (count = 12) => {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({
      value,
      label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    });
  }
  return out;
};

const monthBounds = (yyyymm: string) => {
  const [y, m] = yyyymm.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0); // last day of month
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: fmt(start), end: fmt(end) };
};

export function ExportMenu({ locationId, scopeName, size = "sm", variant = "outline" }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [reportType, setReportType] = useState<ReportType>("sales");
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>(locationId ?? "all");
  const [rangeMode, setRangeMode] = useState<RangeMode>("month");
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");

  const isPointInTime = reportType === "stock" || reportType === "low-stock";

  useEffect(() => {
    if (!open || locationId) return;
    supabase
      .from("stock_locations")
      .select("id, name, type")
      .eq("is_active", true)
      .order("name")
      .then(({ data, error }) => {
        if (error) {
          toast.error(error.message);
          return;
        }
        setLocations(data ?? []);
      });
  }, [open, locationId]);

  const handleExport = async () => {
    let start: string | undefined;
    let end: string | undefined;
    if (!isPointInTime) {
      if (rangeMode === "month") {
        const b = monthBounds(selectedMonth);
        start = b.start;
        end = b.end;
      } else if (rangeMode === "custom") {
        if (!customStart || !customEnd) {
          toast.error("Please pick both a start and end date");
          return;
        }
        start = customStart;
        end = customEnd;
      }
    }

    const effectiveLocationId = locationId ?? (selectedLocation === "all" ? undefined : selectedLocation);
    const effectiveScopeName =
      scopeName ?? (effectiveLocationId
        ? locations.find((l) => l.id === effectiveLocationId)?.name
        : undefined);

    try {
      setBusy(true);
      const count = await exportWarehouseReport({
        type: reportType,
        locationId: effectiveLocationId,
        scopeName: effectiveScopeName,
        startDate: start,
        endDate: end,
      });
      toast.success(`Exported ${count} ${count === 1 ? "row" : "rows"}`);
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Export failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)}>
        <Download className="h-4 w-4 mr-1.5" />
        Export
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Export warehouse report</DialogTitle>
            <DialogDescription>
              Pick a report, location and time range. CSV file will download.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Report</Label>
              <Select value={reportType} onValueChange={(v) => setReportType(v as ReportType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(EXPORT_LABELS) as ReportType[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {EXPORT_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!locationId && (
              <div className="space-y-1.5">
                <Label>Location</Label>
                <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All locations</SelectItem>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                        <span className="text-xs text-muted-foreground ml-2 capitalize">{l.type}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {!isPointInTime && (
              <>
                <div className="space-y-1.5">
                  <Label>Date range</Label>
                  <Select value={rangeMode} onValueChange={(v) => setRangeMode(v as RangeMode)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All time</SelectItem>
                      <SelectItem value="month">Specific month</SelectItem>
                      <SelectItem value="custom">Custom range</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {rangeMode === "month" && (
                  <div className="space-y-1.5">
                    <Label>Month</Label>
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {monthOptions(24).map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {rangeMode === "custom" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>From</Label>
                      <Input
                        type="date"
                        value={customStart}
                        onChange={(e) => setCustomStart(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>To</Label>
                      <Input
                        type="date"
                        value={customEnd}
                        onChange={(e) => setCustomEnd(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            {isPointInTime && (
              <p className="text-xs text-muted-foreground">
                Stock and low-stock reports are point-in-time snapshots — date range is not used.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={handleExport} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}
              Export CSV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
