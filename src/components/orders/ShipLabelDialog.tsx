import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Printer, Truck } from "lucide-react";

interface ShipLabelDialogProps {
  order: {
    id: string;
    customer_name?: string | null;
    customer_address?: string | null;
  } | null;
  onClose: () => void;
  onLabelCreated: (orderId: string, trackingNumber: string, labelUrl: string) => void;
}

interface Rate {
  object_id: string;
  provider: string;
  servicelevel: string;
  amount: string;
  currency: string;
  days?: number;
}

interface ShippingSettings {
  id: string;
  from_name: string;
  from_street1: string;
  from_city: string;
  from_state: string;
  from_zip: string;
  from_phone: string;
  from_email: string;
  default_weight_oz: number;
  default_length_in: number;
  default_width_in: number;
  default_height_in: number;
}

export const ShipLabelDialog = ({ order, onClose, onLabelCreated }: ShipLabelDialogProps) => {
  const { toast } = useToast();
  const [settings, setSettings] = useState<ShippingSettings | null>(null);
  const [weight, setWeight] = useState("8");
  const [length, setLength] = useState("9");
  const [width, setWidth] = useState("6");
  const [height, setHeight] = useState("2");
  const [fromStreet, setFromStreet] = useState("");
  const [fromCity, setFromCity] = useState("");
  const [fromState, setFromState] = useState("");
  const [fromZip, setFromZip] = useState("");
  const [rates, setRates] = useState<Rate[]>([]);
  const [step, setStep] = useState<"form" | "rates">("form");
  const [loading, setLoading] = useState(false);
  const [buyingRateId, setBuyingRateId] = useState<string | null>(null);

  useEffect(() => {
    if (!order) return;
    setStep("form");
    setRates([]);
    supabase
      .from("shipping_settings")
      .select("*")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSettings(data as ShippingSettings);
          setWeight(String(data.default_weight_oz));
          setLength(String(data.default_length_in));
          setWidth(String(data.default_width_in));
          setHeight(String(data.default_height_in));
          setFromStreet(data.from_street1 || "");
          setFromCity(data.from_city || "");
          setFromState(data.from_state || "");
          setFromZip(data.from_zip || "");
        }
      });
  }, [order]);

  const saveSettings = async () => {
    if (!settings) return;
    await supabase
      .from("shipping_settings")
      .update({
        from_street1: fromStreet,
        from_city: fromCity,
        from_state: fromState,
        from_zip: fromZip,
        default_weight_oz: Number(weight) || 8,
        default_length_in: Number(length) || 9,
        default_width_in: Number(width) || 6,
        default_height_in: Number(height) || 2,
      })
      .eq("id", settings.id);
  };

  const getRates = async () => {
    if (!order) return;
    if (!fromStreet || !fromCity || !fromState || !fromZip) {
      toast({ title: "Missing return address", description: "Fill in your ship-from address first.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await saveSettings();
      const { data, error } = await supabase.functions.invoke("shippo-label", {
        body: {
          action: "rates",
          order_id: order.id,
          weight_oz: Number(weight) || 8,
          length: Number(length) || 9,
          width: Number(width) || 6,
          height: Number(height) || 2,
        },
      });
      if (error) throw new Error((data as any)?.error || error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      const list = ((data as any)?.rates || []) as Rate[];
      if (list.length === 0) throw new Error("No USPS rates available for this address. Check the customer address.");
      setRates(list);
      setStep("rates");
    } catch (err: any) {
      toast({ title: "Could not get rates", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const buyLabel = async (rate: Rate) => {
    if (!order) return;
    setBuyingRateId(rate.object_id);
    try {
      const { data, error } = await supabase.functions.invoke("shippo-label", {
        body: { action: "buy", order_id: order.id, rate_id: rate.object_id },
      });
      if (error) throw new Error((data as any)?.error || error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      const labelUrl = (data as any).label_url;
      const tracking = (data as any).tracking_number;
      toast({ title: "Label purchased", description: `Tracking: ${tracking}` });
      onLabelCreated(order.id, tracking, labelUrl);
      window.open(labelUrl, "_blank");
      onClose();
    } catch (err: any) {
      toast({ title: "Label purchase failed", description: err.message, variant: "destructive" });
    } finally {
      setBuyingRateId(null);
    }
  };

  return (
    <Dialog open={!!order} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Buy USPS Label
          </DialogTitle>
        </DialogHeader>
        {order && step === "form" && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Shipping to: <span className="font-medium text-foreground">{order.customer_name}</span>
              <br />{order.customer_address}
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Ship from (saved for next time)</Label>
              <Input placeholder="Street address" value={fromStreet} onChange={(e) => setFromStreet(e.target.value)} />
              <div className="grid grid-cols-3 gap-2">
                <Input placeholder="City" value={fromCity} onChange={(e) => setFromCity(e.target.value)} className="col-span-1" />
                <Input placeholder="State" value={fromState} onChange={(e) => setFromState(e.target.value)} maxLength={2} />
                <Input placeholder="ZIP" value={fromZip} onChange={(e) => setFromZip(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Package</Label>
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <Label className="text-xs">Weight (oz)</Label>
                  <Input type="number" min="1" value={weight} onChange={(e) => setWeight(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">L (in)</Label>
                  <Input type="number" min="1" value={length} onChange={(e) => setLength(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">W (in)</Label>
                  <Input type="number" min="1" value={width} onChange={(e) => setWidth(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">H (in)</Label>
                  <Input type="number" min="1" value={height} onChange={(e) => setHeight(e.target.value)} />
                </div>
              </div>
            </div>
            <Button className="w-full" onClick={getRates} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Get USPS Rates
            </Button>
          </div>
        )}
        {order && step === "rates" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Pick a rate — the label is charged to your Shippo account.</p>
            {rates.map((r) => (
              <button
                key={r.object_id}
                onClick={() => buyLabel(r)}
                disabled={!!buyingRateId}
                className="w-full flex items-center justify-between rounded-lg border p-3 text-left hover:bg-accent transition-colors disabled:opacity-50"
              >
                <div>
                  <div className="font-medium text-sm">{r.servicelevel}</div>
                  <div className="text-xs text-muted-foreground">{r.days ? `${r.days} business day${r.days === 1 ? "" : "s"}` : "USPS"}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">${Number(r.amount).toFixed(2)}</span>
                  {buyingRateId === r.object_id && <Loader2 className="h-4 w-4 animate-spin" />}
                </div>
              </button>
            ))}
            <Button variant="ghost" className="w-full" onClick={() => setStep("form")}>
              ← Change package details
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export const PrintLabelButton = ({ labelUrl }: { labelUrl: string }) => (
  <Button variant="outline" onClick={() => window.open(labelUrl, "_blank")}>
    <Printer className="h-4 w-4 mr-2" />
    Print Label
  </Button>
);
