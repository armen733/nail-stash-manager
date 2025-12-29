import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Percent, Gift, Crown, Trash2, Edit, Users } from "lucide-react";
import { format } from "date-fns";

interface DiscountCode {
  id: string;
  code: string;
  discount_percent: number;
  valid_from: string | null;
  valid_until: string | null;
  max_uses: number | null;
  current_uses: number | null;
  min_order_amount: number | null;
  is_active: boolean | null;
  created_at: string | null;
}

interface LoyaltyTransaction {
  id: string;
  user_id: string;
  points: number;
  type: string;
  order_id: string | null;
  description: string | null;
  created_at: string | null;
}

interface UserTier {
  id: string;
  user_id: string;
  current_tier: string | null;
  tier_discount_percent: number | null;
  monthly_spend: number | null;
  spend_month: string | null;
  tier_valid_until: string | null;
  created_at: string | null;
  updated_at: string | null;
}

const Promotions = () => {
  const [discountCodes, setDiscountCodes] = useState<DiscountCode[]>([]);
  const [loyaltyTransactions, setLoyaltyTransactions] = useState<LoyaltyTransaction[]>([]);
  const [userTiers, setUserTiers] = useState<UserTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<DiscountCode | null>(null);

  // Form state for new/edit discount code
  const [formData, setFormData] = useState({
    code: "",
    discount_percent: 10,
    valid_from: "",
    valid_until: "",
    max_uses: "",
    min_order_amount: "",
    is_active: true,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [codesRes, transactionsRes, tiersRes] = await Promise.all([
        supabase.from("discount_codes").select("*").order("created_at", { ascending: false }),
        supabase.from("loyalty_transactions").select("*").order("created_at", { ascending: false }).limit(50),
        supabase.from("user_tiers").select("*").order("updated_at", { ascending: false }),
      ]);

      if (codesRes.error) throw codesRes.error;
      if (transactionsRes.error) throw transactionsRes.error;
      if (tiersRes.error) throw tiersRes.error;

      setDiscountCodes(codesRes.data || []);
      setLoyaltyTransactions(transactionsRes.data || []);
      setUserTiers(tiersRes.data || []);
    } catch (error: any) {
      toast.error("Error loading promotions data: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      code: "",
      discount_percent: 10,
      valid_from: "",
      valid_until: "",
      max_uses: "",
      min_order_amount: "",
      is_active: true,
    });
    setEditingCode(null);
  };

  const handleSaveDiscountCode = async () => {
    if (!formData.code.trim()) {
      toast.error("Please enter a discount code");
      return;
    }

    try {
      const payload = {
        code: formData.code.toUpperCase().trim(),
        discount_percent: formData.discount_percent,
        valid_from: formData.valid_from || null,
        valid_until: formData.valid_until || null,
        max_uses: formData.max_uses ? parseInt(formData.max_uses) : null,
        min_order_amount: formData.min_order_amount ? parseFloat(formData.min_order_amount) : 0,
        is_active: formData.is_active,
      };

      if (editingCode) {
        const { error } = await supabase
          .from("discount_codes")
          .update(payload)
          .eq("id", editingCode.id);
        if (error) throw error;
        toast.success("Discount code updated");
      } else {
        const { error } = await supabase
          .from("discount_codes")
          .insert([payload]);
        if (error) throw error;
        toast.success("Discount code created");
      }

      setIsAddDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast.error("Error saving discount code: " + error.message);
    }
  };

  const handleEditCode = (code: DiscountCode) => {
    setEditingCode(code);
    setFormData({
      code: code.code,
      discount_percent: code.discount_percent,
      valid_from: code.valid_from ? code.valid_from.split("T")[0] : "",
      valid_until: code.valid_until ? code.valid_until.split("T")[0] : "",
      max_uses: code.max_uses?.toString() || "",
      min_order_amount: code.min_order_amount?.toString() || "",
      is_active: code.is_active ?? true,
    });
    setIsAddDialogOpen(true);
  };

  const handleDeleteCode = async (id: string) => {
    if (!confirm("Are you sure you want to delete this discount code?")) return;

    try {
      const { error } = await supabase
        .from("discount_codes")
        .delete()
        .eq("id", id);
      if (error) throw error;
      toast.success("Discount code deleted");
      fetchData();
    } catch (error: any) {
      toast.error("Error deleting discount code: " + error.message);
    }
  };

  const toggleCodeActive = async (code: DiscountCode) => {
    try {
      const { error } = await supabase
        .from("discount_codes")
        .update({ is_active: !code.is_active })
        .eq("id", code.id);
      if (error) throw error;
      toast.success(`Code ${code.is_active ? "deactivated" : "activated"}`);
      fetchData();
    } catch (error: any) {
      toast.error("Error updating code: " + error.message);
    }
  };

  const getTierBadgeColor = (tier: string | null) => {
    switch (tier) {
      case "gold": return "bg-yellow-500 text-yellow-950";
      case "silver": return "bg-gray-400 text-gray-950";
      case "bronze": return "bg-amber-600 text-amber-50";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Promotions</h1>
        <p className="text-muted-foreground mt-1">Manage discount codes, loyalty points, and customer tiers</p>
      </div>

      <Tabs defaultValue="discount-codes" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="discount-codes" className="flex items-center gap-2">
            <Percent className="h-4 w-4" />
            <span className="hidden sm:inline">Discount Codes</span>
            <span className="sm:hidden">Codes</span>
          </TabsTrigger>
          <TabsTrigger value="loyalty" className="flex items-center gap-2">
            <Gift className="h-4 w-4" />
            <span className="hidden sm:inline">Loyalty Points</span>
            <span className="sm:hidden">Loyalty</span>
          </TabsTrigger>
          <TabsTrigger value="tiers" className="flex items-center gap-2">
            <Crown className="h-4 w-4" />
            <span className="hidden sm:inline">Customer Tiers</span>
            <span className="sm:hidden">Tiers</span>
          </TabsTrigger>
        </TabsList>

        {/* Discount Codes Tab */}
        <TabsContent value="discount-codes" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Discount Codes</h2>
            <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
              setIsAddDialogOpen(open);
              if (!open) resetForm();
            }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Code
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>{editingCode ? "Edit" : "Add"} Discount Code</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="code">Code</Label>
                    <Input
                      id="code"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                      placeholder="e.g. SAVE10"
                      className="uppercase"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="discount_percent">Discount Percent</Label>
                    <Input
                      id="discount_percent"
                      type="number"
                      min="1"
                      max="100"
                      value={formData.discount_percent}
                      onChange={(e) => setFormData({ ...formData, discount_percent: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="valid_from">Valid From</Label>
                      <Input
                        id="valid_from"
                        type="date"
                        value={formData.valid_from}
                        onChange={(e) => setFormData({ ...formData, valid_from: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="valid_until">Valid Until</Label>
                      <Input
                        id="valid_until"
                        type="date"
                        value={formData.valid_until}
                        onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="max_uses">Max Uses</Label>
                      <Input
                        id="max_uses"
                        type="number"
                        min="1"
                        value={formData.max_uses}
                        onChange={(e) => setFormData({ ...formData, max_uses: e.target.value })}
                        placeholder="Unlimited"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="min_order_amount">Min Order ($)</Label>
                      <Input
                        id="min_order_amount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.min_order_amount}
                        onChange={(e) => setFormData({ ...formData, min_order_amount: e.target.value })}
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="is_active"
                      checked={formData.is_active}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                    />
                    <Label htmlFor="is_active">Active</Label>
                  </div>
                  <Button onClick={handleSaveDiscountCode} className="w-full">
                    {editingCode ? "Update" : "Create"} Code
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : discountCodes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Percent className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No discount codes yet. Create your first one!</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Discount</TableHead>
                        <TableHead className="hidden md:table-cell">Valid Until</TableHead>
                        <TableHead className="hidden sm:table-cell">Uses</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {discountCodes.map((code) => (
                        <TableRow key={code.id}>
                          <TableCell className="font-mono font-bold">{code.code}</TableCell>
                          <TableCell>{code.discount_percent}%</TableCell>
                          <TableCell className="hidden md:table-cell">
                            {code.valid_until ? format(new Date(code.valid_until), "MMM d, yyyy") : "No expiry"}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            {code.current_uses || 0}/{code.max_uses || "∞"}
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={code.is_active ? "default" : "secondary"}
                              className="cursor-pointer"
                              onClick={() => toggleCodeActive(code)}
                            >
                              {code.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button variant="ghost" size="icon" onClick={() => handleEditCode(code)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDeleteCode(code.id)}>
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
            </CardContent>
          </Card>
        </TabsContent>

        {/* Loyalty Points Tab */}
        <TabsContent value="loyalty" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Loyalty Transactions</h2>
            <div className="text-sm text-muted-foreground">
              1 point per $1 spent • 100 points = $5 off
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : loyaltyTransactions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Gift className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No loyalty transactions yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Points</TableHead>
                        <TableHead className="hidden md:table-cell">Description</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loyaltyTransactions.map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell>
                            {tx.created_at ? format(new Date(tx.created_at), "MMM d, yyyy") : "-"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={tx.type === "earned" ? "default" : "secondary"}>
                              {tx.type}
                            </Badge>
                          </TableCell>
                          <TableCell className={tx.type === "earned" ? "text-green-600" : "text-red-600"}>
                            {tx.type === "earned" ? "+" : "-"}{tx.points}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-muted-foreground">
                            {tx.description || "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Customer Tiers Tab */}
        <TabsContent value="tiers" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Customer Tiers</h2>
          </div>

          {/* Tier Info Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card className="border-muted">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">None</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold">$0 - $99</p>
                <p className="text-sm text-muted-foreground">0% discount</p>
              </CardContent>
            </Card>
            <Card className="border-amber-600/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-amber-600">Bronze</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold">$100 - $149</p>
                <p className="text-sm text-muted-foreground">5% discount</p>
              </CardContent>
            </Card>
            <Card className="border-gray-400/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">Silver</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold">$150 - $199</p>
                <p className="text-sm text-muted-foreground">10% discount</p>
              </CardContent>
            </Card>
            <Card className="border-yellow-500/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-yellow-600">Gold</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold">$200+</p>
                <p className="text-sm text-muted-foreground">15% discount</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : userTiers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No customer tiers yet. Tiers are assigned when customers make purchases.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User ID</TableHead>
                        <TableHead>Tier</TableHead>
                        <TableHead>Discount</TableHead>
                        <TableHead className="hidden md:table-cell">Monthly Spend</TableHead>
                        <TableHead className="hidden sm:table-cell">Valid Until</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {userTiers.map((tier) => (
                        <TableRow key={tier.id}>
                          <TableCell className="font-mono text-xs">
                            {tier.user_id.slice(0, 8)}...
                          </TableCell>
                          <TableCell>
                            <Badge className={getTierBadgeColor(tier.current_tier)}>
                              {tier.current_tier || "none"}
                            </Badge>
                          </TableCell>
                          <TableCell>{tier.tier_discount_percent || 0}%</TableCell>
                          <TableCell className="hidden md:table-cell">
                            ${Number(tier.monthly_spend || 0).toFixed(2)}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            {tier.tier_valid_until ? format(new Date(tier.tier_valid_until), "MMM d, yyyy") : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Promotions;
