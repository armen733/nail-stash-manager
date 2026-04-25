import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Pencil,
  Search,
  ChevronRight,
  List,
  Map as MapIcon,
} from "lucide-react";
import { toast } from "sonner";
import amazonLogo from "@/assets/amazon-logo.png";
import amazonLogoFull from "@/assets/amazon-logo-full.png";
import { ExportMenu } from "@/components/warehouse/ExportMenu";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import WarehouseLocationsMap, { type WarehousePin } from "@/components/warehouse/WarehouseLocationsMap";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";

type LocationType = "warehouse" | "fba" | "consignment" | "driver";

interface StockLocation {
  id: string;
  name: string;
  type: LocationType;
  assigned_user_id: string | null;
  salon_id: string | null;
  supply_store_id: string | null;
  is_active: boolean;
  is_default: boolean;
  notes: string | null;
}

interface LocationStats {
  units: number;
  value: number;
  retail: number;
  skus: number;
  lowSkus: number;
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

interface SupplyStoreLite {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
}

const TYPE_META: Record<
  LocationType,
  { label: string; plural: string; icon: typeof WarehouseIcon; color: string; border: string }
> = {
  warehouse: {
    label: "Warehouse",
    plural: "Warehouses",
    icon: WarehouseIcon,
    color: "bg-primary/10 text-primary",
    border: "border-l-primary",
  },
  fba: {
    label: "Amazon FBA",
    plural: "Amazon FBA",
    icon: Package,
    color: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    border: "border-l-orange-500",
  },
  driver: {
    label: "Driver Van",
    plural: "Drivers",
    icon: Truck,
    color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    border: "border-l-blue-500",
  },
  consignment: {
    label: "Supply Store",
    plural: "Supply Stores",
    icon: Store,
    color: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
    border: "border-l-purple-500",
  },
};

const TYPE_ORDER: LocationType[] = ["warehouse", "fba", "driver", "consignment"];

export default function Warehouse() {
  const navigate = useNavigate();
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [stats, setStats] = useState<Record<string, LocationStats>>({});
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [salons, setSalons] = useState<Salon[]>([]);
  const [supplyStores, setSupplyStores] = useState<SupplyStoreLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StockLocation | null>(null);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<LocationType | "all">("all");

  const [form, setForm] = useState<{
    name: string;
    type: LocationType;
    assigned_user_id: string;
    salon_id: string;
    supply_store_id: string;
    notes: string;
    is_active: boolean;
    supply_store_address: string;
    supply_store_city: string;
    supply_store_lat: number | null;
    supply_store_lng: number | null;
    supply_store_contact_name: string;
    supply_store_phone: string;
    supply_store_email: string;
    supply_store_website: string;
  }>({
    name: "",
    type: "warehouse",
    assigned_user_id: "",
    salon_id: "",
    supply_store_id: "",
    notes: "",
    is_active: true,
    supply_store_address: "",
    supply_store_city: "",
    supply_store_lat: null,
    supply_store_lng: null,
    supply_store_contact_name: "",
    supply_store_phone: "",
    supply_store_email: "",
    supply_store_website: "",
  });

  const loadData = async () => {
    setLoading(true);
    const [locRes, profRes, salRes, suppRes, stockRes, prodRes] = await Promise.all([
      supabase
        .from("stock_locations")
        .select("*")
        .order("is_default", { ascending: false })
        .order("name"),
      supabase.from("profiles").select("id, full_name, email"),
      supabase.from("salons").select("id, name").order("name"),
      supabase.from("supply_stores").select("id, name, city, address, latitude, longitude, contact_name, phone, email, website"),
      supabase.from("product_stock").select("location_id, product_id, quantity"),
      supabase.from("products").select("id, cost_usd, price_usd, reorder_level"),
    ]);

    if (locRes.error) toast.error(locRes.error.message);
    setLocations((locRes.data ?? []) as StockLocation[]);
    setProfiles((profRes.data ?? []) as Profile[]);
    setSalons((salRes.data ?? []) as Salon[]);
    setSupplyStores((suppRes.data ?? []) as SupplyStoreLite[]);

    const productMap = new Map<string, { cost: number; price: number; reorder: number }>();
    (prodRes.data ?? []).forEach((p: any) => {
      productMap.set(p.id, {
        cost: Number(p.cost_usd ?? 0),
        price: Number(p.price_usd ?? 0),
        reorder: Number(p.reorder_level ?? 0),
      });
    });

    const aggregated: Record<string, LocationStats> = {};
    (stockRes.data ?? []).forEach((row: any) => {
      const qty = Number(row.quantity ?? 0);
      if (qty <= 0) return;
      const prod = productMap.get(row.product_id);
      const costPer = prod?.cost && prod.cost > 0 ? prod.cost : prod?.price ?? 0;
      const retailPer = prod?.price ?? 0;
      const cur =
        aggregated[row.location_id] ?? { units: 0, value: 0, retail: 0, skus: 0, lowSkus: 0 };
      cur.units += qty;
      cur.value += qty * costPer;
      cur.retail += qty * retailPer;
      cur.skus += 1;
      if (prod && prod.reorder > 0 && qty <= prod.reorder) cur.lowSkus += 1;
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
      supply_store_id: "",
      notes: "",
      is_active: true,
      supply_store_address: "",
      supply_store_city: "",
      supply_store_lat: null,
      supply_store_lng: null,
      supply_store_contact_name: "",
      supply_store_phone: "",
      supply_store_email: "",
      supply_store_website: "",
    });
    setDialogOpen(true);
  };

  const openEdit = (loc: StockLocation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(loc);
    const linkedStore = loc.supply_store_id
      ? supplyStores.find((s) => s.id === loc.supply_store_id)
      : null;
    setForm({
      name: loc.name,
      type: loc.type,
      assigned_user_id: loc.assigned_user_id ?? "",
      salon_id: loc.salon_id ?? "",
      supply_store_id: loc.supply_store_id ?? "",
      notes: loc.notes ?? "",
      is_active: loc.is_active,
      supply_store_address: linkedStore?.address ?? "",
      supply_store_city: linkedStore?.city ?? "",
      supply_store_lat: linkedStore?.latitude ?? null,
      supply_store_lng: linkedStore?.longitude ?? null,
      supply_store_contact_name: linkedStore?.contact_name ?? "",
      supply_store_phone: linkedStore?.phone ?? "",
      supply_store_email: linkedStore?.email ?? "",
      supply_store_website: linkedStore?.website ?? "",
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

    let linkedSupplyStoreId: string | null =
      form.type === "consignment" ? form.supply_store_id || null : null;

    if (form.type === "consignment") {
      if (!form.supply_store_address.trim()) {
        toast.error("Add the store location");
        return;
      }

      if (form.supply_store_lat === null || form.supply_store_lng === null) {
        toast.error("Pick the location from suggestions so it appears on the map");
        return;
      }

      const storePayload = {
        name: form.name.trim(),
        address: form.supply_store_address.trim(),
        city: form.supply_store_city.trim() || null,
        latitude: form.supply_store_lat,
        longitude: form.supply_store_lng,
        contact_name: form.supply_store_contact_name.trim() || null,
        phone: form.supply_store_phone.trim() || null,
        email: form.supply_store_email.trim() || null,
        website: form.supply_store_website.trim() || null,
      };

      if (linkedSupplyStoreId) {
        const { error: storeErr } = await supabase
          .from("supply_stores")
          .update(storePayload)
          .eq("id", linkedSupplyStoreId);

        if (storeErr) {
          toast.error(`Could not save store location: ${storeErr.message}`);
          return;
        }
      } else {
        const { data: createdStore, error: storeErr } = await supabase
          .from("supply_stores")
          .insert(storePayload)
          .select("id")
          .single();

        if (storeErr || !createdStore) {
          toast.error(storeErr?.message ?? "Could not create linked supply store");
          return;
        }

        linkedSupplyStoreId = createdStore.id;
      }
    }

    const payload = {
      name: form.name.trim(),
      type: form.type,
      assigned_user_id: form.type === "driver" ? form.assigned_user_id : null,
      salon_id: null,
      supply_store_id: form.type === "consignment" ? linkedSupplyStoreId : null,
      notes: form.notes.trim() || null,
      is_active: editing?.is_default ? true : form.is_active,
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
    (acc, s) => ({
      units: acc.units + s.units,
      value: acc.value + s.value,
      retail: acc.retail + s.retail,
    }),
    { units: 0, value: 0, retail: 0 }
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return locations.filter((l) => {
      if (typeFilter !== "all" && l.type !== typeFilter) return false;
      if (!q) return true;
      const assignedName =
        l.type === "driver"
          ? profiles.find((p) => p.id === l.assigned_user_id)?.full_name ?? ""
          : l.type === "consignment"
          ? salons.find((s) => s.id === l.salon_id)?.name ?? ""
          : "";
      return (
        l.name.toLowerCase().includes(q) ||
        assignedName.toLowerCase().includes(q) ||
        (l.notes ?? "").toLowerCase().includes(q)
      );
    });
  }, [locations, search, typeFilter, profiles, salons]);

  const grouped = useMemo(() => {
    const g: Record<LocationType, StockLocation[]> = {
      warehouse: [],
      fba: [],
      driver: [],
      consignment: [],
    };
    filtered.forEach((l) => g[l.type].push(l));
    return g;
  }, [filtered]);

  const mapPins: WarehousePin[] = useMemo(() => {
    const supplyMap = new Map(supplyStores.map((s) => [s.id, s]));
    return locations
      .map<WarehousePin | null>((loc) => {
        if (!loc.is_active) return null;
        // Only consignment locations linked to a supply store with coords are shown.
        // (Salons + warehouses + drivers + FBA have no lat/lng in the schema.)
        if (loc.type !== "consignment" || !loc.supply_store_id) return null;
        const sup = supplyMap.get(loc.supply_store_id);
        if (!sup || sup.latitude === null || sup.longitude === null) return null;
        const s = stats[loc.id] ?? { units: 0, value: 0, retail: 0, skus: 0, lowSkus: 0 };
        return {
          id: loc.id,
          name: loc.name,
          type: loc.type,
          address: sup.address,
          lat: Number(sup.latitude),
          lng: Number(sup.longitude),
          supplyStoreId: sup.id,
          units: s.units,
          skus: s.skus,
        };
      })
      .filter((p): p is WarehousePin => p !== null);
  }, [locations, supplyStores, stats]);

  const renderCard = (loc: StockLocation) => {
    const meta = TYPE_META[loc.type];
    const Icon = meta.icon;
    const s = stats[loc.id] ?? { units: 0, value: 0, retail: 0, skus: 0, lowSkus: 0 };
    const assignedName =
      loc.type === "driver"
        ? profiles.find((p) => p.id === loc.assigned_user_id)?.full_name
        : loc.type === "consignment"
        ? salons.find((sa) => sa.id === loc.salon_id)?.name
        : null;
    const isEmpty = s.units === 0;

    return (
      <Card
        key={loc.id}
        onClick={() => navigate(`/warehouse/${loc.id}`)}
        className={`border-l-4 ${meta.border} cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 ${
          !loc.is_active ? "opacity-60" : ""
        }`}
      >
        <CardHeader className="pb-2 p-3 sm:p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {loc.type === "fba" ? (
                <div className="px-1.5 py-1 rounded-md bg-white border flex-shrink-0 flex items-center justify-center">
                  <img src={amazonLogoFull} alt="Amazon" className="h-4 w-auto object-contain" loading="lazy" />
                </div>
              ) : (
                <div className={`p-1.5 rounded-md ${meta.color} flex-shrink-0`}>
                  <Icon className="h-4 w-4" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <CardTitle className="text-sm sm:text-base truncate leading-tight">
                  {loc.name}
                </CardTitle>
                {assignedName && (
                  <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                    {assignedName}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={(e) => openEdit(loc, e)}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            {loc.is_default && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                Default
              </Badge>
            )}
            {!loc.is_active && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                Inactive
              </Badge>
            )}
            {s.lowSkus > 0 && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                {s.lowSkus} low
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0 p-3 sm:p-4 sm:pt-0">
          {isEmpty ? (
            <div className="text-xs text-muted-foreground italic pt-2 border-t">
              Empty — receive stock to begin
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-1 pt-2 border-t">
              <div>
                <div className="text-[10px] text-muted-foreground uppercase">Units</div>
                <div className="font-semibold text-sm">{s.units.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase">SKUs</div>
                <div className="font-semibold text-sm">{s.skus.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase">Cost</div>
                <div className="font-semibold text-sm">
                  ${s.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase">Retail</div>
                <div className="font-semibold text-sm text-primary">
                  ${s.retail.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-3 md:space-y-5 max-w-7xl mx-auto pb-20 md:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-3xl font-bold flex items-center gap-2">
            <WarehouseIcon className="h-6 w-6 md:h-7 md:w-7" /> Warehouse
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-0.5 md:mt-1">
            Track inventory across warehouses, FBA, drivers, and consignment.
          </p>
        </div>
        {/* Desktop actions */}
        <div className="hidden md:flex items-center gap-2">
          <ExportMenu />
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> Add location
          </Button>
        </div>
        {/* Mobile export (Add is FAB) */}
        <div className="md:hidden">
          <ExportMenu />
        </div>
      </div>

      {/* Horizontal summary strip */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between gap-2 text-sm flex-wrap">
            <div className="flex items-center gap-1">
              <span className="font-semibold">{locations.length}</span>
              <span className="text-muted-foreground text-xs">locations</span>
            </div>
            <div className="h-4 w-px bg-border hidden sm:block" />
            <div className="flex items-center gap-1">
              <span className="font-semibold">{totals.units.toLocaleString()}</span>
              <span className="text-muted-foreground text-xs">units</span>
            </div>
            <div className="h-4 w-px bg-border hidden sm:block" />
            <div className="flex items-center gap-1">
              <span className="font-semibold">
                ${totals.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
              <span className="text-muted-foreground text-xs">cost</span>
            </div>
            <div className="h-4 w-px bg-border hidden sm:block" />
            <div className="flex items-center gap-1">
              <span className="font-semibold text-primary">
                ${totals.retail.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
              <span className="text-muted-foreground text-xs">retail</span>
            </div>
            <div className="h-4 w-px bg-border hidden sm:block" />
            <div className="flex items-center gap-1">
              <span className="font-semibold">
                {locations.filter((l) => l.is_active).length}
              </span>
              <span className="text-muted-foreground text-xs">active</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* List / Map tabs */}
      <Tabs defaultValue="list" className="w-full">
        <TabsList>
          <TabsTrigger value="list" className="gap-1.5">
            <List className="h-3.5 w-3.5" /> List
          </TabsTrigger>
          <TabsTrigger value="map" className="gap-1.5">
            <MapIcon className="h-3.5 w-3.5" /> Map
            {mapPins.length > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 ml-1">
                {mapPins.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-3 space-y-3">
          {/* Search + filter */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search locations…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="warehouse">Warehouse</SelectItem>
                <SelectItem value="fba">Amazon FBA</SelectItem>
                <SelectItem value="driver">Drivers</SelectItem>
                <SelectItem value="consignment">Consignment</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Grouped sections */}
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground text-sm">
                {locations.length === 0
                  ? 'No locations yet. Tap "Add location" to get started.'
                  : "No locations match your filters."}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-5">
              {TYPE_ORDER.map((type) => {
                const items = grouped[type];
                if (items.length === 0) return null;
                const meta = TYPE_META[type];
                const Icon = meta.icon;
                return (
                  <section key={type} className="space-y-2">
                    <div className="flex items-center gap-2 px-1">
                      {type === "fba" ? (
                        <img src={amazonLogo} alt="" className="h-5 w-5 object-contain" loading="lazy" />
                      ) : (
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      )}
                      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        {meta.plural}
                      </h2>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                        {items.length}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
                      {items.map(renderCard)}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="map" className="mt-3">
          <WarehouseLocationsMap pins={mapPins} />
          <p className="text-[11px] text-muted-foreground mt-2 px-1">
            Pins show consignment locations linked to supply stores that have coordinates set on their profile.
          </p>
        </TabsContent>
      </Tabs>

      {/* Mobile FAB */}
      <Button
        onClick={openCreate}
        size="icon"
        className="md:hidden fixed bottom-6 right-4 h-14 w-14 rounded-full shadow-lg z-40"
        style={{ bottom: "max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 1.5rem))" }}
      >
        <Plus className="h-6 w-6" />
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col gap-0 p-0">
          <DialogHeader className="p-6 pb-4 border-b">
            <DialogTitle>{editing ? "Edit location" : "Add location"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto px-6 py-4 flex-1 min-h-0">
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
              <>
                <div className="space-y-2">
                  <Label>Location</Label>
                  <AddressAutocomplete
                    value={form.supply_store_address}
                    onChange={(address, city, lat, lng) =>
                      setForm((f) => ({
                        ...f,
                        supply_store_address: address,
                        supply_store_city: city ?? f.supply_store_city,
                        supply_store_lat: lat ?? f.supply_store_lat,
                        supply_store_lng: lng ?? f.supply_store_lng,
                      }))
                    }
                    placeholder="Search supply store address..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Pick a suggestion to save the supply store location and show it on the map.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Contact name</Label>
                  <Input
                    placeholder="Owner / manager"
                    value={form.supply_store_contact_name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, supply_store_contact_name: e.target.value }))
                    }
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input
                      placeholder="(555) 123-4567"
                      value={form.supply_store_phone}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, supply_store_phone: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      placeholder="store@example.com"
                      value={form.supply_store_email}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, supply_store_email: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Website</Label>
                  <Input
                    placeholder="https://store.example.com"
                    value={form.supply_store_website}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, supply_store_website: e.target.value }))
                    }
                  />
                </div>
              </>
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

            {!editing?.is_default && (
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
            )}
          </div>
          <DialogFooter className="p-6 pt-4 border-t">
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
