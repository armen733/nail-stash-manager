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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Percent, Gift, Crown, Trash2, Edit, Users, UserPlus, UsersRound, Settings } from "lucide-react";
import { format } from "date-fns";
import { 
  usePromotions, 
  useDeleteDiscountCode, 
  useToggleDiscountCode, 
  useUpdateLoyaltySettings,
  PROMOTIONS_QUERY_KEY,
  DiscountCode,
  LoyaltyTransaction,
  UserTier,
  Profile,
  LoyaltySettings,
} from "@/hooks/usePromotions";
import { useQueryClient } from "@tanstack/react-query";
import { TableSkeleton } from "@/components/skeletons/TableSkeleton";
import { PromotionsTabSkeleton, LoyaltySettingsSkeleton } from "@/components/skeletons/PromotionsSkeleton";

const TIER_DISCOUNTS: Record<string, number> = {
  none: 0,
  bronze: 5,
  silver: 10,
  gold: 15,
};

const Promotions = () => {
  const [discountCodes, setDiscountCodes] = useState<DiscountCode[]>([]);
  const [loyaltyTransactions, setLoyaltyTransactions] = useState<LoyaltyTransaction[]>([]);
  const [userTiers, setUserTiers] = useState<UserTier[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loyaltySettings, setLoyaltySettings] = useState<LoyaltySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<DiscountCode | null>(null);
  
  // Settings dialog state
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [settingsFormData, setSettingsFormData] = useState({
    points_per_dollar: 1,
    points_required_for_redemption: 100,
    redemption_value_usd: 5,
  });

  // Loyalty points dialog state
  const [isPointsDialogOpen, setIsPointsDialogOpen] = useState(false);
  const [pointsFormData, setPointsFormData] = useState({
    targetType: "specific" as "specific" | "all",
    userId: "",
    points: 0,
    type: "earned" as "earned" | "redeemed",
    description: "",
  });

  // Tier dialog state
  const [isTierDialogOpen, setIsTierDialogOpen] = useState(false);
  const [tierFormData, setTierFormData] = useState({
    targetType: "specific" as "specific" | "all",
    userId: "",
    tier: "none" as "none" | "bronze" | "silver" | "gold",
    validUntil: "",
  });

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
      const [codesRes, transactionsRes, tiersRes, profilesRes, settingsRes] = await Promise.all([
        supabase.from("discount_codes").select("*").order("created_at", { ascending: false }),
        supabase.from("loyalty_transactions").select("*").order("created_at", { ascending: false }).limit(50),
        supabase.from("user_tiers").select("*").order("updated_at", { ascending: false }),
        supabase.from("profiles").select("id, email, full_name, loyalty_points"),
        supabase.from("loyalty_settings").select("*").limit(1).single(),
      ]);

      if (codesRes.error) throw codesRes.error;
      if (transactionsRes.error) throw transactionsRes.error;
      if (tiersRes.error) throw tiersRes.error;
      if (profilesRes.error) throw profilesRes.error;

      setDiscountCodes(codesRes.data || []);
      setLoyaltyTransactions(transactionsRes.data || []);
      setUserTiers(tiersRes.data || []);
      setProfiles(profilesRes.data || []);
      
      if (settingsRes.data) {
        setLoyaltySettings(settingsRes.data);
        setSettingsFormData({
          points_per_dollar: settingsRes.data.points_per_dollar,
          points_required_for_redemption: settingsRes.data.points_required_for_redemption,
          redemption_value_usd: settingsRes.data.redemption_value_usd,
        });
      }
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

  const resetPointsForm = () => {
    setPointsFormData({
      targetType: "specific",
      userId: "",
      points: 0,
      type: "earned",
      description: "",
    });
  };

  const resetTierForm = () => {
    setTierFormData({
      targetType: "specific",
      userId: "",
      tier: "none",
      validUntil: "",
    });
  };

  const handleSaveSettings = async () => {
    if (!loyaltySettings) return;
    
    try {
      const { error } = await supabase
        .from("loyalty_settings")
        .update({
          points_per_dollar: settingsFormData.points_per_dollar,
          points_required_for_redemption: settingsFormData.points_required_for_redemption,
          redemption_value_usd: settingsFormData.redemption_value_usd,
        })
        .eq("id", loyaltySettings.id);
      
      if (error) throw error;
      
      setLoyaltySettings({
        ...loyaltySettings,
        ...settingsFormData,
      });
      
      toast.success("Loyalty settings updated");
      setIsSettingsDialogOpen(false);
    } catch (error: any) {
      toast.error("Error saving settings: " + error.message);
    }
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

  // Handle loyalty points adjustment
  const handleAdjustPoints = async () => {
    if (pointsFormData.points <= 0) {
      toast.error("Please enter a valid number of points");
      return;
    }

    if (pointsFormData.targetType === "specific" && !pointsFormData.userId) {
      toast.error("Please select a user");
      return;
    }

    try {
      const targetUsers = pointsFormData.targetType === "all" 
        ? profiles.map(p => p.id)
        : [pointsFormData.userId];

      // Create loyalty transactions
      const transactions = targetUsers.map(userId => ({
        user_id: userId,
        points: pointsFormData.points,
        type: pointsFormData.type,
        description: pointsFormData.description || `Manual ${pointsFormData.type} - Admin adjustment`,
      }));

      const { error: txError } = await supabase
        .from("loyalty_transactions")
        .insert(transactions);
      if (txError) throw txError;

      // Update profile loyalty_points
      for (const userId of targetUsers) {
        const profile = profiles.find(p => p.id === userId);
        const currentPoints = profile?.loyalty_points || 0;
        const newPoints = pointsFormData.type === "earned" 
          ? currentPoints + pointsFormData.points
          : Math.max(0, currentPoints - pointsFormData.points);

        const { error: profileError } = await supabase
          .from("profiles")
          .update({ loyalty_points: newPoints })
          .eq("id", userId);
        if (profileError) throw profileError;
      }

      toast.success(`Points ${pointsFormData.type} for ${targetUsers.length} user(s)`);
      setIsPointsDialogOpen(false);
      resetPointsForm();
      fetchData();
    } catch (error: any) {
      toast.error("Error adjusting points: " + error.message);
    }
  };

  // Handle tier adjustment
  const handleAdjustTier = async () => {
    if (tierFormData.targetType === "specific" && !tierFormData.userId) {
      toast.error("Please select a user");
      return;
    }

    try {
      const targetUsers = tierFormData.targetType === "all" 
        ? profiles.map(p => p.id)
        : [tierFormData.userId];

      const tierDiscount = TIER_DISCOUNTS[tierFormData.tier];
      const validUntil = tierFormData.validUntil || null;

      for (const userId of targetUsers) {
        const existingTier = userTiers.find(t => t.user_id === userId);

        const tierData = {
          user_id: userId,
          current_tier: tierFormData.tier,
          tier_discount_percent: tierDiscount,
          tier_valid_until: validUntil,
          updated_at: new Date().toISOString(),
        };

        if (existingTier) {
          const { error } = await supabase
            .from("user_tiers")
            .update(tierData)
            .eq("id", existingTier.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("user_tiers")
            .insert([tierData]);
          if (error) throw error;
        }
      }

      toast.success(`Tier updated for ${targetUsers.length} user(s)`);
      setIsTierDialogOpen(false);
      resetTierForm();
      fetchData();
    } catch (error: any) {
      toast.error("Error adjusting tier: " + error.message);
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

  const getUserName = (userId: string) => {
    const profile = profiles.find(p => p.id === userId);
    return profile ? profile.full_name || profile.email : userId.slice(0, 8) + "...";
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Promotions</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">Manage discount codes, loyalty points, and customer tiers</p>
      </div>

      <Tabs defaultValue="discount-codes" className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-auto p-1">
          <TabsTrigger value="discount-codes" className="flex items-center gap-1.5 sm:gap-2 py-2.5 sm:py-2 text-xs sm:text-sm min-h-[44px]">
            <Percent className="h-4 w-4 flex-shrink-0" />
            <span className="hidden sm:inline">Discount Codes</span>
            <span className="sm:hidden">Codes</span>
          </TabsTrigger>
          <TabsTrigger value="loyalty" className="flex items-center gap-1.5 sm:gap-2 py-2.5 sm:py-2 text-xs sm:text-sm min-h-[44px]">
            <Gift className="h-4 w-4 flex-shrink-0" />
            <span className="hidden sm:inline">Loyalty Points</span>
            <span className="sm:hidden">Loyalty</span>
          </TabsTrigger>
          <TabsTrigger value="tiers" className="flex items-center gap-1.5 sm:gap-2 py-2.5 sm:py-2 text-xs sm:text-sm min-h-[44px]">
            <Crown className="h-4 w-4 flex-shrink-0" />
            <span className="hidden sm:inline">Customer Tiers</span>
            <span className="sm:hidden">Tiers</span>
          </TabsTrigger>
        </TabsList>

        {/* Discount Codes Tab */}
        <TabsContent value="discount-codes" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
            <h2 className="text-lg sm:text-xl font-semibold">Discount Codes</h2>
            <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
              setIsAddDialogOpen(open);
              if (!open) resetForm();
            }}>
              <DialogTrigger asChild>
                <Button className="h-11 min-h-[44px] w-full sm:w-auto">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Code
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-[95vw] sm:max-w-md">
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
                  <Button onClick={handleSaveDiscountCode} className="w-full h-11 min-h-[44px]">
                    {editingCode ? "Update" : "Create"} Code
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="p-0 sm:p-0">
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
                            <div className="flex justify-end gap-1 sm:gap-2">
                              <Button variant="ghost" size="icon" className="h-10 w-10 min-h-[44px] min-w-[44px]" onClick={() => handleEditCode(code)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-10 w-10 min-h-[44px] min-w-[44px]" onClick={() => handleDeleteCode(code.id)}>
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
          {/* Settings Card */}
          <Card className="bg-muted/30">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-medium">Point Conversion Settings</h3>
                  <p className="text-sm text-muted-foreground">
                    {loyaltySettings ? (
                      <>
                        {loyaltySettings.points_per_dollar} point{loyaltySettings.points_per_dollar !== 1 ? 's' : ''} per $1 spent • {loyaltySettings.points_required_for_redemption} points = ${loyaltySettings.redemption_value_usd} off
                      </>
                    ) : (
                      "Loading settings..."
                    )}
                  </p>
                </div>
                <Dialog open={isSettingsDialogOpen} onOpenChange={setIsSettingsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="h-11 min-h-[44px] w-full sm:w-auto">
                      <Settings className="mr-2 h-4 w-4" />
                      Configure
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-[95vw] sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Loyalty Point Settings</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="points_per_dollar">Points earned per $1 spent</Label>
                        <Input
                          id="points_per_dollar"
                          type="number"
                          min="1"
                          value={settingsFormData.points_per_dollar}
                          onChange={(e) => setSettingsFormData({ ...settingsFormData, points_per_dollar: parseInt(e.target.value) || 1 })}
                        />
                        <p className="text-xs text-muted-foreground">Customer earns this many points for every $1 spent</p>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="points_required">Points required for redemption</Label>
                        <Input
                          id="points_required"
                          type="number"
                          min="1"
                          value={settingsFormData.points_required_for_redemption}
                          onChange={(e) => setSettingsFormData({ ...settingsFormData, points_required_for_redemption: parseInt(e.target.value) || 100 })}
                        />
                        <p className="text-xs text-muted-foreground">Minimum points needed to redeem for a discount</p>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="redemption_value">Redemption value ($)</Label>
                        <Input
                          id="redemption_value"
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={settingsFormData.redemption_value_usd}
                          onChange={(e) => setSettingsFormData({ ...settingsFormData, redemption_value_usd: parseFloat(e.target.value) || 5 })}
                        />
                        <p className="text-xs text-muted-foreground">Dollar value of the discount when points are redeemed</p>
                      </div>
                      
                      <div className="p-3 bg-muted rounded-lg">
                        <p className="text-sm font-medium">Preview</p>
                        <p className="text-sm text-muted-foreground">
                          Customers earn {settingsFormData.points_per_dollar} point{settingsFormData.points_per_dollar !== 1 ? 's' : ''} per $1 spent.
                          <br />
                          {settingsFormData.points_required_for_redemption} points = ${settingsFormData.redemption_value_usd} off
                        </p>
                      </div>
                      
                      <Button onClick={handleSaveSettings} className="w-full h-11 min-h-[44px]">
                        Save Settings
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
            <div>
              <h2 className="text-lg sm:text-xl font-semibold">Loyalty Points</h2>
              <p className="text-xs sm:text-sm text-muted-foreground">Manage user points and view transactions</p>
            </div>
            <Dialog open={isPointsDialogOpen} onOpenChange={(open) => {
              setIsPointsDialogOpen(open);
              if (!open) resetPointsForm();
            }}>
              <DialogTrigger asChild>
                <Button className="h-11 min-h-[44px] w-full sm:w-auto">
                  <Plus className="mr-2 h-4 w-4" />
                  Adjust Points
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-[95vw] sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Adjust Loyalty Points</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Apply To</Label>
                    <Select
                      value={pointsFormData.targetType}
                      onValueChange={(value: "specific" | "all") => setPointsFormData({ ...pointsFormData, targetType: value, userId: "" })}
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background border">
                        <SelectItem value="specific">
                          <div className="flex items-center gap-2">
                            <UserPlus className="h-4 w-4" />
                            Specific User
                          </div>
                        </SelectItem>
                        <SelectItem value="all">
                          <div className="flex items-center gap-2">
                            <UsersRound className="h-4 w-4" />
                            All Users ({profiles.length})
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {pointsFormData.targetType === "specific" && (
                    <div className="space-y-2">
                      <Label>Select User</Label>
                      <Select
                        value={pointsFormData.userId}
                        onValueChange={(value) => setPointsFormData({ ...pointsFormData, userId: value })}
                      >
                        <SelectTrigger className="bg-background">
                          <SelectValue placeholder="Choose a user..." />
                        </SelectTrigger>
                        <SelectContent className="bg-background border max-h-[200px]">
                          {profiles.map((profile) => (
                            <SelectItem key={profile.id} value={profile.id}>
                              <div className="flex flex-col">
                                <span>{profile.full_name}</span>
                                <span className="text-xs text-muted-foreground">{profile.email} • {profile.loyalty_points || 0} pts</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Action</Label>
                      <Select
                        value={pointsFormData.type}
                        onValueChange={(value: "earned" | "redeemed") => setPointsFormData({ ...pointsFormData, type: value })}
                      >
                        <SelectTrigger className="bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-background border">
                          <SelectItem value="earned">Add Points</SelectItem>
                          <SelectItem value="redeemed">Remove Points</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="points">Points</Label>
                      <Input
                        id="points"
                        type="number"
                        min="1"
                        value={pointsFormData.points || ""}
                        onChange={(e) => setPointsFormData({ ...pointsFormData, points: parseInt(e.target.value) || 0 })}
                        placeholder="100"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Reason (optional)</Label>
                    <Textarea
                      id="description"
                      value={pointsFormData.description}
                      onChange={(e) => setPointsFormData({ ...pointsFormData, description: e.target.value })}
                      placeholder="e.g. Birthday bonus, Promotion, Correction..."
                      rows={2}
                    />
                  </div>

                  <Button onClick={handleAdjustPoints} className="w-full h-11 min-h-[44px]">
                    {pointsFormData.type === "earned" ? "Add" : "Remove"} {pointsFormData.points || 0} Points
                    {pointsFormData.targetType === "all" && ` to ${profiles.length} users`}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* User Points Overview */}
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-sm sm:text-base">User Points Overview</CardTitle>
            </CardHeader>
            <CardContent className="p-0 sm:p-0">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : profiles.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No users found.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead className="text-right">Points</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {profiles.map((profile) => (
                        <TableRow key={profile.id}>
                          <TableCell className="font-medium">{profile.full_name}</TableCell>
                          <TableCell className="text-muted-foreground">{profile.email}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="secondary">{profile.loyalty_points || 0} pts</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Transactions */}
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-sm sm:text-base">Recent Transactions</CardTitle>
            </CardHeader>
            <CardContent className="p-0 sm:p-0">
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
                        <TableHead>User</TableHead>
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
                          <TableCell className="font-medium">{getUserName(tx.user_id)}</TableCell>
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
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
            <h2 className="text-lg sm:text-xl font-semibold">Customer Tiers</h2>
            <Dialog open={isTierDialogOpen} onOpenChange={(open) => {
              setIsTierDialogOpen(open);
              if (!open) resetTierForm();
            }}>
              <DialogTrigger asChild>
                <Button className="h-11 min-h-[44px] w-full sm:w-auto">
                  <Crown className="mr-2 h-4 w-4" />
                  Set Tier
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-[95vw] sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Set Customer Tier</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Apply To</Label>
                    <Select
                      value={tierFormData.targetType}
                      onValueChange={(value: "specific" | "all") => setTierFormData({ ...tierFormData, targetType: value, userId: "" })}
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background border">
                        <SelectItem value="specific">
                          <div className="flex items-center gap-2">
                            <UserPlus className="h-4 w-4" />
                            Specific User
                          </div>
                        </SelectItem>
                        <SelectItem value="all">
                          <div className="flex items-center gap-2">
                            <UsersRound className="h-4 w-4" />
                            All Users ({profiles.length})
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {tierFormData.targetType === "specific" && (
                    <div className="space-y-2">
                      <Label>Select User</Label>
                      <Select
                        value={tierFormData.userId}
                        onValueChange={(value) => setTierFormData({ ...tierFormData, userId: value })}
                      >
                        <SelectTrigger className="bg-background">
                          <SelectValue placeholder="Choose a user..." />
                        </SelectTrigger>
                        <SelectContent className="bg-background border max-h-[200px]">
                          {profiles.map((profile) => {
                            const tier = userTiers.find(t => t.user_id === profile.id);
                            return (
                              <SelectItem key={profile.id} value={profile.id}>
                                <div className="flex flex-col">
                                  <span>{profile.full_name}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {profile.email} • Current: {tier?.current_tier || "none"}
                                  </span>
                                </div>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Tier</Label>
                    <Select
                      value={tierFormData.tier}
                      onValueChange={(value: "none" | "bronze" | "silver" | "gold") => setTierFormData({ ...tierFormData, tier: value })}
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background border">
                        <SelectItem value="none">None (0% discount)</SelectItem>
                        <SelectItem value="bronze">Bronze (5% discount)</SelectItem>
                        <SelectItem value="silver">Silver (10% discount)</SelectItem>
                        <SelectItem value="gold">Gold (15% discount)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tier_valid_until">Valid Until (optional)</Label>
                    <Input
                      id="tier_valid_until"
                      type="date"
                      value={tierFormData.validUntil}
                      onChange={(e) => setTierFormData({ ...tierFormData, validUntil: e.target.value })}
                    />
                  </div>

                  <Button onClick={handleAdjustTier} className="w-full">
                    Set to {tierFormData.tier.charAt(0).toUpperCase() + tierFormData.tier.slice(1)}
                    {tierFormData.targetType === "all" && ` for ${profiles.length} users`}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
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
                  <p>No customer tiers yet. Use "Set Tier" to assign tiers manually.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Tier</TableHead>
                        <TableHead>Discount</TableHead>
                        <TableHead className="hidden md:table-cell">Monthly Spend</TableHead>
                        <TableHead className="hidden sm:table-cell">Valid Until</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {userTiers.map((tier) => (
                        <TableRow key={tier.id}>
                          <TableCell className="font-medium">
                            {getUserName(tier.user_id)}
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
