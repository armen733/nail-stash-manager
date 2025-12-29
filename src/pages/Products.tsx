import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Package, Search, Plus, Pencil, Trash2, Upload, X, ShoppingCart, Minus, Download, Filter, Copy, Trash, Eye, Share2, MoreVertical, CheckCircle2, LayoutGrid, List, FileUp, Boxes } from "lucide-react";
import { downloadCSV } from "@/lib/csv-export";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ImageCarousel } from "@/components/ImageCarousel";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Import product components
import { 
  Product, 
  ProductImage, 
  CartItem, 
  ProductFormData, 
  defaultFormData 
} from "@/components/products/types";
import { ProductCard } from "@/components/products/ProductCard";
import { CartPanel } from "@/components/products/CartPanel";
import { BulkStockDialog } from "@/components/products/BulkStockDialog";
import { ImportDialog } from "@/components/products/ImportDialog";
import { useProducts, PRODUCTS_QUERY_KEY } from "@/hooks/useProducts";
import { ProductGridSkeleton } from "@/components/skeletons/ProductCardSkeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useCategoryVariantTypes, getCategories, getVariantTypesForCategory } from "@/hooks/useCategoryVariantTypes";
import { useDebounce } from "@/hooks/useDebounce";

const Products = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  // Use React Query for products
  const { data: productsData, isLoading: loading } = useProducts();
  const products = productsData?.products || [];
  const allProducts = productsData?.allProducts || [];
  const queryMaxPrice = productsData?.maxPrice || 1000;

  // Fetch category-variant type mappings from database
  const { data: categoryVariantTypes = [] } = useCategoryVariantTypes();

  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 300); // Debounce search for performance
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"name" | "price" | "stock">("name");
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [existingImages, setExistingImages] = useState<ProductImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [isConverterOpen, setIsConverterOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedParentId, setSelectedParentId] = useState<string>("");
  const [selectedVariantProducts, setSelectedVariantProducts] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  // New state for improvements
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [isBulkStockOpen, setIsBulkStockOpen] = useState(false);
  const [bulkStockValue, setBulkStockValue] = useState("");
  const [bulkStockAction, setBulkStockAction] = useState<"set" | "add" | "subtract">("set");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importData, setImportData] = useState<any[]>([]);
  const [importPreview, setImportPreview] = useState<string>("");
  
  // Advanced filters
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [stockStatusFilter, setStockStatusFilter] = useState<"all" | "in_stock" | "low_stock" | "out_of_stock">("all");
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 1000]);
  const [maxPrice, setMaxPrice] = useState(1000);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [advancedCategoryFilter, setAdvancedCategoryFilter] = useState("all");
  const [variantTypeFilter, setVariantTypeFilter] = useState("all");

  const [formData, setFormData] = useState<ProductFormData>(defaultFormData);

  // Update maxPrice when query data changes
  useEffect(() => {
    if (queryMaxPrice > 0) {
      setMaxPrice(queryMaxPrice);
      setPriceRange([0, queryMaxPrice]);
    }
  }, [queryMaxPrice]);

  // Invalidate products query instead of manual refetch
  const refreshProducts = () => {
    queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
  };

  // Get all unique suppliers
  const getUniqueSuppliers = () => {
    const suppliers = allProducts.map(p => p.supplier).filter(Boolean) as string[];
    return Array.from(new Set(suppliers)).sort();
  };

  // Get all unique categories from existing products
  const getUniqueCategories = () => {
    const categories = allProducts.map(p => p.category).filter(Boolean);
    return Array.from(new Set(categories)).sort();
  };

  // Get all unique variant types from category_variant_types table
  const getUniqueVariantTypes = () => {
    return getVariantTypesForCategory(categoryVariantTypes, "all");
  };

  // Get variant types for a specific category from category_variant_types table
  const getVariantTypesForCategoryFilter = (category: string) => {
    return getVariantTypesForCategory(categoryVariantTypes, category);
  };

  // Get variant types for form dropdown (using category_variant_types table)
  const getVariantTypesForFormCategory = (category: string) => {
    return getVariantTypesForCategory(categoryVariantTypes, category);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newFiles = Array.from(files);
      setImageFiles(prev => [...prev, ...newFiles]);
      
      newFiles.forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          setImagePreviews(prev => [...prev, reader.result as string]);
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const removeImagePreview = (index: number) => {
    setImageFiles(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const removeExistingImage = async (imageId: string) => {
    try {
      const { error } = await (supabase as any)
        .from("product_images")
        .delete()
        .eq("id", imageId);

      if (error) throw error;
      
      setExistingImages(prev => prev.filter(img => img.id !== imageId));
      toast({ title: "Success", description: "Image removed" });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const uploadImages = async (productId: string) => {
    if (imageFiles.length === 0) return;

    setUploading(true);
    try {
      const uploadedImages: { image_url: string; display_order: number }[] = [];
      
      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('product-images')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('product-images')
          .getPublicUrl(filePath);

        uploadedImages.push({
          image_url: publicUrl,
          display_order: existingImages.length + i,
        });
      }

      // Insert all uploaded images
      const { error: insertError } = await (supabase as any)
        .from("product_images")
        .insert(
          uploadedImages.map(img => ({
            product_id: productId,
            image_url: img.image_url,
            display_order: img.display_order,
          }))
        );

      if (insertError) throw insertError;

      toast({ title: "Success", description: `${uploadedImages.length} image(s) uploaded` });
    } catch (error: any) {
      toast({
        title: "Upload Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const productData = {
      name: formData.name,
      category: formData.category,
      material: formData.material || null,
      shape: formData.shape || null,
      direction: formData.direction || null,
      bit_type: formData.bit_type || null,
      grit: formData.grit || null,
      unit: formData.unit || null,
      sku: formData.sku,
      price_usd: parseFloat(formData.price_usd),
      salon_price_usd: formData.salon_price_usd ? parseFloat(formData.salon_price_usd) : null,
      wholesale_price_usd: formData.wholesale_price_usd ? parseFloat(formData.wholesale_price_usd) : null,
      image_url: null, // Deprecated, using product_images table now
      stock_on_hand: parseInt(formData.stock_on_hand) || 0,
      stock_reserved: parseInt(formData.stock_reserved) || 0,
      reorder_level: parseInt(formData.reorder_level) || 10,
      supplier: formData.supplier || null,
      is_parent: formData.is_parent || false,
      parent_product_id: formData.parent_product_id || null,
      variant_name: formData.variant_name || null,
    };

    try {
      let productId: string;

      if (editingProduct) {
        const { error } = await supabase
          .from("products")
          .update(productData)
          .eq("id", editingProduct.id);

        if (error) throw error;
        productId = editingProduct.id;
        
        // Upload new images
        await uploadImages(productId);
        
        toast({ title: "Success", description: "Product updated successfully" });
      } else {
        const { data, error } = await supabase
          .from("products")
          .insert([productData])
          .select()
          .single();

        if (error) throw error;
        productId = data.id;
        
        // Upload images for new product
        await uploadImages(productId);
        
        toast({ title: "Success", description: "Product added successfully" });
      }

      setIsDialogOpen(false);
      resetForm();
      refreshProducts();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this product?")) return;

    try {
      const { error } = await supabase.from("products").delete().eq("id", id);

      if (error) throw error;
      toast({ title: "Success", description: "Product deleted successfully" });
      refreshProducts();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setFormData(defaultFormData);
    setEditingProduct(null);
    setImageFiles([]);
    setImagePreviews([]);
    setExistingImages([]);
  };

  // Memoize filtered products to avoid recalculation on every render
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const searchLower = debouncedSearchTerm.toLowerCase();
      const matchesSearch = product.name.toLowerCase().includes(searchLower) ||
        product.sku.toLowerCase().includes(searchLower);
      const matchesCategory = categoryFilter === "all" || product.category === categoryFilter;
      const matchesAdvancedCategory = advancedCategoryFilter === "all" || product.category === advancedCategoryFilter;
      const matchesVariantType = variantTypeFilter === "all" || product.variant_name === variantTypeFilter || product.bit_type === variantTypeFilter;
      const matchesSupplier = supplierFilter === "all" || product.supplier === supplierFilter;
      const matchesPrice = product.price_usd >= priceRange[0] && product.price_usd <= priceRange[1];
      
      // Stock status filter
      let matchesStockStatus = true;
      const stock = product.stock_on_hand || 0;
      const reorderLevel = product.reorder_level || 10;
      if (stockStatusFilter === "out_of_stock") matchesStockStatus = stock === 0;
      else if (stockStatusFilter === "low_stock") matchesStockStatus = stock > 0 && stock <= reorderLevel;
      else if (stockStatusFilter === "in_stock") matchesStockStatus = stock > reorderLevel;
      
      return matchesSearch && matchesCategory && matchesAdvancedCategory && matchesVariantType && matchesSupplier && matchesPrice && matchesStockStatus;
    });
  }, [products, debouncedSearchTerm, categoryFilter, advancedCategoryFilter, variantTypeFilter, supplierFilter, priceRange, stockStatusFilter]);

  const sortedProducts = useMemo(() => {
    return [...filteredProducts].sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "price") return a.price_usd - b.price_usd;
      if (sortBy === "stock") return (b.stock_on_hand || 0) - (a.stock_on_hand || 0);
      return 0;
    });
  }, [filteredProducts, sortBy]);

  const categories = ["all", ...Array.from(new Set(products.map(p => p.category)))];
  const suppliers = ["all", ...getUniqueSuppliers()];

  const {
    displayedItems,
    hasMore,
    loaderRef,
    totalCount,
    displayedCount,
  } = useInfiniteScroll(sortedProducts, 20);

  // Reset variant type filter when category changes
  useEffect(() => {
    if (categoryFilter !== "all") {
      const availableTypes = getVariantTypesForCategoryFilter(categoryFilter);
      if (variantTypeFilter !== "all" && !availableTypes.includes(variantTypeFilter)) {
        setVariantTypeFilter("all");
      }
    }
  }, [categoryFilter]);

  const exportProducts = () => {
    const exportData = filteredProducts.map(p => ({
      Name: p.name,
      SKU: p.sku,
      Category: p.category,
      'Price (USD)': p.price_usd,
      'Salon Price': p.salon_price_usd || '',
      'Wholesale Price': p.wholesale_price_usd || '',
      'Stock On Hand': p.stock_on_hand || 0,
      'Reorder Level': p.reorder_level || 0,
      Supplier: p.supplier || '',
      Material: p.material || '',
      'Bit Type': p.bit_type || '',
      Grit: p.grit || '',
    }));
    downloadCSV(exportData, 'products');
    toast({ title: "Success", description: "Products exported successfully" });
  };

  // Bulk stock update handler
  const handleBulkStockUpdate = async () => {
    if (selectedProducts.size === 0) {
      toast({ title: "Error", description: "No products selected", variant: "destructive" });
      return;
    }

    const stockValue = parseInt(bulkStockValue);
    if (isNaN(stockValue) || stockValue < 0) {
      toast({ title: "Error", description: "Please enter a valid stock value", variant: "destructive" });
      return;
    }

    try {
      const selectedItems = products.filter(p => selectedProducts.has(p.id));
      
      for (const product of selectedItems) {
        let newStock: number;
        const currentStock = product.stock_on_hand || 0;
        
        if (bulkStockAction === "set") newStock = stockValue;
        else if (bulkStockAction === "add") newStock = currentStock + stockValue;
        else newStock = Math.max(0, currentStock - stockValue);

        const { error } = await supabase
          .from("products")
          .update({ stock_on_hand: newStock })
          .eq("id", product.id);

        if (error) throw error;
      }

      toast({ title: "Success", description: `Stock updated for ${selectedItems.length} product(s)` });
      setIsBulkStockOpen(false);
      setBulkStockValue("");
      setSelectedProducts(new Set());
      refreshProducts();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  // CSV import handlers
  const handleCSVSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setImportPreview(text.slice(0, 1000) + (text.length > 1000 ? "..." : ""));
      
      // Parse CSV
      const lines = text.split("\n").filter(line => line.trim());
      if (lines.length < 2) {
        toast({ title: "Error", description: "CSV file is empty or has no data rows", variant: "destructive" });
        return;
      }

      const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/['"]/g, ""));
      const data = lines.slice(1).map(line => {
        const values = line.split(",").map(v => v.trim().replace(/['"]/g, ""));
        const row: any = {};
        headers.forEach((header, i) => {
          row[header] = values[i] || "";
        });
        return row;
      }).filter(row => row.name || row.sku);

      setImportData(data);
      setIsImportOpen(true);
    };
    reader.readAsText(file);
    
    // Reset input
    if (csvInputRef.current) csvInputRef.current.value = "";
  };

  const handleImportProducts = async () => {
    if (importData.length === 0) {
      toast({ title: "Error", description: "No valid data to import", variant: "destructive" });
      return;
    }

    try {
      let imported = 0;
      let skipped = 0;

      for (const row of importData) {
        // Map common column names
        const productData = {
          name: row.name || row.product_name || row["product name"] || "",
          sku: row.sku || row.code || `SKU-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          category: row.category || "Uncategorized",
          price_usd: parseFloat(row.price_usd || row.price || row["price (usd)"] || "0") || 0,
          salon_price_usd: parseFloat(row.salon_price_usd || row.salon_price || row["salon price"] || "") || null,
          wholesale_price_usd: parseFloat(row.wholesale_price_usd || row.wholesale_price || row["wholesale price"] || "") || null,
          stock_on_hand: parseInt(row.stock_on_hand || row.stock || row["stock on hand"] || "0") || 0,
          reorder_level: parseInt(row.reorder_level || row["reorder level"] || "10") || 10,
          supplier: row.supplier || null,
          material: row.material || null,
          bit_type: row.bit_type || row["bit type"] || null,
          grit: row.grit || null,
        };

        if (!productData.name) {
          skipped++;
          continue;
        }

        const { error } = await supabase.from("products").insert([productData]);
        if (error) {
          console.error("Import error for row:", row, error);
          skipped++;
        } else {
          imported++;
        }
      }

      toast({ 
        title: "Import Complete", 
        description: `Imported ${imported} product(s). ${skipped > 0 ? `Skipped ${skipped} row(s).` : ""}` 
      });
      setIsImportOpen(false);
      setImportData([]);
      setImportPreview("");
      refreshProducts();
    } catch (error: any) {
      toast({ title: "Import Error", description: error.message, variant: "destructive" });
    }
  };

  const clearAdvancedFilters = () => {
    setSupplierFilter("all");
    setStockStatusFilter("all");
    setPriceRange([0, maxPrice]);
    setAdvancedCategoryFilter("all");
    setVariantTypeFilter("all");
  };

  const hasActiveFilters = supplierFilter !== "all" || stockStatusFilter !== "all" || priceRange[0] > 0 || priceRange[1] < maxPrice || advancedCategoryFilter !== "all" || variantTypeFilter !== "all";

  const handleDuplicateProduct = async (product: Product) => {
    const duplicatedData = {
      name: `${product.name} (Copy)`,
      category: product.category,
      material: product.material,
      shape: product.shape,
      direction: product.direction,
      bit_type: product.bit_type,
      grit: product.grit,
      unit: product.unit,
      sku: `${product.sku}-COPY-${Date.now()}`,
      price_usd: product.price_usd,
      salon_price_usd: product.salon_price_usd,
      wholesale_price_usd: product.wholesale_price_usd,
      image_url: product.image_url,
      stock_on_hand: 0,
      stock_reserved: 0,
      reorder_level: product.reorder_level,
      supplier: product.supplier,
    };

    try {
      const { error } = await supabase.from("products").insert([duplicatedData]);
      if (error) throw error;
      
      toast({ title: "Success", description: "Product duplicated successfully" });
      refreshProducts();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const toggleProductSelection = (productId: string) => {
    setSelectedProducts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedProducts.size === displayedItems.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(displayedItems.map(p => p.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedProducts.size === 0) {
      toast({ title: "Error", description: "No products selected", variant: "destructive" });
      return;
    }

    // First confirmation
    if (!confirm(`Are you sure you want to delete ${selectedProducts.size} product(s)?`)) return;
    
    // Second confirmation for safety (especially when many products selected)
    if (selectedProducts.size >= 3) {
      if (!confirm(`FINAL WARNING: This will permanently delete ${selectedProducts.size} products. This action cannot be undone. Continue?`)) return;
    }

    try {
      const { error } = await supabase
        .from("products")
        .delete()
        .in("id", Array.from(selectedProducts));

      if (error) throw error;

      toast({ title: "Success", description: `${selectedProducts.size} product(s) deleted` });
      setSelectedProducts(new Set());
      refreshProducts();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleBulkDuplicate = async () => {
    if (selectedProducts.size === 0) {
      toast({ title: "Error", description: "No products selected", variant: "destructive" });
      return;
    }

    const selectedItems = products.filter(p => selectedProducts.has(p.id));
    const duplicatedData = selectedItems.map(product => ({
      name: `${product.name} (Copy)`,
      category: product.category,
      material: product.material,
      shape: product.shape,
      direction: product.direction,
      bit_type: product.bit_type,
      grit: product.grit,
      unit: product.unit,
      sku: `${product.sku}-COPY-${Date.now()}`,
      price_usd: product.price_usd,
      salon_price_usd: product.salon_price_usd,
      wholesale_price_usd: product.wholesale_price_usd,
      image_url: product.image_url,
      stock_on_hand: 0,
      stock_reserved: 0,
      reorder_level: product.reorder_level,
      supplier: product.supplier,
    }));

    try {
      const { error } = await supabase.from("products").insert(duplicatedData);
      if (error) throw error;
      
      toast({ title: "Success", description: `${selectedProducts.size} product(s) duplicated` });
      setSelectedProducts(new Set());
      refreshProducts();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleBulkExport = () => {
    if (selectedProducts.size === 0) {
      toast({ title: "Error", description: "No products selected", variant: "destructive" });
      return;
    }

    const selectedItems = products.filter(p => selectedProducts.has(p.id));
    const exportData = selectedItems.map(p => ({
      Name: p.name,
      SKU: p.sku,
      Category: p.category,
      'Price (USD)': p.price_usd,
      'Stock On Hand': p.stock_on_hand || 0,
      'Reorder Level': p.reorder_level || 0,
      Supplier: p.supplier || '',
    }));
    downloadCSV(exportData, 'selected-products');
    toast({ title: "Success", description: `${selectedProducts.size} product(s) exported` });
  };

  const handleShareSelected = () => {
    if (selectedProducts.size === 0) {
      toast({ title: "Error", description: "No products selected", variant: "destructive" });
      return;
    }

    const selectedItems = products.filter(p => selectedProducts.has(p.id));
    const shareText = selectedItems.map(p => `${p.name} (${p.sku}) - $${p.price_usd}`).join('\n');
    
    if (navigator.share) {
      navigator.share({
        title: 'Selected Products',
        text: shareText,
      }).catch(() => {
        navigator.clipboard.writeText(shareText);
        toast({ title: "Copied to clipboard", description: "Product details copied to clipboard" });
      });
    } else {
      navigator.clipboard.writeText(shareText);
      toast({ title: "Copied to clipboard", description: "Product details copied to clipboard" });
    }
  };

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existingItem = prev.find(item => item.product.id === product.id);
      if (existingItem) {
        return prev.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
    toast({ title: "Added to cart", description: `${product.name} added to cart` });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => {
      const existingItem = prev.find(item => item.product.id === productId);
      if (existingItem && existingItem.quantity > 1) {
        return prev.map(item =>
          item.product.id === productId
            ? { ...item, quantity: item.quantity - 1 }
            : item
        );
      }
      return prev.filter(item => item.product.id !== productId);
    });
  };

  const getCartQuantity = (productId: string) => {
    return cart.find(item => item.product.id === productId)?.quantity || 0;
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.product.price_usd * item.quantity), 0);
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handlePlaceOrder = () => {
    if (cart.length === 0) {
      toast({ title: "Cart is empty", description: "Add some products to cart first", variant: "destructive" });
      return;
    }
    navigate('/orders', { state: { cartItems: cart } });
  };

  // Group products by similar names (for conversion to variants)
  const getProductGroups = () => {
    const groups: { [key: string]: Product[] } = {};
    
    const eligibleProducts = products.filter(p => !p.is_parent && !p.parent_product_id);
    console.log('Eligible products for grouping:', eligibleProducts.length);
    
    eligibleProducts.forEach(product => {
      const baseName = product.name.trim();
      if (!groups[baseName]) {
        groups[baseName] = [];
      }
      groups[baseName].push(product);
    });
    
    console.log('All groups:', groups);
    
    // Only return groups with 2 or more products
    const duplicateGroups = Object.entries(groups).filter(([_, prods]) => prods.length >= 2);
    console.log('Duplicate groups found:', duplicateGroups.length, duplicateGroups);
    
    return duplicateGroups;
  };

  const getEligibleProducts = () => {
    return products.filter(
      (p) => !p.is_parent && !p.parent_product_id
    );
  };

  const toggleVariantSelection = (productId: string) => {
    setSelectedVariantProducts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return newSet;
    });
  };

  const handleConvertToVariants = async () => {
    if (selectedVariantProducts.size < 2) {
      toast({
        title: "Selection Required",
        description: "Please select at least 2 products to create variants",
        variant: "destructive",
      });
      return;
    }

    if (!selectedParentId) {
      toast({
        title: "Parent Required",
        description: "Please select which product should be the parent",
        variant: "destructive",
      });
      return;
    }

    try {
      const selectedProductIds = Array.from(selectedVariantProducts);
      const allSelectedProducts = products.filter(p => selectedProductIds.includes(p.id));
      const parentProduct = allSelectedProducts.find(p => p.id === selectedParentId);
      const variantProducts = allSelectedProducts.filter(p => p.id !== selectedParentId);

      if (!parentProduct || variantProducts.length === 0) {
        throw new Error("Invalid selection");
      }

      // Update parent product
      const { error: parentError } = await supabase
        .from("products")
        .update({ is_parent: true })
        .eq("id", parentProduct.id);

      if (parentError) throw parentError;

      // Update variant products
      for (const variant of variantProducts) {
        const variantName = variant.sku || `Variant ${variantProducts.indexOf(variant) + 1}`;
        
        const { error: variantError } = await supabase
          .from("products")
          .update({
            parent_product_id: parentProduct.id,
            variant_name: variantName,
          })
          .eq("id", variant.id);

        if (variantError) throw variantError;
      }

      toast({
        title: "Success!",
        description: `Converted ${variantProducts.length} products to variants of "${parentProduct.name}"`,
      });

      setIsConverterOpen(false);
      setSelectedVariantProducts(new Set());
      setSelectedParentId("");
      refreshProducts();
    } catch (error: any) {
      toast({
        title: "Conversion Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleRemoveVariant = async (variantId: string) => {
    try {
      const { error } = await supabase
        .from("products")
        .update({
          parent_product_id: null,
          variant_name: null,
        })
        .eq("id", variantId);

      if (error) throw error;

      toast({
        title: "Variant Removed",
        description: "Product is now standalone",
      });

      refreshProducts();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleRemoveParentStatus = async (productId: string) => {
    try {
      // First, detach all child variants
      const { error: variantsError } = await supabase
        .from("products")
        .update({
          parent_product_id: null,
          variant_name: null,
        })
        .eq("parent_product_id", productId);

      if (variantsError) throw variantsError;

      // Then remove parent status
      const { error: parentError } = await supabase
        .from("products")
        .update({ is_parent: false })
        .eq("id", productId);

      if (parentError) throw parentError;

      toast({
        title: "Parent Status Removed",
        description: "All variants are now standalone products",
      });

      setQuickViewProduct(null);
      refreshProducts();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Products</h1>
          <p className="text-muted-foreground mt-1">Manage your product catalog</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isConverterOpen} onOpenChange={setIsConverterOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Copy className="mr-2 h-4 w-4" />
                Convert to Variants
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Convert Products to Variants</DialogTitle>
                <p className="text-sm text-muted-foreground">
                  Manually select products to group together as variants
                </p>
              </DialogHeader>
              <div className="space-y-4">
                {getEligibleProducts().length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No products available to convert</p>
                    <p className="text-sm mt-2">All products are already parents or variants</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label>Select Products ({selectedVariantProducts.size} selected)</Label>
                      <p className="text-xs text-muted-foreground">
                        Check the products you want to group together. Select at least 2 products.
                      </p>
                      <div className="grid gap-3 max-h-[300px] overflow-y-auto border rounded-lg p-3">
                        {getEligibleProducts().map((product) => (
                          <Card
                            key={product.id}
                            className={cn(
                              "cursor-pointer transition-all hover:border-primary",
                              selectedVariantProducts.has(product.id) && "border-primary bg-primary/5"
                            )}
                            onClick={() => toggleVariantSelection(product.id)}
                          >
                            <CardContent className="p-3">
                              <div className="flex items-center gap-3">
                                <Checkbox
                                  checked={selectedVariantProducts.has(product.id)}
                                  onCheckedChange={() => toggleVariantSelection(product.id)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <div className="w-10 h-10 rounded-md overflow-hidden bg-muted flex-shrink-0">
                                  {(product.images && product.images.length > 0) ? (
                                    <img 
                                      src={product.images[0].image_url} 
                                      alt={product.name}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : product.image_url ? (
                                    <img 
                                      src={product.image_url} 
                                      alt={product.name}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                      <Package className="h-6 w-6 text-muted-foreground" />
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-medium text-sm truncate">{product.name}</h4>
                                  <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>
                                  <p className="text-xs font-medium">${product.price_usd}</p>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>

                    {selectedVariantProducts.size >= 2 && (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Select Parent Product</Label>
                          <p className="text-xs text-muted-foreground">
                            Choose which product should be the main product (others will become its variants)
                          </p>
                          <div className="grid gap-3">
                            {Array.from(selectedVariantProducts).map((productId) => {
                              const product = products.find(p => p.id === productId);
                              if (!product) return null;
                              
                              return (
                                <Card
                                  key={product.id}
                                  className={cn(
                                    "cursor-pointer transition-all hover:border-primary",
                                    selectedParentId === product.id && "border-primary bg-primary/5"
                                  )}
                                  onClick={() => setSelectedParentId(product.id)}
                                >
                                  <CardContent className="p-4">
                                    <div className="flex items-center gap-3">
                                      <div className="w-12 h-12 rounded-md overflow-hidden bg-muted flex-shrink-0">
                                        {(product.images && product.images.length > 0) ? (
                                          <img 
                                            src={product.images[0].image_url} 
                                            alt={product.name}
                                            className="w-full h-full object-cover"
                                          />
                                        ) : product.image_url ? (
                                          <img 
                                            src={product.image_url} 
                                            alt={product.name}
                                            className="w-full h-full object-cover"
                                          />
                                        ) : (
                                          <div className="w-full h-full flex items-center justify-center">
                                            <Package className="h-6 w-6 text-muted-foreground" />
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <h4 className="font-medium truncate">{product.name}</h4>
                                        <p className="text-sm text-muted-foreground">SKU: {product.sku}</p>
                                        <p className="text-sm font-medium">${product.price_usd}</p>
                                      </div>
                                      {selectedParentId === product.id && (
                                        <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                                      )}
                                    </div>
                                  </CardContent>
                                </Card>
                              );
                            })}
                          </div>
                        </div>

                        {selectedParentId && (
                          <div className="space-y-2">
                            <Label>Preview</Label>
                            <Card className="bg-muted/50">
                              <CardContent className="p-4">
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">Parent Product:</span>
                                    <span>
                                      {products.find(p => p.id === selectedParentId)?.name}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium">Variants ({selectedVariantProducts.size - 1}):</span>
                                    <ul className="list-disc list-inside mt-1 text-sm text-muted-foreground">
                                      {Array.from(selectedVariantProducts)
                                        .filter(id => id !== selectedParentId)
                                        .map(id => {
                                          const product = products.find(p => p.id === id);
                                          return product ? (
                                            <li key={id}>{product.sku} - {product.name}</li>
                                          ) : null;
                                        })}
                                    </ul>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                        )}

                        <Button 
                          onClick={handleConvertToVariants}
                          disabled={!selectedParentId}
                          className="w-full"
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          Convert to Variants
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Product
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingProduct ? "Edit Product" : "Add New Product"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Product Images</Label>
                <div className="flex flex-col gap-4">
                  {/* Legacy image from image_url field */}
                  {editingProduct?.image_url && existingImages.length === 0 && (
                    <div className="grid grid-cols-4 gap-2">
                      <div className="relative w-full aspect-square border rounded-lg overflow-hidden">
                        <img src={editingProduct.image_url} alt="Product" className="w-full h-full object-cover" />
                        <div className="absolute bottom-1 left-1 right-1">
                          <Badge variant="secondary" className="text-xs w-full justify-center">Legacy Image</Badge>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Existing images from product_images table */}
                  {existingImages.length > 0 && (
                    <div className="grid grid-cols-4 gap-2">
                      {existingImages.map((img, index) => (
                        <div key={img.id} className="relative w-full aspect-square border rounded-lg overflow-hidden">
                          <img src={img.image_url} alt={`Image ${index + 1}`} className="w-full h-full object-cover" />
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            className="absolute top-1 right-1 h-6 w-6"
                            onClick={() => removeExistingImage(img.id)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* New image previews */}
                  {imagePreviews.length > 0 && (
                    <div className="grid grid-cols-4 gap-2">
                      {imagePreviews.map((preview, index) => (
                        <div key={index} className="relative w-full aspect-square border rounded-lg overflow-hidden">
                          <img src={preview} alt={`Preview ${index + 1}`} className="w-full h-full object-cover" />
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            className="absolute top-1 right-1 h-6 w-6"
                            onClick={() => removeImagePreview(index)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageSelect}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Add Images
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Product Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sku">SKU *</Label>
                  <Input
                    id="sku"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Category *</Label>
                  <div className="flex gap-2">
                    <Input
                      id="category"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      placeholder="Type or select category"
                      required
                      className="flex-1"
                    />
                    <Select
                      value=""
                      onValueChange={(value) => setFormData({ ...formData, category: value })}
                    >
                      <SelectTrigger className="w-[120px]">
                        <SelectValue placeholder="Existing" />
                      </SelectTrigger>
                      <SelectContent>
                        {getUniqueCategories().map(cat => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="material">Material</Label>
                  <Input
                    id="material"
                    value={formData.material}
                    onChange={(e) => setFormData({ ...formData, material: e.target.value })}
                    placeholder="Enter material (e.g., Carbide, Ceramic)"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="shape">Shape</Label>
                  <Input
                    id="shape"
                    value={formData.shape}
                    onChange={(e) => setFormData({ ...formData, shape: e.target.value })}
                    placeholder="Enter shape (e.g., Cone, Cylinder)"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="direction">Direction</Label>
                  <Input
                    id="direction"
                    value={formData.direction}
                    onChange={(e) => setFormData({ ...formData, direction: e.target.value })}
                    placeholder="Enter direction (e.g., Left, Right)"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="unit">Unit</Label>
                  <Input
                    id="unit"
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bit_type">Bit Type</Label>
                  <Input
                    id="bit_type"
                    value={formData.bit_type}
                    onChange={(e) => setFormData({ ...formData, bit_type: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="grit">Grit</Label>
                  <Input
                    id="grit"
                    value={formData.grit}
                    onChange={(e) => setFormData({ ...formData, grit: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="price_usd">Price (USD) *</Label>
                  <Input
                    id="price_usd"
                    type="number"
                    step="0.01"
                    value={formData.price_usd}
                    onChange={(e) => setFormData({ ...formData, price_usd: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="salon_price_usd">Salon Price</Label>
                  <Input
                    id="salon_price_usd"
                    type="number"
                    step="0.01"
                    value={formData.salon_price_usd}
                    onChange={(e) => setFormData({ ...formData, salon_price_usd: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wholesale_price_usd">Wholesale Price</Label>
                  <Input
                    id="wholesale_price_usd"
                    type="number"
                    step="0.01"
                    value={formData.wholesale_price_usd}
                    onChange={(e) => setFormData({ ...formData, wholesale_price_usd: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="stock_on_hand">Stock on Hand</Label>
                  <Input
                    id="stock_on_hand"
                    type="number"
                    value={formData.stock_on_hand}
                    onChange={(e) => setFormData({ ...formData, stock_on_hand: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stock_reserved">Stock Reserved</Label>
                  <Input
                    id="stock_reserved"
                    type="number"
                    value={formData.stock_reserved}
                    onChange={(e) => setFormData({ ...formData, stock_reserved: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reorder_level">Reorder Level</Label>
                  <Input
                    id="reorder_level"
                    type="number"
                    value={formData.reorder_level}
                    onChange={(e) => setFormData({ ...formData, reorder_level: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="supplier">Supplier</Label>
                <Input
                  id="supplier"
                  value={formData.supplier}
                  onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                />
              </div>

              {/* Variant Management Section */}
              <div className="border-t pt-4 mt-4 space-y-4">
                <h3 className="font-semibold text-sm">Product Variants & Type</h3>
                
                <div className="space-y-2">
                  <Label htmlFor="variant_name">Variant Type (Optional)</Label>
                  <div className="flex gap-2">
                    <Input
                      id="variant_name"
                      placeholder="Type or select variant type"
                      value={formData.variant_name}
                      onChange={(e) => setFormData({ ...formData, variant_name: e.target.value })}
                      className="flex-1"
                    />
                    {formData.category && getVariantTypesForFormCategory(formData.category).length > 0 && (
                      <Select
                        value=""
                        onValueChange={(value) => setFormData({ ...formData, variant_name: value })}
                      >
                        <SelectTrigger className="w-[120px]">
                          <SelectValue placeholder="Existing" />
                        </SelectTrigger>
                        <SelectContent>
                          {getVariantTypesForFormCategory(formData.category).map(variant => (
                            <SelectItem key={variant} value={variant}>{variant}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formData.category 
                      ? `Type new or select existing variant type for ${formData.category}`
                      : "Specify the type or variation of this product"
                    }
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is_parent"
                    checked={formData.is_parent}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_parent: checked as boolean, parent_product_id: "" })}
                  />
                  <Label htmlFor="is_parent" className="text-sm font-normal cursor-pointer">
                    This is a parent product with variants
                  </Label>
                </div>

                {!formData.is_parent && (
                  <div className="space-y-2">
                    <Label htmlFor="parent_product_id">Parent Product (Optional)</Label>
                    <Select 
                      value={formData.parent_product_id || "none"} 
                      onValueChange={(value) => setFormData({ ...formData, parent_product_id: value === "none" ? "" : value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select parent product" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None (Standalone Product)</SelectItem>
                        {products.filter(p => p.is_parent).map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Link this product as a variant of another product
                    </p>
                  </div>
                )}

                {formData.is_parent && (
                  <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
                    This product will serve as a parent. After creating it, you can add variants by creating new products and selecting this as their parent.
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={uploading}>
                  {uploading ? "Uploading..." : editingProduct ? "Update Product" : "Add Product"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* CSV Import Input (hidden) */}
      <input
        ref={csvInputRef}
        type="file"
        accept=".csv"
        onChange={handleCSVSelect}
        className="hidden"
      />

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader className="p-3 sm:p-6">
          <div className="flex flex-col gap-3 sm:gap-4">
            {/* Search */}
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 min-h-[44px]"
              />
            </div>
            
            {/* Filter row - clean layout */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Sort Selector - First for quick access */}
              <Select value={sortBy} onValueChange={(value: "name" | "price" | "stock") => setSortBy(value)}>
                <SelectTrigger className="w-[110px] h-10">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent className="bg-background border">
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="price">Price</SelectItem>
                  <SelectItem value="stock">Stock</SelectItem>
                </SelectContent>
              </Select>

              {/* Filter Button */}
              <Popover open={showAdvancedFilters} onOpenChange={setShowAdvancedFilters}>
                <PopoverTrigger asChild>
                  <Button 
                    variant={hasActiveFilters || categoryFilter !== "all" ? "default" : "outline"} 
                    size="sm"
                    className="h-10 px-3"
                  >
                    <Filter className="h-4 w-4 mr-1.5" />
                    Filters
                    {(hasActiveFilters || categoryFilter !== "all") && (
                      <Badge variant="secondary" className="ml-1.5 h-5 w-5 p-0 justify-center text-xs rounded-full">
                        {[
                          categoryFilter !== "all" ? 1 : 0,
                          variantTypeFilter !== "all" ? 1 : 0,
                          supplierFilter !== "all" ? 1 : 0,
                          stockStatusFilter !== "all" ? 1 : 0,
                          (priceRange[0] > 0 || priceRange[1] < maxPrice) ? 1 : 0,
                        ].reduce((a, b) => a + b, 0)}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 bg-background border p-4" align="start" sideOffset={8}>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-sm">Filter Products</h4>
                      {(hasActiveFilters || categoryFilter !== "all") && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setCategoryFilter("all");
                            clearAdvancedFilters();
                          }}
                        >
                          Reset
                        </Button>
                      )}
                    </div>
                    
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Category</Label>
                      <Select value={categoryFilter} onValueChange={(v) => {
                        setCategoryFilter(v);
                        setAdvancedCategoryFilter(v);
                      }}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-background border">
                          <SelectItem value="all">All Categories</SelectItem>
                          {getUniqueCategories().map(cat => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Variant Type</Label>
                      <Select value={variantTypeFilter} onValueChange={setVariantTypeFilter}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-background border">
                          <SelectItem value="all">All Types</SelectItem>
                          {getVariantTypesForCategoryFilter(categoryFilter).map(type => (
                            <SelectItem key={type} value={type}>{type}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Supplier</Label>
                      <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-background border">
                          {suppliers.map(s => (
                            <SelectItem key={s} value={s}>
                              {s === "all" ? "All Suppliers" : s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Stock Status</Label>
                      <Select value={stockStatusFilter} onValueChange={(v: typeof stockStatusFilter) => setStockStatusFilter(v)}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-background border">
                          <SelectItem value="all">All Stock</SelectItem>
                          <SelectItem value="in_stock">In Stock</SelectItem>
                          <SelectItem value="low_stock">Low Stock</SelectItem>
                          <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Price: ${priceRange[0]} - ${priceRange[1]}</Label>
                      <Slider
                        value={priceRange}
                        onValueChange={(v) => setPriceRange(v as [number, number])}
                        min={0}
                        max={maxPrice}
                        step={1}
                        className="mt-2"
                      />
                    </div>
                    
                    <Button 
                      size="sm" 
                      onClick={() => setShowAdvancedFilters(false)} 
                      className="w-full h-9 mt-2"
                    >
                      Apply Filters
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
              
              {/* View Toggle */}
              <div className="flex border rounded-md flex-shrink-0">
                <Button 
                  variant={viewMode === "grid" ? "default" : "ghost"} 
                  size="icon" 
                  className="rounded-r-none min-h-[44px] min-w-[44px]"
                  onClick={() => setViewMode("grid")}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button 
                  variant={viewMode === "table" ? "default" : "ghost"} 
                  size="icon" 
                  className="rounded-l-none min-h-[44px] min-w-[44px]"
                  onClick={() => setViewMode("table")}
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
              
              <Button onClick={() => csvInputRef.current?.click()} variant="outline" size="icon" className="min-h-[44px] min-w-[44px] flex-shrink-0 sm:hidden">
                <FileUp className="h-4 w-4" />
              </Button>
              <Button onClick={() => csvInputRef.current?.click()} variant="outline" size="default" className="min-h-[44px] flex-shrink-0 hidden sm:flex">
                <FileUp className="mr-2 h-4 w-4" />
                Import
              </Button>
              <Button onClick={exportProducts} variant="outline" size="icon" className="min-h-[44px] min-w-[44px] flex-shrink-0 sm:hidden">
                <Download className="h-4 w-4" />
              </Button>
              <Button onClick={exportProducts} variant="outline" size="default" className="min-h-[44px] flex-shrink-0 hidden sm:flex">
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
            </div>
            {selectedProducts.size > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">
                  {selectedProducts.size} selected
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <MoreVertical className="mr-2 h-4 w-4" />
                      Actions
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48 bg-background border">
                    <DropdownMenuItem onClick={() => setIsBulkStockOpen(true)}>
                      <Boxes className="mr-2 h-4 w-4" />
                      Update Stock
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleShareSelected}>
                      <Share2 className="mr-2 h-4 w-4" />
                      Share Selected
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleBulkExport}>
                      <Download className="mr-2 h-4 w-4" />
                      Export Selected
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleBulkDuplicate}>
                      <Copy className="mr-2 h-4 w-4" />
                      Duplicate Selected
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleBulkDelete} className="text-destructive focus:text-destructive">
                      <Trash className="mr-2 h-4 w-4" />
                      Delete Selected
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button onClick={() => setSelectedProducts(new Set())} variant="outline" size="sm">
                  Clear
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <ProductGridSkeleton count={12} />
          ) : displayedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Package className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No products found. Add your first product to get started.</p>
            </div>
          ) : (
            <>
              {displayedItems.length > 0 && (
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedProducts.size === displayedItems.length && displayedItems.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                    <span className="text-sm text-muted-foreground">Select All</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    Showing {displayedCount} of {totalCount} products
                  </span>
                </div>
              )}
              {viewMode === "grid" ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {displayedItems.map((product) => (
                    <Card 
                      key={product.id} 
                      className="relative overflow-hidden flex flex-col h-full min-w-0 cursor-pointer transition-shadow hover:shadow-md" 
                      onClick={() => setQuickViewProduct(product)}
                    >
                      <div 
                        className="absolute top-2 left-2 z-10" 
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={selectedProducts.has(product.id)}
                          onCheckedChange={() => toggleProductSelection(product.id)}
                          className="bg-background"
                        />
                      </div>
                      <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden group relative">
                        {(product.images && product.images.length > 0) ? (
                          <img src={product.images[0].image_url} alt={product.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" />
                        ) : product.image_url ? (
                          <img src={product.image_url} alt={product.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" />
                        ) : (
                          <Package className="h-16 w-16 text-muted-foreground/30" />
                        )}
                        <Button
                          size="sm"
                          variant="secondary"
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            setQuickViewProduct(product);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                      <CardContent className="p-4 flex-1 flex flex-col">
                        <div className="mb-2 space-y-1">
                          <h3 className="font-semibold text-base sm:text-lg break-words whitespace-normal leading-snug text-foreground">
                            {product.name}
                          </h3>
                          <p className="text-sm text-muted-foreground">{product.category}</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-block font-mono text-[10px] leading-none text-muted-foreground bg-muted px-2 py-1 rounded">
                              {product.sku}
                            </span>
                            {product.is_parent && product.variants && product.variants.length > 0 && (
                              <Badge variant="secondary" className="text-[10px] leading-none">
                                {product.variants.length} Variant{product.variants.length > 1 ? 's' : ''}
                              </Badge>
                            )}
                            {product.variant_name && (
                              <Badge variant="outline" className="text-[10px] leading-none">
                                {product.variant_name}
                              </Badge>
                            )}
                          </div>
                        </div>
                        
                        <div className="space-y-1 text-sm flex-1">
                          {product.bit_type && <p><span className="text-muted-foreground">Bit Type:</span> {product.bit_type}</p>}
                          {product.grit && <p><span className="text-muted-foreground">Grit:</span> {product.grit}</p>}
                          <p className="font-semibold text-lg mt-2">${product.price_usd}</p>
                          {product.stock_on_hand !== null && (
                            <div className="flex items-center gap-2">
                              <p className="text-muted-foreground">Stock: {product.stock_on_hand}</p>
                              {product.stock_on_hand < 10 && (
                                <Badge variant={product.stock_on_hand === 0 ? "destructive" : "secondary"} className="text-xs">
                                  {product.stock_on_hand === 0 ? "Out of Stock" : "Low Stock"}
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>

                        {getCartQuantity(product.id) > 0 ? (
                          <div className="flex items-center gap-2 mt-4" onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => removeFromCart(product.id)}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span className="text-sm font-medium px-3">{getCartQuantity(product.id)}</span>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => addToCart(product)}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            className="w-full mt-4 whitespace-nowrap"
                            onClick={(e) => {
                              e.stopPropagation();
                              addToCart(product);
                            }}
                          >
                            <ShoppingCart className="mr-2 h-4 w-4" />
                            <span className="sm:hidden">Add</span>
                            <span className="hidden sm:inline">Add to Cart</span>
                          </Button>
                        )}

                        <div className="mt-2 grid grid-cols-3 gap-2" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingProduct(product);
                              setFormData({
                                name: product.name,
                                category: product.category,
                                material: product.material || "",
                                shape: product.shape || "",
                                direction: product.direction || "",
                                bit_type: product.bit_type || "",
                                grit: product.grit || "",
                                unit: product.unit || "piece",
                                sku: product.sku,
                                price_usd: product.price_usd.toString(),
                                salon_price_usd: product.salon_price_usd?.toString() || "",
                                wholesale_price_usd: product.wholesale_price_usd?.toString() || "",
                                stock_on_hand: product.stock_on_hand?.toString() || "0",
                                stock_reserved: product.stock_reserved?.toString() || "0",
                                reorder_level: product.reorder_level?.toString() || "10",
                                supplier: product.supplier || "",
                                is_parent: product.is_parent || false,
                                parent_product_id: product.parent_product_id || "",
                                variant_name: product.variant_name || "",
                              });
                              setExistingImages(product.images || []);
                              setIsDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDuplicateProduct(product)}
                            title="Duplicate"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDelete(product.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                /* Table View */
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead className="hidden md:table-cell">Supplier</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayedItems.map((product) => (
                        <TableRow key={product.id} className="cursor-pointer" onClick={() => setQuickViewProduct(product)}>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedProducts.has(product.id)}
                              onCheckedChange={() => toggleProductSelection(product.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-muted rounded overflow-hidden flex-shrink-0">
                                {(product.images && product.images.length > 0) ? (
                                  <img src={product.images[0].image_url} alt={product.name} className="w-full h-full object-cover" />
                                ) : product.image_url ? (
                                  <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <Package className="h-5 w-5 text-muted-foreground/30" />
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium truncate">{product.name}</p>
                                {product.is_parent && product.variants && product.variants.length > 0 && (
                                  <Badge variant="secondary" className="text-[10px]">
                                    {product.variants.length} variants
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{product.sku}</TableCell>
                          <TableCell>{product.category}</TableCell>
                          <TableCell className="text-right font-medium">${product.price_usd}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span>{product.stock_on_hand || 0}</span>
                              {(product.stock_on_hand || 0) === 0 && (
                                <Badge variant="destructive" className="text-[10px]">Out</Badge>
                              )}
                              {(product.stock_on_hand || 0) > 0 && (product.stock_on_hand || 0) <= (product.reorder_level || 10) && (
                                <Badge variant="secondary" className="text-[10px]">Low</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-muted-foreground">
                            {product.supplier || "-"}
                          </TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-end gap-1">
                              <Button size="icon" variant="ghost" onClick={() => addToCart(product)}>
                                <ShoppingCart className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  setEditingProduct(product);
                                  setFormData({
                                    name: product.name,
                                    category: product.category,
                                    material: product.material || "",
                                    shape: product.shape || "",
                                    direction: product.direction || "",
                                    bit_type: product.bit_type || "",
                                    grit: product.grit || "",
                                    unit: product.unit || "piece",
                                    sku: product.sku,
                                    price_usd: product.price_usd.toString(),
                                    salon_price_usd: product.salon_price_usd?.toString() || "",
                                    wholesale_price_usd: product.wholesale_price_usd?.toString() || "",
                                    stock_on_hand: product.stock_on_hand?.toString() || "0",
                                    stock_reserved: product.stock_reserved?.toString() || "0",
                                    reorder_level: product.reorder_level?.toString() || "10",
                                    supplier: product.supplier || "",
                                    is_parent: product.is_parent || false,
                                    parent_product_id: product.parent_product_id || "",
                                    variant_name: product.variant_name || "",
                                  });
                                  setExistingImages(product.images || []);
                                  setIsDialogOpen(true);
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => handleDelete(product.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {/* Infinite scroll loader */}
              <div ref={loaderRef} className="flex justify-center py-6">
                {hasMore && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <span className="text-sm">Loading more...</span>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <CartPanel 
        cart={cart} 
        onClear={() => setCart([])} 
        onPlaceOrder={handlePlaceOrder} 
      />

      {/* Quick View - Responsive (Drawer on mobile, Dialog on desktop) */}
      {isMobile ? (
        <Drawer open={!!quickViewProduct} onOpenChange={(open) => !open && setQuickViewProduct(null)}>
          <DrawerContent className="max-h-[90vh]">
            <DrawerHeader>
              <DrawerTitle>Product Details</DrawerTitle>
            </DrawerHeader>
            {quickViewProduct && (
              <div className="space-y-4 p-4 overflow-y-auto">
                <ImageCarousel
                  images={quickViewProduct.images || []}
                  fallbackImage={quickViewProduct.image_url}
                  alt={quickViewProduct.name}
                  className="mb-4"
                />
                <div className="space-y-3">
                  <div>
                    <h3 className="text-2xl font-bold">{quickViewProduct.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1">SKU: {quickViewProduct.sku}</p>
                  </div>
                  <div className="space-y-2 text-sm">
                    <p><span className="font-medium">Category:</span> {quickViewProduct.category}</p>
                    {quickViewProduct.bit_type && <p><span className="font-medium">Bit Type:</span> {quickViewProduct.bit_type}</p>}
                    {quickViewProduct.grit && <p><span className="font-medium">Grit:</span> {quickViewProduct.grit}</p>}
                    {quickViewProduct.unit && <p><span className="font-medium">Unit:</span> {quickViewProduct.unit}</p>}
                    {quickViewProduct.supplier && <p><span className="font-medium">Supplier:</span> {quickViewProduct.supplier}</p>}
                  </div>
                  <div className="pt-3 border-t space-y-2">
                    <p className="text-2xl font-bold">${quickViewProduct.price_usd}</p>
                    {quickViewProduct.salon_price_usd && (
                      <p className="text-sm"><span className="font-medium">Salon Price:</span> ${quickViewProduct.salon_price_usd}</p>
                    )}
                    {quickViewProduct.wholesale_price_usd && (
                      <p className="text-sm"><span className="font-medium">Wholesale Price:</span> ${quickViewProduct.wholesale_price_usd}</p>
                    )}
                  </div>
                  <div className="pt-3 border-t space-y-1">
                    {quickViewProduct.stock_on_hand !== null && (
                      <div className="flex items-center gap-2">
                        <p className="font-medium">Stock: {quickViewProduct.stock_on_hand}</p>
                        {quickViewProduct.stock_on_hand < 10 && (
                          <Badge variant={quickViewProduct.stock_on_hand === 0 ? "destructive" : "secondary"}>
                            {quickViewProduct.stock_on_hand === 0 ? "Out of Stock" : "Low Stock"}
                          </Badge>
                        )}
                      </div>
                    )}
                    {quickViewProduct.stock_reserved !== null && quickViewProduct.stock_reserved > 0 && (
                      <p className="text-sm text-muted-foreground">Reserved: {quickViewProduct.stock_reserved}</p>
                    )}
                    {quickViewProduct.reorder_level !== null && (
                      <p className="text-sm text-muted-foreground">Reorder Level: {quickViewProduct.reorder_level}</p>
                    )}
                  </div>

                  {/* Show Variants if this is a parent product */}
                  {quickViewProduct.is_parent && quickViewProduct.variants && quickViewProduct.variants.length > 0 && (
                    <div className="pt-3 border-t space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold">Available Variants ({quickViewProduct.variants.length})</h4>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRemoveParentStatus(quickViewProduct.id)}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Remove All
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {quickViewProduct.variants.map((variant) => (
                          <Card key={variant.id} className="hover:bg-muted/50 transition-colors">
                            <CardContent className="p-3">
                              <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-muted rounded flex items-center justify-center flex-shrink-0 cursor-pointer" onClick={() => setQuickViewProduct(variant)}>
                                  {variant.image_url ? (
                                    <img src={variant.image_url} alt={variant.variant_name || ''} className="w-full h-full object-cover rounded" />
                                  ) : (
                                    <Package className="h-6 w-6 text-muted-foreground" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setQuickViewProduct(variant)}>
                                  <p className="font-medium text-sm">{variant.variant_name || variant.sku}</p>
                                  <p className="text-xs text-muted-foreground">SKU: {variant.sku}</p>
                                  <div className="flex items-center gap-2 mt-1">
                                    <p className="text-sm font-semibold">${variant.price_usd}</p>
                                    {variant.stock_on_hand !== null && (
                                      <span className="text-xs text-muted-foreground">Stock: {variant.stock_on_hand}</span>
                                    )}
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveVariant(variant.id);
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 pt-4 pb-4">
                    {getCartQuantity(quickViewProduct.id) === 0 ? (
                      <Button className="flex-1" onClick={() => addToCart(quickViewProduct)}>
                        <ShoppingCart className="mr-2 h-4 w-4" />
                        Add to Cart
                      </Button>
                    ) : (
                      <div className="flex items-center gap-2 flex-1">
                        <Button variant="outline" onClick={() => removeFromCart(quickViewProduct.id)}>
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="font-medium px-3">{getCartQuantity(quickViewProduct.id)}</span>
                        <Button variant="outline" onClick={() => addToCart(quickViewProduct)}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditingProduct(quickViewProduct);
                        setFormData({
                          name: quickViewProduct.name,
                          category: quickViewProduct.category,
                          material: quickViewProduct.material || "",
                          shape: quickViewProduct.shape || "",
                          direction: quickViewProduct.direction || "",
                          bit_type: quickViewProduct.bit_type || "",
                          grit: quickViewProduct.grit || "",
                          unit: quickViewProduct.unit || "piece",
                          sku: quickViewProduct.sku,
                          price_usd: quickViewProduct.price_usd.toString(),
                          salon_price_usd: quickViewProduct.salon_price_usd?.toString() || "",
                          wholesale_price_usd: quickViewProduct.wholesale_price_usd?.toString() || "",
                          stock_on_hand: quickViewProduct.stock_on_hand?.toString() || "0",
                          stock_reserved: quickViewProduct.stock_reserved?.toString() || "0",
                          reorder_level: quickViewProduct.reorder_level?.toString() || "10",
                          supplier: quickViewProduct.supplier || "",
                          is_parent: quickViewProduct.is_parent || false,
                          parent_product_id: quickViewProduct.parent_product_id || "",
                          variant_name: quickViewProduct.variant_name || "",
                        });
                        setExistingImages(quickViewProduct.images || []);
                        setQuickViewProduct(null);
                        setIsDialogOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={!!quickViewProduct} onOpenChange={(open) => !open && setQuickViewProduct(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Product Details</DialogTitle>
            </DialogHeader>
            {quickViewProduct && (
              <div className="space-y-4">
                <div className="grid md:grid-cols-2 gap-6">
                  <ImageCarousel
                    images={quickViewProduct.images || []}
                    fallbackImage={quickViewProduct.image_url}
                    alt={quickViewProduct.name}
                  />
                  <div className="space-y-3">
                    <div>
                      <h3 className="text-2xl font-bold">{quickViewProduct.name}</h3>
                      <p className="text-sm text-muted-foreground mt-1">SKU: {quickViewProduct.sku}</p>
                    </div>
                    <div className="space-y-2 text-sm">
                      <p><span className="font-medium">Category:</span> {quickViewProduct.category}</p>
                      {quickViewProduct.bit_type && <p><span className="font-medium">Bit Type:</span> {quickViewProduct.bit_type}</p>}
                      {quickViewProduct.grit && <p><span className="font-medium">Grit:</span> {quickViewProduct.grit}</p>}
                      {quickViewProduct.unit && <p><span className="font-medium">Unit:</span> {quickViewProduct.unit}</p>}
                      {quickViewProduct.supplier && <p><span className="font-medium">Supplier:</span> {quickViewProduct.supplier}</p>}
                    </div>
                    <div className="pt-3 border-t space-y-2">
                      <p className="text-2xl font-bold">${quickViewProduct.price_usd}</p>
                      {quickViewProduct.salon_price_usd && (
                        <p className="text-sm"><span className="font-medium">Salon Price:</span> ${quickViewProduct.salon_price_usd}</p>
                      )}
                      {quickViewProduct.wholesale_price_usd && (
                        <p className="text-sm"><span className="font-medium">Wholesale Price:</span> ${quickViewProduct.wholesale_price_usd}</p>
                      )}
                    </div>
                    <div className="pt-3 border-t space-y-1">
                      {quickViewProduct.stock_on_hand !== null && (
                        <div className="flex items-center gap-2">
                          <p className="font-medium">Stock: {quickViewProduct.stock_on_hand}</p>
                          {quickViewProduct.stock_on_hand < 10 && (
                            <Badge variant={quickViewProduct.stock_on_hand === 0 ? "destructive" : "secondary"}>
                              {quickViewProduct.stock_on_hand === 0 ? "Out of Stock" : "Low Stock"}
                            </Badge>
                          )}
                        </div>
                      )}
                      {quickViewProduct.stock_reserved !== null && quickViewProduct.stock_reserved > 0 && (
                        <p className="text-sm text-muted-foreground">Reserved: {quickViewProduct.stock_reserved}</p>
                      )}
                      {quickViewProduct.reorder_level !== null && (
                        <p className="text-sm text-muted-foreground">Reorder Level: {quickViewProduct.reorder_level}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Show Variants if this is a parent product */}
                {quickViewProduct.is_parent && quickViewProduct.variants && quickViewProduct.variants.length > 0 && (
                  <div className="pt-3 border-t space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold">Available Variants ({quickViewProduct.variants.length})</h4>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRemoveParentStatus(quickViewProduct.id)}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Remove All
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {quickViewProduct.variants.map((variant) => (
                        <Card key={variant.id} className="hover:bg-muted/50 transition-colors">
                          <CardContent className="p-3">
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-12 bg-muted rounded flex items-center justify-center flex-shrink-0 cursor-pointer" onClick={() => setQuickViewProduct(variant)}>
                                {variant.image_url ? (
                                  <img src={variant.image_url} alt={variant.variant_name || ''} className="w-full h-full object-cover rounded" />
                                ) : (
                                  <Package className="h-6 w-6 text-muted-foreground" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setQuickViewProduct(variant)}>
                                <p className="font-medium text-sm">{variant.variant_name || variant.sku}</p>
                                <p className="text-xs text-muted-foreground">SKU: {variant.sku}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <p className="text-sm font-semibold">${variant.price_usd}</p>
                                  {variant.stock_on_hand !== null && (
                                    <span className="text-xs text-muted-foreground">Stock: {variant.stock_on_hand}</span>
                                  )}
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveVariant(variant.id);
                                }}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-4">
                      {getCartQuantity(quickViewProduct.id) === 0 ? (
                        <Button className="flex-1" onClick={() => addToCart(quickViewProduct)}>
                          <ShoppingCart className="mr-2 h-4 w-4" />
                          Add to Cart
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2 flex-1">
                          <Button variant="outline" onClick={() => removeFromCart(quickViewProduct.id)}>
                            <Minus className="h-4 w-4" />
                          </Button>
                          <span className="font-medium px-3">{getCartQuantity(quickViewProduct.id)}</span>
                          <Button variant="outline" onClick={() => addToCart(quickViewProduct)}>
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditingProduct(quickViewProduct);
                          setFormData({
                            name: quickViewProduct.name,
                            category: quickViewProduct.category,
                            material: quickViewProduct.material || "",
                            shape: quickViewProduct.shape || "",
                            direction: quickViewProduct.direction || "",
                            bit_type: quickViewProduct.bit_type || "",
                            grit: quickViewProduct.grit || "",
                            unit: quickViewProduct.unit || "piece",
                            sku: quickViewProduct.sku,
                            price_usd: quickViewProduct.price_usd.toString(),
                            salon_price_usd: quickViewProduct.salon_price_usd?.toString() || "",
                            wholesale_price_usd: quickViewProduct.wholesale_price_usd?.toString() || "",
                            stock_on_hand: quickViewProduct.stock_on_hand?.toString() || "0",
                            stock_reserved: quickViewProduct.stock_reserved?.toString() || "0",
                            reorder_level: quickViewProduct.reorder_level?.toString() || "10",
                            supplier: quickViewProduct.supplier || "",
                            is_parent: quickViewProduct.is_parent || false,
                            parent_product_id: quickViewProduct.parent_product_id || "",
                            variant_name: quickViewProduct.variant_name || "",
                          });
                          setExistingImages(quickViewProduct.images || []);
                          setQuickViewProduct(null);
                          setIsDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                    </div>
                  </div>
                )}
          </DialogContent>
        </Dialog>
      )}

      {/* Bulk Stock Update Dialog */}
      <Dialog open={isBulkStockOpen} onOpenChange={setIsBulkStockOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bulk Stock Update</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Update stock for {selectedProducts.size} selected product(s)
            </p>
            <div className="space-y-2">
              <Label>Action</Label>
              <Select value={bulkStockAction} onValueChange={(v: "set" | "add" | "subtract") => setBulkStockAction(v)}>
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background border">
                  <SelectItem value="set">Set stock to</SelectItem>
                  <SelectItem value="add">Add to stock</SelectItem>
                  <SelectItem value="subtract">Subtract from stock</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Value</Label>
              <Input
                type="number"
                min="0"
                value={bulkStockValue}
                onChange={(e) => setBulkStockValue(e.target.value)}
                placeholder="Enter quantity"
              />
            </div>
            <Button onClick={handleBulkStockUpdate} className="w-full">
              Update Stock
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* CSV Import Dialog */}
      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Products from CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Found {importData.length} product(s) to import
            </p>
            <div className="bg-muted p-3 rounded text-xs font-mono max-h-40 overflow-auto">
              {importPreview || "No preview available"}
            </div>
            <p className="text-xs text-muted-foreground">
              Expected columns: name, sku, category, price (or price_usd), stock (or stock_on_hand), supplier
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsImportOpen(false)} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleImportProducts} className="flex-1">
                Import {importData.length} Products
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

    export default Products;
