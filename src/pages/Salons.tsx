import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Building2, Search, Plus, Pencil, Trash2, Download, Filter } from "lucide-react";
import { downloadCSV } from "@/lib/csv-export";
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
import { Label } from "@/components/ui/label";

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
  const [searchTerm, setSearchTerm] = useState("");
  const [cityFilter, setCityFilter] = useState("all");
  const [salons, setSalons] = useState<Salon[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSalon, setEditingSalon] = useState<Salon | null>(null);
  const { toast } = useToast();

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
        toast({ title: "Success", description: "Salon updated successfully" });
      } else {
        const { error } = await supabase.from("salons").insert([salonData]);

        if (error) throw error;
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

    try {
      const { error } = await supabase.from("salons").delete().eq("id", id);

      if (error) throw error;
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
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Salons</h1>
          <p className="text-muted-foreground mt-1">Manage your salon clients</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Salon
            </Button>
          </DialogTrigger>
          <DialogContent>
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
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact_name">Contact Name</Label>
                <Input
                  id="contact_name"
                  value={formData.contact_name}
                  onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Input
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingSalon ? "Update Salon" : "Add Salon"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search salons..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <Select value={cityFilter} onValueChange={setCityFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {cities.map(city => (
                    <SelectItem key={city} value={city}>
                      {city === "all" ? "All Cities" : city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={exportSalons} variant="outline" size="default">
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          ) : filteredSalons.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Building2 className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No salons yet. Add your first salon client to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSalons.map((salon) => (
                <Card key={salon.id} className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-primary" />
                      <h3 className="font-semibold text-lg">{salon.name}</h3>
                    </div>
                    <div className="flex gap-2">
                      <Button size="icon" variant="ghost" onClick={() => handleEdit(salon)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDelete(salon.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1 text-sm">
                    {salon.contact_name && (
                      <p className="text-muted-foreground">Contact: {salon.contact_name}</p>
                    )}
                    {salon.phone && (
                      <p className="text-muted-foreground">Phone: {salon.phone}</p>
                    )}
                    {salon.email && (
                      <p className="text-muted-foreground">Email: {salon.email}</p>
                    )}
                    {salon.city && (
                      <p className="text-muted-foreground">City: {salon.city}</p>
                    )}
                    {salon.address && (
                      <p className="text-muted-foreground text-xs mt-2">{salon.address}</p>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Salons;