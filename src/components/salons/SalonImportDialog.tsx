import { useRef, useState } from "react";
import { FileUp, Upload, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit-log";

interface Props {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

interface ParsedSalon {
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
}

const REQUIRED_HEADER = "name";
const ALLOWED_FIELDS = ["name", "contact_name", "phone", "email", "address", "city", "notes"] as const;

// Minimal CSV row splitter that respects double-quoted fields
function splitCsvRow(row: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const c = row[i];
    if (c === '"') {
      if (inQuotes && row[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += c;
    }
  }
  result.push(current);
  return result.map((s) => s.trim());
}

function parseCsv(text: string): { rows: ParsedSalon[]; errors: string[] } {
  const errors: string[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { rows: [], errors: ["File is empty."] };

  const rawHeader = splitCsvRow(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  if (!rawHeader.includes(REQUIRED_HEADER)) {
    errors.push(`Missing required column "name". Found: ${rawHeader.join(", ")}`);
    return { rows: [], errors };
  }

  const rows: ParsedSalon[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvRow(lines[i]);
    const obj: Record<string, string> = {};
    rawHeader.forEach((h, idx) => {
      obj[h] = (values[idx] ?? "").trim();
    });
    const name = obj["name"];
    if (!name) {
      errors.push(`Row ${i + 1}: missing name (skipped).`);
      continue;
    }
    rows.push({
      name,
      contact_name: obj["contact_name"] || null,
      phone: obj["phone"] || null,
      email: obj["email"] || null,
      address: obj["address"] || null,
      city: obj["city"] || null,
      notes: obj["notes"] || null,
    });
  }
  return { rows, errors };
}

export function SalonImportDialog({ isOpen, onOpenChange, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedSalon[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  const handleFile = async (file: File) => {
    const content = await file.text();
    setText(content);
    const { rows, errors: errs } = parseCsv(content);
    setParsed(rows);
    setErrors(errs);
  };

  const handleTextChange = (value: string) => {
    setText(value);
    if (!value.trim()) {
      setParsed([]);
      setErrors([]);
      return;
    }
    const { rows, errors: errs } = parseCsv(value);
    setParsed(rows);
    setErrors(errs);
  };

  const handleImport = async () => {
    if (parsed.length === 0) {
      toast({ title: "Nothing to import", variant: "destructive" });
      return;
    }
    setImporting(true);
    try {
      // Chunk inserts to avoid payload limits
      const CHUNK = 200;
      let inserted = 0;
      for (let i = 0; i < parsed.length; i += CHUNK) {
        const chunk = parsed.slice(i, i + CHUNK);
        const { error } = await supabase.from("salons").insert(chunk);
        if (error) throw error;
        inserted += chunk.length;
      }
      await logAudit({
        action: "import",
        entityType: "salon",
        entityLabel: `${inserted} salons`,
        summary: `Bulk imported ${inserted} salon records from CSV`,
        metadata: { count: inserted, errors_in_file: errors.length },
      });
      toast({
        title: "Import complete",
        description: `${inserted} salon${inserted === 1 ? "" : "s"} added.`,
      });
      onImported();
      onOpenChange(false);
      setText("");
      setParsed([]);
      setErrors([]);
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const template =
      "name,contact_name,phone,email,address,city,notes\n" +
      "Studio Nail Bar,Jane Doe,555-1234,jane@studio.com,123 Main St,Los Angeles,VIP client\n";
    const blob = new Blob([template], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "salon-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5" /> Import Salons from CSV
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4 mr-1" /> Choose CSV file
            </Button>
            <Button variant="ghost" size="sm" onClick={downloadTemplate}>
              Download template
            </Button>
          </div>

          <div className="space-y-2">
            <Label>CSV content (or paste here)</Label>
            <Textarea
              value={text}
              onChange={(e) => handleTextChange(e.target.value)}
              placeholder="name,contact_name,phone,email,address,city,notes"
              className="font-mono text-xs h-40"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Required: <code className="bg-muted px-1 rounded">name</code>. Optional:{" "}
            {ALLOWED_FIELDS.filter((f) => f !== "name").join(", ")}.
          </p>

          {parsed.length > 0 && (
            <div className="rounded-md border p-3 bg-emerald-500/5 border-emerald-500/30 flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <div className="font-medium text-emerald-700 dark:text-emerald-400">
                  {parsed.length} salon{parsed.length === 1 ? "" : "s"} ready to import
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Preview: {parsed.slice(0, 3).map((p) => p.name).join(", ")}
                  {parsed.length > 3 ? `, +${parsed.length - 3} more` : ""}
                </div>
              </div>
            </div>
          )}

          {errors.length > 0 && (
            <div className="rounded-md border p-3 bg-amber-500/5 border-amber-500/30 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs space-y-0.5 max-h-24 overflow-y-auto">
                <div className="font-medium text-amber-700 dark:text-amber-400">
                  {errors.length} warning{errors.length === 1 ? "" : "s"}
                </div>
                {errors.slice(0, 5).map((e, i) => (
                  <div key={i} className="text-muted-foreground">{e}</div>
                ))}
                {errors.length > 5 && (
                  <div className="text-muted-foreground">…and {errors.length - 5} more</div>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 min-h-[44px]"
              disabled={importing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              className="flex-1 min-h-[44px]"
              disabled={importing || parsed.length === 0}
            >
              {importing ? "Importing…" : `Import ${parsed.length} salon${parsed.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
