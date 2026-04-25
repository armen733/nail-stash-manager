import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { LazySupplyStoresMap } from "@/components/lazy/LazySupplyStoresMap";
import { Store, Plus, Pencil, Trash2, Phone, MapPin, Globe, Instagram, Search, Map as MapIcon, List, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit-log";

interface SupplyStore {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  default_discount_percent: number;
  default_markup_percent: number;
  status: string;
}

const emptyForm = {
  name: "",
  contact_name: "",
  phone: "",
  email: "",
  website: "",
  instagram: "",
  address: "",
  city: "",
  latitude: "" as string | number,
  longitude: "" as string | number,
  notes: "",
  default_discount_percent: "0",
  default_markup_percent: "0",
};

export default function SupplyStores() {
  const navigate = useNavigate();
  const [stores, setStores] = useState<SupplyStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SupplyStore | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("supply_stores").select("*").order("name");
    if (error) toast.error(error.message);
    setStores((data ?? []) as SupplyStore[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const goToStoreLocation = async (storeId: string) => {
    const { data, error } = await supabase
      .from("stock_locations")
      .select("id")
      .eq("supply_store_id", storeId)
      .maybeSingle();
    if (error || !data) {
      toast.error("No warehouse location linked to this store yet.");
      return;
    }
    navigate(`/warehouse/${data.id}`);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (s: SupplyStore) => {
    setEditing(s);
    setForm({
      name: s.name,
      contact_name: s.contact_name ?? "",
      phone: s.phone ?? "",
      email: s.email ?? "",
      website: s.website ?? "",
      instagram: s.instagram ?? "",
      address: s.address ?? "",
      city: s.city ?? "",
      latitude: s.latitude ?? "",
      longitude: s.longitude ?? "",
      notes: s.notes ?? "",
      default_discount_percent: String(s.default_discount_percent ?? 0),
      default_markup_percent: String(s.default_markup_percent ?? 0),
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    const payload = {
      name: form.name.trim(),
      contact_name: form.contact_name || null,
      phone: form.phone || null,
      email: form.email || null,
      website: form.website || null,
      instagram: form.instagram || null,
      address: form.address || null,
      city: form.city || null,
      latitude: form.latitude === "" ? null : Number(form.latitude),
      longitude: form.longitude === "" ? null : Number(form.longitude),
      notes: form.notes || null,
      default_discount_percent: Number(form.default_discount_percent) || 0,
      default_markup_percent: Number(form.default_markup_percent) || 0,
    };

    if (editing) {
      const { error } = await supabase.from("supply_stores").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      await logAudit({
        action: "update",
        entityType: "supply_store",
        entityId: editing.id,
        entityLabel: payload.name,
        summary: `Updated supply store "${payload.name}"`,
      });
      toast.success("Supply store updated");
    } else {
      const { data, error } = await supabase.from("supply_stores").insert(payload).select("id").single();
      if (error) return toast.error(error.message);
      await logAudit({
        action: "create",
        entityType: "supply_store",
        entityId: data?.id,
        entityLabel: payload.name,
        summary: `Created supply store "${payload.name}"`,
      });
      toast.success("Supply store added");
    }
    setDialogOpen(false);
    load();
  };

  const handleDelete = async (s: SupplyStore) => {
    if (!confirm(`Delete supply store "${s.name}"?`)) return;
    const { error } = await supabase.from("supply_stores").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    await logAudit({
      action: "delete",
      entityType: "supply_store",
      entityId: s.id,
      entityLabel: s.name,
      summary: `Deleted supply store "${s.name}"`,
    });
    toast.success("Supply store deleted");
    load();
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return stores;
    return stores.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.contact_name ?? "").toLowerCase().includes(q) ||
        (s.city ?? "").toLowerCase().includes(q),
    );
  }, [stores, search]);

  // Stores with location data for the map (use lat/lng if set; geocoding handled implicitly).
  const mapStores = useMemo(
    () =>
      filtered
        .filter((s) => s.latitude !== null && s.longitude !== null)
        .map((s) => ({
          id: s.id,
          name: s.name,
          contact_name: s.contact_name,
          phone: s.phone,
          address: s.address,
          lat: Number(s.latitude),
          lng: Number(s.longitude),
        })),
    [filtered],
  );

  const missingLocation = filtered.filter((s) => s.latitude === null || s.longitude === null);

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Store className="h-6 w-6 sm:h-7 sm:w-7" /> Supply Stores
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Wholesale partners ·{" "}
            <span className="font-semibold text-foreground">{stores.length}</span> registered
          </p>
        </div>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) {
              setEditing(null);
              setForm(emptyForm);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button onClick={openCreate} className="min-h-[44px] w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" /> Add Supply Store
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Supply Store" : "Add New Supply Store"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Store Name *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="min-h-[44px]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact_name">Contact Name</Label>
                <Input
                  id="contact_name"
                  value={form.contact_name}
                  onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                  className="min-h-[44px]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="min-h-[44px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="min-h-[44px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    placeholder="https://…"
                    value={form.website}
                    onChange={(e) => setForm({ ...form, website: e.target.value })}
                    className="min-h-[44px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="instagram">Instagram</Label>
                  <Input
                    id="instagram"
                    placeholder="@store"
                    value={form.instagram}
                    onChange={(e) => setForm({ ...form, instagram: e.target.value })}
                    className="min-h-[44px]"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <AddressAutocomplete
                  value={form.address}
                  onChange={(address, city, lat, lng) => {
                    setForm((f) => ({
                      ...f,
                      address,
                      ...(city ? { city } : {}),
                      ...(typeof lat === "number" ? { latitude: lat } : {}),
                      ...(typeof lng === "number" ? { longitude: lng } : {}),
                    }));
                  }}
                  placeholder="Start typing address..."
                  className="min-h-[44px]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className="min-h-[44px]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-md border border-border p-3 bg-muted/30">
                <div className="space-y-2">
                  <Label htmlFor="discount">Discount % off wholesale</Label>
                  <Input
                    id="discount"
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={form.default_discount_percent}
                    onChange={(e) => setForm({ ...form, default_discount_percent: e.target.value })}
                    className="min-h-[44px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="markup">Suggested resale markup %</Label>
                  <Input
                    id="markup"
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.default_markup_percent}
                    onChange={(e) => setForm({ ...form, default_markup_percent: e.target.value })}
                    className="min-h-[44px]"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Input
                  id="notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="min-h-[44px]"
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="min-h-[44px]">
                  Cancel
                </Button>
                <Button type="submit" className="min-h-[44px]">
                  {editing ? "Update Store" : "Add Store"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="list" className="space-y-4">
        <TabsList>
          <TabsTrigger value="list" className="gap-1.5">
            <List className="h-4 w-4" /> List
          </TabsTrigger>
          <TabsTrigger value="map" className="gap-1.5">
            <MapIcon className="h-4 w-4" /> Map
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, contact, or city…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 min-h-[44px]"
            />
          </div>

          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                {stores.length === 0
                  ? "No supply stores yet. Add your first wholesale partner to get started."
                  : "No matches."}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map((s) => (
                <Card
                  key={s.id}
                  className="cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => goToStoreLocation(s.id)}
                >
                  <CardHeader className="p-3 sm:p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Store className="h-5 w-5 text-primary flex-shrink-0" />
                        <h3 className="font-semibold text-base sm:text-lg truncate">{s.name}</h3>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); openEdit(s); }} className="h-9 w-9">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => { e.stopPropagation(); handleDelete(s); }}
                          className="text-destructive hover:text-destructive h-9 w-9"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 sm:p-4 pt-0 space-y-1.5 text-sm">
                    {s.contact_name && (
                      <p className="text-muted-foreground truncate">Contact: {s.contact_name}</p>
                    )}
                    {s.phone && (
                      <p className="flex items-center gap-1.5 text-muted-foreground truncate">
                        <Phone className="h-3.5 w-3.5" /> {s.phone}
                      </p>
                    )}
                    {(s.address || s.city) && (
                      <p className="flex items-center gap-1.5 text-muted-foreground truncate">
                        <MapPin className="h-3.5 w-3.5" /> {s.city || s.address}
                      </p>
                    )}
                    {s.website && (
                      <p className="flex items-center gap-1.5 text-muted-foreground truncate">
                        <Globe className="h-3.5 w-3.5" /> {s.website.replace(/^https?:\/\//, "")}
                      </p>
                    )}
                    {s.instagram && (
                      <p className="flex items-center gap-1.5 text-muted-foreground truncate">
                        <Instagram className="h-3.5 w-3.5" /> @{s.instagram.replace(/^@/, "")}
                      </p>
                    )}
                    <div className="flex items-center justify-between pt-2 border-t mt-2">
                      <div className="text-[11px] text-muted-foreground">
                        Disc {Number(s.default_discount_percent)}% · Markup {Number(s.default_markup_percent)}%
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="map" className="space-y-3">
          <LazySupplyStoresMap stores={mapStores} />
          {missingLocation.length > 0 && (
            <Card>
              <CardHeader className="p-3 sm:p-4">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <MapPin className="h-4 w-4" /> Missing location ({missingLocation.length})
                </h3>
              </CardHeader>
              <CardContent className="p-3 sm:p-4 pt-0 space-y-1.5">
                {missingLocation.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{s.name}</span>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>
                      Add address
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
