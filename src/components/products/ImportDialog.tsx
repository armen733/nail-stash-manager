import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ImportDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  importPreview: string;
  importDataCount: number;
  onImport: () => void;
}

export function ImportDialog({
  isOpen,
  onOpenChange,
  importPreview,
  importDataCount,
  onImport,
}: ImportDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5" />
            Import Products from CSV
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Preview ({importDataCount} rows detected)</Label>
            <Textarea
              value={importPreview}
              readOnly
              className="font-mono text-xs h-48"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Expected columns: name, sku, category, price_usd, stock_on_hand, reorder_level, supplier, supplier_sku, material, bit_type, grit
          </p>
          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-4">
            <Button 
              variant="outline" 
              onClick={() => onOpenChange(false)} 
              className="flex-1 min-h-[44px]"
            >
              Cancel
            </Button>
            <Button 
              onClick={onImport} 
              className="flex-1 min-h-[44px]"
            >
              Import {importDataCount} Products
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
