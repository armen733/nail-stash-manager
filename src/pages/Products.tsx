import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Package, Search, Plus, Pencil, Trash2, Upload, X, ShoppingCart, Minus, Download, Filter, Copy, Trash, Eye } from "lucide-react";
import { downloadCSV } from "@/lib/csv-export";
import { Checkbox } from "@/components/ui/checkbox";
import { Pagination } from "@/components/Pagination";
import { usePagination } from "@/hooks/usePagination";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Product {
  id: string;
  name: string;
  category: string;
  bit_type: string | null;
  grit: string | null;
  unit: string | null;
  sku: string;
  price_usd: number;
  salon_price_usd: number | null;
  wholesale_price_usd: number | null;
  image_url: string | null;
  stock_on_hand: number | null;
  stock_reserved: number | null;
  reorder_level: number | null;
  supplier: string | null;
}

interface CartItem {
  product: Product;
  quantity: number;
}

const Products = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"name" | "price" | "stock">("name");
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: "",
    category: "Nail Drill Bits",
    bit_type: "",
    grit: "",
    unit: "piece",
    sku: "",
    price_usd: "",
    salon_price_usd: "",
    wholesale_price_usd: "",
    stock_on_hand: "0",
    stock_reserved: "0",
    reorder_level: "10",
    supplier: "",
  });

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("name");

      if (error) throw error;
      setProducts(data || []);
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

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadImage = async () => {
    if (!imageFile) return null;

    setUploading(true);
    try {
      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, imageFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (error: any) {
      toast({
        title: "Upload Error",
        description: error.message,
        variant: "destructive",
      });
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let imageUrl = editingProduct?.image_url || null;
    
    if (imageFile) {
      const uploadedUrl = await uploadImage();
      if (uploadedUrl) imageUrl = uploadedUrl;
    }

    const productData = {
      name: formData.name,
      category: formData.category,
      bit_type: formData.bit_type || null,
      grit: formData.grit || null,
      unit: formData.unit || null,
      sku: formData.sku,
      price_usd: parseFloat(formData.price_usd),
      salon_price_usd: formData.salon_price_usd ? parseFloat(formData.salon_price_usd) : null,
      wholesale_price_usd: formData.wholesale_price_usd ? parseFloat(formData.wholesale_price_usd) : null,
      image_url: imageUrl,
      stock_on_hand: parseInt(formData.stock_on_hand) || 0,
      stock_reserved: parseInt(formData.stock_reserved) || 0,
      reorder_level: parseInt(formData.reorder_level) || 10,
      supplier: formData.supplier || null,
    };

    try {
      if (editingProduct) {
        const { error } = await supabase
          .from("products")
          .update(productData)
          .eq("id", editingProduct.id);

        if (error) throw error;
        toast({ title: "Success", description: "Product updated successfully" });
      } else {
        const { error } = await supabase.from("products").insert([productData]);

        if (error) throw error;
        toast({ title: "Success", description: "Product added successfully" });
      }

      setIsDialogOpen(false);
      resetForm();
      fetchProducts();
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
      fetchProducts();
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
      category: "Nail Drill Bits",
      bit_type: "",
      grit: "",
      unit: "piece",
      sku: "",
      price_usd: "",
      salon_price_usd: "",
      wholesale_price_usd: "",
      stock_on_hand: "0",
      stock_reserved: "0",
      reorder_level: "10",
      supplier: "",
    });
    setEditingProduct(null);
    setImageFile(null);
    setImagePreview(null);
  };

  const filteredProducts = products.filter((product) => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === "all" || product.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (sortBy === "name") return a.name.localeCompare(b.name);
    if (sortBy === "price") return a.price_usd - b.price_usd;
    if (sortBy === "stock") return (b.stock_on_hand || 0) - (a.stock_on_hand || 0);
    return 0;
  });

  const categories = ["all", ...Array.from(new Set(products.map(p => p.category)))];

  const {
    currentPage,
    totalPages,
    paginatedItems,
    goToPage,
    hasNextPage,
    hasPrevPage,
    resetPage,
  } = usePagination(sortedProducts, 12);

  useEffect(() => {
    resetPage();
  }, [searchTerm, categoryFilter, sortBy, resetPage]);

  const exportProducts = () => {
    const exportData = filteredProducts.map(p => ({
      Name: p.name,
      SKU: p.sku,
      Category: p.category,
      'Price (USD)': p.price_usd,
      'Stock On Hand': p.stock_on_hand || 0,
      'Reorder Level': p.reorder_level || 0,
      Supplier: p.supplier || '',
    }));
    downloadCSV(exportData, 'products');
    toast({ title: "Success", description: "Products exported successfully" });
  };

  const handleDuplicateProduct = async (product: Product) => {
    const duplicatedData = {
      name: `${product.name} (Copy)`,
      category: product.category,
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
      fetchProducts();
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
    if (selectedProducts.size === paginatedItems.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(paginatedItems.map(p => p.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedProducts.size === 0) {
      toast({ title: "Error", description: "No products selected", variant: "destructive" });
      return;
    }

    if (!confirm(`Delete ${selectedProducts.size} product(s)?`)) return;

    try {
      const { error } = await supabase
        .from("products")
        .delete()
        .in("id", Array.from(selectedProducts));

      if (error) throw error;

      toast({ title: "Success", description: `${selectedProducts.size} product(s) deleted` });
      setSelectedProducts(new Set());
      fetchProducts();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Products</h1>
          <p className="text-muted-foreground mt-1">Manage your product catalog</p>
        </div>
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
                <Label>Product Image</Label>
                <div className="flex flex-col gap-4">
                  {imagePreview && (
                    <div className="relative w-32 h-32 border rounded-lg overflow-hidden">
                      <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute top-1 right-1 h-6 w-6"
                        onClick={() => {
                          setImageFile(null);
                          setImagePreview(null);
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {imagePreview ? "Change Image" : "Upload Image"}
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
                  <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Nail Drill Bits">Nail Drill Bits</SelectItem>
                      <SelectItem value="Sanding Bands">Sanding Bands</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2 w-full sm:w-auto flex-wrap">
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-[140px]">
                    <Filter className="mr-2 h-4 w-4" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat} value={cat}>
                        {cat === "all" ? "All Categories" : cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={sortBy} onValueChange={(value: "name" | "price" | "stock") => setSortBy(value)}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="price">Price</SelectItem>
                    <SelectItem value="stock">Stock</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={exportProducts} variant="outline" size="default">
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Button>
              </div>
            </div>
            {selectedProducts.size > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">
                  {selectedProducts.size} selected
                </span>
                <Button onClick={handleBulkDelete} variant="destructive" size="sm">
                  <Trash className="mr-2 h-4 w-4" />
                  Delete Selected
                </Button>
                <Button onClick={() => setSelectedProducts(new Set())} variant="outline" size="sm">
                  Clear
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          ) : paginatedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Package className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No products found. Add your first product to get started.</p>
            </div>
          ) : (
            <>
              {paginatedItems.length > 0 && (
                <div className="flex items-center gap-2 mb-4">
                  <Checkbox
                    checked={selectedProducts.size === paginatedItems.length && paginatedItems.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                  <span className="text-sm text-muted-foreground">Select All</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                {paginatedItems.map((product) => (
                  <Card key={product.id} className="relative overflow-hidden flex flex-col h-full min-w-0">
                    <div className="absolute top-2 left-2 z-10">
                      <Checkbox
                        checked={selectedProducts.has(product.id)}
                        onCheckedChange={() => toggleProductSelection(product.id)}
                        className="bg-background"
                      />
                    </div>
                    <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden group relative">
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" />
                      ) : (
                        <Package className="h-16 w-16 text-muted-foreground/30" />
                      )}
                      <Button
                        size="sm"
                        variant="secondary"
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => setQuickViewProduct(product)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                    <CardContent className="p-4 flex-1 flex flex-col">
                      <div className="flex items-start justify-between gap-2 mb-2 min-h-[3.5rem]">
                        <h3 className="font-semibold text-base line-clamp-2 break-words flex-1 min-w-0">{product.name}</h3>
                        <span className="font-mono text-[10px] leading-none text-muted-foreground bg-muted px-2 py-1 rounded shrink-0 max-w-[60px] truncate">
                          {product.sku}
                        </span>
                      </div>
                      <div className="space-y-1 text-sm flex-1">
                        <p><span className="text-muted-foreground">Category:</span> {product.category}</p>
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
                        <div className="flex items-center gap-2 mt-4">
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
                          onClick={() => addToCart(product)}
                        >
                          <ShoppingCart className="mr-2 h-4 w-4" />
                          <span className="sm:hidden">Add</span>
                          <span className="hidden sm:inline">Add to Cart</span>
                        </Button>
                      )}

                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingProduct(product);
                            setFormData({
                              name: product.name,
                              category: product.category,
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
                            });
                            setImagePreview(product.image_url);
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
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={goToPage}
                hasNextPage={hasNextPage}
                hasPrevPage={hasPrevPage}
              />
            </>
          )}
        </CardContent>
      </Card>

      {cart.length > 0 && (
        <div className="fixed bottom-4 right-4 left-4 md:left-auto md:w-96 z-50">
          <Card className="shadow-lg border-2">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5" />
                  <h3 className="font-semibold">Cart ({cartItemCount} items)</h3>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setCart([])}
                >
                  Clear
                </Button>
              </div>
              <div className="max-h-48 overflow-y-auto mb-3 space-y-2">
                {cart.map(item => (
                  <div key={item.product.id} className="flex items-center justify-between text-sm">
                    <span className="flex-1 truncate">{item.product.name}</span>
                    <span className="text-muted-foreground mx-2">×{item.quantity}</span>
                    <span className="font-semibold">${(item.product.price_usd * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t pt-3 mb-3">
                <div className="flex items-center justify-between font-bold text-lg">
                  <span>Total</span>
                  <span>${cartTotal.toFixed(2)}</span>
                </div>
              </div>
              <Button 
                className="w-full" 
                onClick={handlePlaceOrder}
              >
                Place Order
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Quick View Modal */}
      <Dialog open={!!quickViewProduct} onOpenChange={(open) => !open && setQuickViewProduct(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Product Details</DialogTitle>
          </DialogHeader>
          {quickViewProduct && (
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="aspect-square bg-muted rounded-lg overflow-hidden flex items-center justify-center">
                  {quickViewProduct.image_url ? (
                    <img src={quickViewProduct.image_url} alt={quickViewProduct.name} className="w-full h-full object-cover" />
                  ) : (
                    <Package className="h-24 w-24 text-muted-foreground/30" />
                  )}
                </div>
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
                        });
                        setImagePreview(quickViewProduct.image_url);
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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Products;
