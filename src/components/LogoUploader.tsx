import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, X, ImageIcon, Loader2 } from "lucide-react";

interface LogoUploaderProps {
  value: string;
  onChange: (url: string) => void;
  /** Path prefix inside the brand-assets bucket, e.g. "salons" or "supply-stores" */
  folder: string;
  label?: string;
}

const MAX_BYTES = 4 * 1024 * 1024; // 4MB

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "logo";
}

export function LogoUploader({ value, onChange, folder, label = "Logo" }: LogoUploaderProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Image is too large (max 4MB)");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${folder}/${slugify(file.name.replace(/\.[^.]+$/, ""))}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("brand-assets")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("brand-assets").getPublicUrl(path);
      onChange(data.publicUrl);
      toast.success("Logo uploaded");
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-start gap-3">
        <div className="h-16 w-16 rounded-md border border-border bg-background flex items-center justify-center overflow-hidden flex-shrink-0">
          {value ? (
            <img src={value} alt="Logo preview" className="h-full w-full object-contain" />
          ) : (
            <ImageIcon className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 space-y-2 min-w-0">
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="min-h-[36px]"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              {value ? "Replace" : "Upload"}
            </Button>
            {value && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange("")}
                disabled={uploading}
                className="min-h-[36px] text-destructive hover:text-destructive"
              >
                <X className="h-4 w-4 mr-1" /> Remove
              </Button>
            )}
          </div>
          <Input
            placeholder="…or paste an image URL"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={uploading}
            className="h-9 text-xs"
          />
        </div>
      </div>
    </div>
  );
}
