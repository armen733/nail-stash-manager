import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { exportWarehouseReport, EXPORT_LABELS } from "@/lib/warehouse-exports";

interface Props {
  /** When provided, exports are scoped to this location. */
  locationId?: string;
  scopeName?: string;
  size?: "sm" | "default";
  variant?: "outline" | "default" | "ghost";
}

export function ExportMenu({ locationId, scopeName, size = "sm", variant = "outline" }: Props) {
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (type: keyof typeof EXPORT_LABELS) => {
    try {
      setBusy(type);
      const count = await exportWarehouseReport({ type, locationId, scopeName });
      toast.success(`Exported ${count} ${count === 1 ? "row" : "rows"}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Export failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size={size} variant={variant} disabled={busy !== null}>
          {busy ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-1.5" />
          )}
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs">
          {locationId ? "Export this location" : "Export all locations"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => run("stock")}>
          {EXPORT_LABELS.stock}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run("sales")}>
          {EXPORT_LABELS.sales}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run("movements")}>
          {EXPORT_LABELS.movements}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run("low-stock")}>
          {EXPORT_LABELS["low-stock"]}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
