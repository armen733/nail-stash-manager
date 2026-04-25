import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

interface CompanyBrand {
  id?: string;
  company_name: string;
  logo_url: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  website: string | null;
  instagram: string | null;
  address: string | null;
  tagline: string | null;
}

const empty: CompanyBrand = {
  company_name: "",
  logo_url: "",
  contact_phone: "",
  contact_email: "",
  website: "",
  instagram: "",
  address: "",
  tagline: "",
};

export default function CompanyBrandCard() {
  const [brand, setBrand] = useState<CompanyBrand>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("company_settings").select("*").limit(1).maybeSingle();
      if (data) {
        setBrand({
          id: data.id,
          company_name: data.company_name ?? "",
          logo_url: data.logo_url ?? "",
          contact_phone: data.contact_phone ?? "",
          contact_email: data.contact_email ?? "",
          website: data.website ?? "",
          instagram: data.instagram ?? "",
          address: data.address ?? "",
          tagline: data.tagline ?? "",
        });
      }
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const payload = {
      company_name: brand.company_name || "NÉRA Beauty",
      logo_url: brand.logo_url || null,
      contact_phone: brand.contact_phone || null,
      contact_email: brand.contact_email || null,
      website: brand.website || null,
      instagram: brand.instagram || null,
      address: brand.address || null,
      tagline: brand.tagline || null,
    };
    const { error } = brand.id
      ? await supabase.from("company_settings").update(payload).eq("id", brand.id)
      : await supabase.from("company_settings").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Brand info saved");
  };

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4" /> Brand info
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Used on printed wholesale catalogs and other branded documents.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="cn">Company name</Label>
            <Input id="cn" value={brand.company_name} onChange={(e) => setBrand({ ...brand, company_name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tg">Tagline</Label>
            <Input id="tg" value={brand.tagline ?? ""} onChange={(e) => setBrand({ ...brand, tagline: e.target.value })} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lg">Logo URL</Label>
          <Input id="lg" placeholder="https://…" value={brand.logo_url ?? ""} onChange={(e) => setBrand({ ...brand, logo_url: e.target.value })} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ph">Contact phone</Label>
            <Input id="ph" value={brand.contact_phone ?? ""} onChange={(e) => setBrand({ ...brand, contact_phone: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="em">Contact email</Label>
            <Input id="em" type="email" value={brand.contact_email ?? ""} onChange={(e) => setBrand({ ...brand, contact_email: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ws">Website</Label>
            <Input id="ws" placeholder="https://…" value={brand.website ?? ""} onChange={(e) => setBrand({ ...brand, website: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ig">Instagram</Label>
            <Input id="ig" placeholder="@brand" value={brand.instagram ?? ""} onChange={(e) => setBrand({ ...brand, instagram: e.target.value })} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ad">Address</Label>
          <Textarea id="ad" rows={2} value={brand.address ?? ""} onChange={(e) => setBrand({ ...brand, address: e.target.value })} />
        </div>
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save brand info"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
