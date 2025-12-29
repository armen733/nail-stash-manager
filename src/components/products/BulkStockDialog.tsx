import { Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface BulkStockDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  stockValue: string;
  onStockValueChange: (value: string) => void;
  stockAction: "set" | "add" | "subtract";
  onStockActionChange: (action: "set" | "add" | "subtract") => void;
  onSubmit: () => void;
}

export function BulkStockDialog({
  isOpen,
  onOpenChange,
  selectedCount,
  stockValue,
  onStockValueChange,
  stockAction,
  onStockActionChange,
  onSubmit,
}: BulkStockDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Boxes className="h-5 w-5" />
            Update Stock for {selectedCount} Product(s)
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Action</Label>
            <Select value={stockAction} onValueChange={(v) => onStockActionChange(v as typeof stockAction)}>
              <SelectTrigger className="min-h-[44px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="set">Set stock to</SelectItem>
                <SelectItem value="add">Add to current stock</SelectItem>
                <SelectItem value="subtract">Subtract from current stock</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Quantity</Label>
            <Input
              type="number"
              min="0"
              value={stockValue}
              onChange={(e) => onStockValueChange(e.target.value)}
              placeholder="Enter quantity"
              className="min-h-[44px]"
            />
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-4">
            <Button 
              variant="outline" 
              onClick={() => onOpenChange(false)} 
              className="flex-1 min-h-[44px]"
            >
              Cancel
            </Button>
            <Button 
              onClick={onSubmit} 
              className="flex-1 min-h-[44px]"
            >
              Update Stock
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
