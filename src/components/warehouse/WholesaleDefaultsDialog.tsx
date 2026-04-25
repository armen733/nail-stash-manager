import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Percent, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export default function WholesaleDefaultsDialog({ open, onOpenChange, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [discount, setDiscount] = useState<string>("0");
  const [markup, setMarkup] = useState<string>("0");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from("company_settings")
      .select("id, default_supply_store_discount_percent, default_supply_store_markup_percent")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSettingsId(data.id);
          setDiscount(String(data.default_supply_store_discount_percent ?? 0));
          setMarkup(String(data.default_supply_store_markup_percent ?? 0));
        } else {
          setSettingsId(null);
          setDiscount("0");
          setMarkup("0");
        }
        setLoading(false);
      });
  }, [open]);

  const handleSave = async () => {
    const d = Number(discount);
    const m = Number(markup);
    if (Number.isNaN(d) || d < 0 || d > 100) return toast.error("Discount must be between 0 and 100");
    if (Number.isNaN(m) || m < 0) return toast.error("Markup must be 0 or higher");

    setSaving(true);
    const payload = {
      default_supply_store_discount_percent: d,
      default_supply_store_markup_percent: m,
    };

    const { error } = settingsId
      ? await supabase.from("company_settings").update(payload).eq("id", settingsId)
      : await supabase.from("company_settings").insert(payload);

    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Wholesale defaults saved");
    onSaved?.();
    onOpenChange(false);
  };

  // Quick preview at $100 wholesale
  const previewBase = 100;
  const cost = previewBase * (1 - Number(discount || 0) / 100);
  const retail = cost * (1 + Number(markup || 0) / 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Percent className="h-4 w-4" /> Wholesale defaults
          </DialogTitle>
          <DialogDescription>
            These percentages are the global fallback for every supply store. Individual stores can still override them on their profile.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Discount off our wholesale (%)</Label>
              <div className="relative">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.5"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className="pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                What you give the supply store off your wholesale price.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Suggested resale markup (%)</Label>
              <div className="relative">
                <Input
                  type="number"
                  min={0}
                  step="0.5"
                  value={markup}
                  onChange={(e) => setMarkup(e.target.value)}
                  className="pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                What you recommend they mark up over their cost when reselling.
              </p>
            </div>

            <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
              <div className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] mb-1">
                Preview · $100 wholesale
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Their cost</span>
                <span className="font-semibold tabular-nums">${cost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Suggested retail</span>
                <span className="font-semibold tabular-nums text-primary">${retail.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
