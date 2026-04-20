import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Building2, Search, Plus, Pencil, Trash2, Download, Filter, Phone, MapPin, Mail, Map, ShoppingBag } from "lucide-react";
import { SalonOrderHistory } from "@/components/salons/SalonOrderHistory";
import { downloadCSV } from "@/lib/csv-export";
import { logAudit } from "@/lib/audit-log";
import { LazyAnalyticsMap } from "@/components/lazy/LazyAnalyticsMap";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";

interface Salon {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
}

const Salons = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [cityFilter, setCityFilter] = useState("all");
  const [salons, setSalons] = useState<Salon[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSalon, setEditingSalon] = useState<Salon | null>(null);
  const [phoneToCall, setPhoneToCall] = useState<string | null>(null);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [selectedSalonForHistory, setSelectedSalonForHistory] = useState<Salon | null>(null);
  const { toast } = useToast();

  const openMaps = (address: string) => {
    // Encode the address for URL
    const encoded = encodeURIComponent(address);
    // Try Apple Maps first (works on iOS), falls back to Google Maps
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const url = isIOS 
      ? `maps://maps.apple.com/?q=${encoded}`
      : `https://maps.google.com/?q=${encoded}`;
    window.open(url, '_blank');
  };

  const handleCallPhone = (phone: string) => {
    window.location.href = `tel:${phone}`;
    setPhoneToCall(null);
  };

  const [formData, setFormData] = useState({
    name: "",
    contact_name: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    notes: "",
  });

  useEffect(() => {
    fetchSalons();
  }, []);

  // Restore scroll position when returning from salon profile
  useEffect(() => {
    if (loading) return;
    const saved = sessionStorage.getItem('salons_scrollY');
    if (saved) {
      const main = document.querySelector('main');
      if (main) {
        requestAnimationFrame(() => { main.scrollTop = Number(saved); });
      }
      sessionStorage.removeItem('salons_scrollY');
    }
  }, [loading]);

  const fetchSalons = async () => {
    try {
      const { data, error } = await supabase
        .from("salons")
        .select("*")
        .order("name");

      if (error) throw error;
      setSalons(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const salonData = {
      name: formData.name,
      contact_name: formData.contact_name || null,
      phone: formData.phone || null,
      email: formData.email || null,
      address: formData.address || null,
      city: formData.city || null,
      notes: formData.notes || null,
    };

    try {
      if (editingSalon) {
        const { error } = await supabase
          .from("salons")
          .update(salonData)
          .eq("id", editingSalon.id);

        if (error) throw error;
        await logAudit({
          action: "update",
          entityType: "salon",
          entityId: editingSalon.id,
          entityLabel: salonData.name,
          summary: `Updated salon "${salonData.name}"`,
        });
        toast({ title: "Success", description: "Salon updated successfully" });
      } else {
        const { data: created, error } = await supabase
          .from("salons")
          .insert([salonData])
          .select("id")
          .single();

        if (error) throw error;
        await logAudit({
          action: "create",
          entityType: "salon",
          entityId: created?.id,
          entityLabel: salonData.name,
          summary: `Created salon "${salonData.name}"`,
        });
        toast({ title: "Success", description: "Salon added successfully" });
      }

      setIsDialogOpen(false);
      resetForm();
      fetchSalons();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleEdit = (salon: Salon) => {
    setEditingSalon(salon);
    setFormData({
      name: salon.name,
      contact_name: salon.contact_name || "",
      phone: salon.phone || "",
      email: salon.email || "",
      address: salon.address || "",
      city: salon.city || "",
      notes: salon.notes || "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this salon?")) return;

    const target = salons.find((s) => s.id === id);
    try {
      const { error } = await supabase.from("salons").delete().eq("id", id);

      if (error) throw error;
      await logAudit({
        action: "delete",
        entityType: "salon",
        entityId: id,
        entityLabel: target?.name ?? "(unknown)",
        summary: `Deleted salon "${target?.name ?? id}"`,
      });
      toast({ title: "Success", description: "Salon deleted successfully" });
      fetchSalons();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      contact_name: "",
      phone: "",
      email: "",
      address: "",
      city: "",
      notes: "",
    });
    setEditingSalon(null);
  };

  const filteredSalons = salons.filter((salon) => {
    const matchesSearch = salon.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      salon.city?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCity = cityFilter === "all" || salon.city === cityFilter;
    return matchesSearch && matchesCity;
  });

  const cities = ["all", ...Array.from(new Set(salons.filter(s => s.city).map(s => s.city)))];

  const exportSalons = () => {
    const exportData = filteredSalons.map(s => ({
      Name: s.name,
      'Contact Name': s.contact_name || '',
      Phone: s.phone || '',
      Email: s.email || '',
      Address: s.address || '',
      City: s.city || '',
      Notes: s.notes || '',
    }));
    downloadCSV(exportData, 'salons');
    toast({ title: "Success", description: "Salons exported successfully" });
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Salons</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">Manage your salon clients · <span className="font-semibold text-foreground">{salons.length}</span> registered</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            className="min-h-[44px] w-full sm:w-auto"
            onClick={() => setIsImportOpen(true)}
          >
            <Upload className="mr-2 h-4 w-4" /> Import CSV
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button className="min-h-[44px] w-full sm:w-auto">
                <Plus className="mr-2 h-4 w-4" />
                Add Salon
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingSalon ? "Edit Salon" : "Add New Salon"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Salon Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="min-h-[44px]"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contact_name">Contact Name</Label>
                  <Input
                    id="contact_name"
                    value={formData.contact_name}
                    onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                    className="min-h-[44px]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="min-h-[44px]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="min-h-[44px]"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <AddressAutocomplete
                    value={formData.address}
                    onChange={(address, city) => {
                      setFormData({ 
                        ...formData, 
                        address,
                        ...(city && { city })
                      });
                    }}
                    placeholder="Start typing address..."
                    className="min-h-[44px]"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="min-h-[44px]"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Input
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="min-h-[44px]"
                  />
                </div>

                <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} className="min-h-[44px]">
                    Cancel
                  </Button>
                  <Button type="submit" className="min-h-[44px]">
                    {editingSalon ? "Update Salon" : "Add Salon"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          <Button variant="outline" onClick={() => setIsMapOpen(true)} className="min-h-[44px] w-full sm:w-auto">
            <Map className="mr-2 h-4 w-4" />
            View Map
          </Button>
        </div>
      </div>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader className="p-3 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search salons..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 min-h-[44px]"
              />
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <Select value={cityFilter} onValueChange={setCityFilter}>
                <SelectTrigger className="flex-1 sm:w-[180px] min-h-[44px]">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background border">
                  {cities.map(city => (
                    <SelectItem key={city} value={city}>
                      {city === "all" ? "All Cities" : city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={exportSalons} variant="outline" size="default" className="min-h-[44px]">
                <Download className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Export</span>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          ) : filteredSalons.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Building2 className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No salons yet. Add your first salon client to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {filteredSalons.map((salon) => (
                <Card key={salon.id} className="p-3 sm:p-4 cursor-pointer hover:border-primary/50 transition-colors" onClick={() => {
                  const main = document.querySelector('main');
                  if (main) sessionStorage.setItem('salons_scrollY', String(main.scrollTop));
                  navigate(`/salons/${salon.id}`);
                }}>
                  <div className="flex items-start justify-between mb-3 gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Building2 className="h-5 w-5 text-primary flex-shrink-0" />
                      <h3 className="font-semibold text-base sm:text-lg truncate">{salon.name}</h3>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); handleEdit(salon); }} className="h-10 w-10">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => { e.stopPropagation(); handleDelete(salon.id); }}
                        className="text-destructive hover:text-destructive h-10 w-10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    {salon.contact_name && (
                      <p className="text-muted-foreground truncate">Contact: {salon.contact_name}</p>
                    )}
                    {salon.phone && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setPhoneToCall(salon.phone); }}
                        className="flex items-center gap-2 text-primary hover:underline w-full text-left group"
                      >
                        <Phone className="h-4 w-4 flex-shrink-0 group-hover:scale-110 transition-transform" />
                        <span className="truncate">{salon.phone}</span>
                      </button>
                    )}
                    {salon.email && (
                      <a
                        href={`mailto:${salon.email}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-2 text-muted-foreground hover:text-primary hover:underline w-full truncate"
                      >
                        <Mail className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate">{salon.email}</span>
                      </a>
                    )}
                    {salon.address && (
                      <button
                        onClick={(e) => { e.stopPropagation(); openMaps(salon.address!); }}
                        className="flex items-center gap-2 text-muted-foreground hover:text-primary hover:underline w-full text-left group mt-2"
                      >
                        <MapPin className="h-4 w-4 flex-shrink-0 group-hover:scale-110 transition-transform" />
                        <span className="truncate text-xs">{salon.address}</span>
                      </button>
                    )}
                    {salon.city && !salon.address && (
                      <p className="text-muted-foreground truncate flex items-center gap-2">
                        <MapPin className="h-4 w-4 flex-shrink-0" />
                        {salon.city}
                      </p>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Call Confirmation Dialog */}
      <AlertDialog open={!!phoneToCall} onOpenChange={(open) => !open && setPhoneToCall(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Call this number?</AlertDialogTitle>
            <AlertDialogDescription className="flex items-center gap-2 text-lg font-medium">
              <Phone className="h-5 w-5" />
              {phoneToCall}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => phoneToCall && handleCallPhone(phoneToCall)}>
              Call
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Salon Map */}
      <LazyAnalyticsMap open={isMapOpen} onOpenChange={setIsMapOpen} />

      {/* Salon Order History */}
      <SalonOrderHistory
        salonId={selectedSalonForHistory?.id || null}
        salonName={selectedSalonForHistory?.name || ""}
        open={!!selectedSalonForHistory}
        onOpenChange={(open) => !open && setSelectedSalonForHistory(null)}
      />

      {/* Bulk CSV Import */}
      <SalonImportDialog
        isOpen={isImportOpen}
        onOpenChange={setIsImportOpen}
        onImported={fetchSalons}
      />
    </div>
  );
};

export default Salons;