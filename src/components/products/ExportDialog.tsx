import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
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
import { Label } from "@/components/ui/label";
import { Download, FileText } from "lucide-react";
import { Product } from "./types";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  onExportCSV: (products: Product[]) => void;
  onExportPDF: (products: Product[]) => void;
}

export function ExportDialog({
  open,
  onOpenChange,
  products,
  onExportCSV,
  onExportPDF,
}: ExportDialogProps) {
  const [exportCategory, setExportCategory] = useState("all");
  const [exportVariantType, setExportVariantType] = useState("all");

  // Get unique categories from products
  const categories = useMemo(() => {
    const cats = products.map(p => p.category).filter(Boolean);
    return Array.from(new Set(cats)).sort();
  }, [products]);

  // Get variant types for selected category
  const variantTypes = useMemo(() => {
    const filtered = exportCategory === "all" 
      ? products 
      : products.filter(p => p.category === exportCategory);
    
    const types = filtered
      .map(p => p.bit_type || p.variant_name)
      .filter(Boolean) as string[];
    
    return Array.from(new Set(types)).sort();
  }, [products, exportCategory]);

  // Filter products based on selection
  const filteredProducts = useMemo(() => {
    let result = products;
    
    if (exportCategory !== "all") {
      result = result.filter(p => p.category === exportCategory);
    }
    
    if (exportVariantType !== "all") {
      result = result.filter(p => 
        p.bit_type === exportVariantType || p.variant_name === exportVariantType
      );
    }
    
    return result;
  }, [products, exportCategory, exportVariantType]);

  // Reset variant type when category changes
  const handleCategoryChange = (value: string) => {
    setExportCategory(value);
    setExportVariantType("all");
  };

  const handleExportCSV = () => {
    onExportCSV(filteredProducts);
    onOpenChange(false);
    resetSelections();
  };

  const handleExportPDF = () => {
    onExportPDF(filteredProducts);
    onOpenChange(false);
    resetSelections();
  };

  const resetSelections = () => {
    setExportCategory("all");
    setExportVariantType("all");
  };

  return (
    <Dialog open={open} onOpenChange={(value) => {
      onOpenChange(value);
      if (!value) resetSelections();
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Products</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="export-category">Category</Label>
            <Select value={exportCategory} onValueChange={handleCategoryChange}>
              <SelectTrigger id="export-category">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent className="bg-background border z-50">
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="export-variant">Variant Type</Label>
            <Select 
              value={exportVariantType} 
              onValueChange={setExportVariantType}
              disabled={variantTypes.length === 0}
            >
              <SelectTrigger id="export-variant">
                <SelectValue placeholder="Select variant type" />
              </SelectTrigger>
              <SelectContent className="bg-background border z-50">
                <SelectItem value="all">All Variant Types</SelectItem>
                {variantTypes.map(type => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="bg-muted rounded-md p-3 text-sm">
            <span className="font-medium">{filteredProducts.length}</span> products will be exported
          </div>

          <div className="flex gap-2 pt-2">
            <Button 
              onClick={handleExportCSV} 
              className="flex-1"
              disabled={filteredProducts.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button 
              onClick={handleExportPDF} 
              className="flex-1"
              disabled={filteredProducts.length === 0}
            >
              <FileText className="mr-2 h-4 w-4" />
              Export PDF
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
