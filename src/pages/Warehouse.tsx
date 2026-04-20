import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Warehouse as WarehouseIcon,
  Package,
  Truck,
  Store,
  Plus,
  Boxes,
  DollarSign,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";

type LocationType = "warehouse" | "fba" | "consignment" | "driver";

interface StockLocation {
  id: string;
  name: string;
  type: LocationType;
  assigned_user_id: string | null;
  salon_id: string | null;
  is_active: boolean;
  is_default: boolean;
  notes: string | null;
}

interface LocationStats {
  units: number;
  value: number;
  skus: number;
}

interface Profile {
  id: string;
  full_name: string;
  email: string;
}

interface Salon {
  id: string;
  name: string;
}

const TYPE_META: Record<LocationType, { label: string; icon: typeof WarehouseIcon; color: string }> = {
  warehouse: { label: "Warehouse", icon: WarehouseIcon, color: "bg-primary/10 text-primary" },
  fba: { label: "Amazon FBA", icon: Package, color: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
  driver: { label: "Driver Van", icon: Truck, color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  consignment: { label: "Consignment", icon: Store, color: "bg-purple-500/10 text-purple-600 dark:text-purple-400" },
};

export default function Warehouse() {
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [stats, setStats] = useState<Record<string, LocationStats>>({});
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [salons, setSalons] = useState<Salon[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StockLocation | null>(null);

  const [form, setForm] = useState<{
    name: string;
    type: LocationType;
    assigned_user_id: string;
    salon_id: string;
    notes: string;
    is_active: boolean;
  }>({
    name: "",
    type: "warehouse",
    assigned_user_id: "",
    salon_id: "",
    notes: "",
    is_active: true,
  });

  const loadData = async () => {
    setLoading(true);
    const [locRes, profRes, salRes, stockRes, prodRes] = await Promise.all([
      supabase.from("stock_locations").select("*").order("is_default", { ascending: false }).order("name"),
      supabase.from("profiles").select("id, full_name, email"),
      supabase.from("salons").select("id, name").order("name"),
      supabase.from("product_stock").select("location_id, product_id, quantity"),
      supabase.from("products").select("id, cost_usd, price_usd"),
    ]);

    if (locRes.error) toast.error(locRes.error.message);
    setLocations((locRes.data ?? []) as StockLocation[]);
    setProfiles((profRes.data ?? []) as Profile[]);
    setSalons((salRes.data ?? []) as Salon[]);

    const productMap = new Map<string, { cost: number; price: number }>();
    (prodRes.data ?? []).forEach((p: any) => {
      productMap.set(p.id, { cost: Number(p.cost_usd ?? 0), price: Number(p.price_usd ?? 0) });
    });

    const aggregated: Record<string, LocationStats> = {};
    (stockRes.data ?? []).forEach((row: any) => {
      const qty = Number(row.quantity ?? 0);
      if (qty <= 0) return;
      const prod = productMap.get(row.product_id);
      const valuePer = prod?.cost && prod.cost > 0 ? prod.cost : prod?.price ?? 0;
      const cur = aggregated[row.location_id] ?? { units: 0, value: 0, skus: 0 };
      cur.units += qty;
      cur.value += qty * valuePer;
      cur.skus += 1;
      aggregated[row.location_id] = cur;
    });
    setStats(aggregated);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: "",
      type: "warehouse",
      assigned_user_id: "",
      salon_id: "",
      notes: "",
      is_active: true,
    });
    setDialogOpen(true);
  };

  const openEdit = (loc: StockLocation) => {
    setEditing(loc);
    setForm({
      name: loc.name,
      type: loc.type,
      assigned_user_id: loc.assigned_user_id ?? "",
      salon_id: loc.salon_id ?? "",
      notes: loc.notes ?? "",
      is_active: loc.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (form.type === "driver" && !form.assigned_user_id) {
      toast.error("Pick a driver (user) for this location");
      return;
    }
    if (form.type === "consignment" && !form.salon_id) {
      toast.error("Pick a salon for this consignment location");
      return;
    }

    const payload = {
      name: form.name.trim(),
      type: form.type,
      assigned_user_id: form.type === "driver" ? form.assigned_user_id : null,
      salon_id: form.type === "consignment" ? form.salon_id : null,
      notes: form.notes.trim() || null,
      is_active: form.is_active,
    };

    const { error } = editing
      ? await supabase.from("stock_locations").update(payload).eq("id", editing.id)
      : await supabase.from("stock_locations").insert(payload);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editing ? "Location updated" : "Location created");
    setDialogOpen(false);
    loadData();
  };

  const totals = Object.values(stats).reduce(
    (acc, s) => ({ units: acc.units + s.units, value: acc.value + s.value }),
    { units: 0, value: 0 }
  );

  return (
    <div className="space-y-4 md:space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <WarehouseIcon className="h-7 w-7" /> Warehouse
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track inventory across warehouses, Amazon FBA, drivers, and consignment.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> Add location
        </Button>
      </div>

      {/* Top summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs text-muted-foreground">Locations</div>
            <div className="text-2xl font-bold">{locations.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs text-muted-foreground">Total units</div>
            <div className="text-2xl font-bold flex items-center gap-1">
              <Boxes className="h-5 w-5 text-muted-foreground" />
              {totals.units.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs text-muted-foreground">Inventory value</div>
            <div className="text-2xl font-bold flex items-center gap-1">
              <DollarSign className="h-5 w-5 text-muted-foreground" />
              {totals.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs text-muted-foreground">Active</div>
            <div className="text-2xl font-bold">
              {locations.filter((l) => l.is_active).length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="stock" disabled>Stock by product</TabsTrigger>
          <TabsTrigger value="movements" disabled>Movements</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-3 mt-4">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading…</div>
          ) : locations.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No locations yet. Click "Add location" to get started.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {locations.map((loc) => {
                const meta = TYPE_META[loc.type];
                const Icon = meta.icon;
                const s = stats[loc.id] ?? { units: 0, value: 0, skus: 0 };
                const assignedName =
                  loc.type === "driver"
                    ? profiles.find((p) => p.id === loc.assigned_user_id)?.full_name
                    : loc.type === "consignment"
                    ? salons.find((sa) => sa.id === loc.salon_id)?.name
                    : null;

                return (
                  <Card key={loc.id} className={!loc.is_active ? "opacity-60" : ""}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`p-2 rounded-md ${meta.color} flex-shrink-0`}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <CardTitle className="text-base truncate">{loc.name}</CardTitle>
                            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                {meta.label}
                              </Badge>
                              {loc.is_default && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  Default
                                </Badge>
                              )}
                              {!loc.is_active && (
                                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                  Inactive
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 flex-shrink-0"
                          onClick={() => openEdit(loc)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-2">
                      {assignedName && (
                        <div className="text-xs text-muted-foreground truncate">
                          Assigned to: <span className="text-foreground font-medium">{assignedName}</span>
                        </div>
                      )}
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t">
                        <div>
                          <div className="text-[10px] text-muted-foreground uppercase">Units</div>
                          <div className="font-semibold">{s.units.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground uppercase">SKUs</div>
                          <div className="font-semibold">{s.skus.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground uppercase">Value</div>
                          <div className="font-semibold">
                            ${s.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </div>
                        </div>
                      </div>
                      {loc.notes && (
                        <div className="text-xs text-muted-foreground pt-2 border-t line-clamp-2">
                          {loc.notes}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit location" : "Add location"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm((f) => ({ ...f, type: v as LocationType }))}
                disabled={!!editing && editing.is_default}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="warehouse">Warehouse / Office</SelectItem>
                  <SelectItem value="fba">Amazon FBA</SelectItem>
                  <SelectItem value="driver">Driver Van</SelectItem>
                  <SelectItem value="consignment">Consignment (supply store)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                placeholder={
                  form.type === "driver"
                    ? "e.g. Van – Mike"
                    : form.type === "fba"
                    ? "e.g. Amazon FBA – US"
                    : form.type === "consignment"
                    ? "e.g. Salon X consignment"
                    : "e.g. Main Warehouse"
                }
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            {form.type === "driver" && (
              <div className="space-y-2">
                <Label>Assigned driver</Label>
                <Select
                  value={form.assigned_user_id}
                  onValueChange={(v) => setForm((f) => ({ ...f, assigned_user_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a user" />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name} ({p.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.type === "consignment" && (
              <div className="space-y-2">
                <Label>Salon / supply store</Label>
                <Select
                  value={form.salon_id}
                  onValueChange={(v) => setForm((f) => ({ ...f, salon_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a salon" />
                  </SelectTrigger>
                  <SelectContent>
                    {salons.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                placeholder="Optional"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">Active</div>
                <div className="text-xs text-muted-foreground">
                  Inactive locations are hidden from order fulfillment.
                </div>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>{editing ? "Save" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
