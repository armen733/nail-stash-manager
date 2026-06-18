import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Users as UsersIcon, Mail, Calendar, Phone, Plus, Star, ShoppingBag, Award, ChevronRight, X, Search, DollarSign, Share2 } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { logAudit } from "@/lib/audit-log";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface UserWithTier {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  loyalty_points: number | null;
  created_at: string;
  total_spent?: number;
  order_count?: number;
  user_tiers?: {
    current_tier: string | null;
    tier_discount_percent: number | null;
    monthly_spend: number | null;
  }[];
}

interface Order {
  id: string;
  order_date: string;
  status: string;
  total: number;
  customer_name: string | null;
  order_items?: {
    id: string;
    quantity: number;
    unit_price: number;
    products: { name: string } | null;
  }[];
}

export default function Users() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithTier | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [newsletterOnly, setNewsletterOnly] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
    referrer_id: "",
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch active referrers for the dropdown
  const { data: activeReferrers } = useQuery({
    queryKey: ["active-referrers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referrers")
        .select("id, name, referral_code")
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: newsletterSubscribers } = useQuery({
    queryKey: ["newsletter-subscribers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("newsletter_subscribers")
        .select("email");
      if (error) throw error;
      return new Set((data || []).map((s) => s.email.toLowerCase()));
    },
  });

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ["users-with-tiers"],
    queryFn: async () => {
      // Fetch profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone, loyalty_points, created_at")
        .order("created_at", { ascending: false });
      
      if (profilesError) throw profilesError;
      
      // Fetch user tiers
      const { data: tiers, error: tiersError } = await supabase
        .from("user_tiers")
        .select("user_id, current_tier, tier_discount_percent, monthly_spend");
      
      if (tiersError) throw tiersError;

      // Fetch all orders for total spent calculation (include all statuses except cancelled)
      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select("profile_id, customer_email, total, status");
      
      if (ordersError) throw ordersError;
      
      // Combine data with total spent
      const usersWithTiers = profiles.map(profile => {
        const userOrders = orders?.filter(o => 
          o.profile_id === profile.id || 
          (o.customer_email && o.customer_email.toLowerCase() === profile.email.toLowerCase())
        ) || [];
        const totalSpent = userOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
        const orderCount = userOrders.length;
        
        return {
          ...profile,
          user_tiers: tiers?.filter(t => t.user_id === profile.id) || [],
          total_spent: totalSpent,
          order_count: orderCount
        };
      });
      
      return usersWithTiers as UserWithTier[];
    },
  });

  const { data: userOrders, isLoading: ordersLoading } = useQuery({
    queryKey: ["user-orders", selectedUser?.id, selectedUser?.email],
    queryFn: async () => {
      if (!selectedUser) return [];
      
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_date, status, total, customer_name, order_items(id, quantity, unit_price, products(name))")
        .or(`profile_id.eq.${selectedUser.id},customer_email.eq.${selectedUser.email}`)
        .order("order_date", { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedUser,
  });

  const { data: userReferrer } = useQuery({
    queryKey: ["user-referrer", selectedUser?.id],
    queryFn: async () => {
      if (!selectedUser) return null;
      const { data, error } = await supabase
        .from("customer_referrals")
        .select("referrer_id, referral_code_used, referred_at, referrers(name, referral_code)")
        .eq("customer_id", selectedUser.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!selectedUser,
  });

  // If this customer is ALSO a referrer (linked_profile_id), load their referrals + commissions
  const { data: customerAsReferrer } = useQuery({
    queryKey: ["customer-as-referrer", selectedUser?.id],
    queryFn: async () => {
      if (!selectedUser) return null;
      const { data: ref } = await supabase
        .from("referrers")
        .select("id, name, referral_code, commission_rate, total_referred, total_revenue, total_commission, status")
        .eq("linked_profile_id", selectedUser.id)
        .maybeSingle();
      if (!ref) return null;

      const [{ data: referrals }, { data: commissions }] = await Promise.all([
        supabase
          .from("customer_referrals")
          .select("id, referred_at, referral_code_used, customer:profiles!customer_referrals_customer_id_fkey(id, full_name, email)")
          .eq("referrer_id", ref.id)
          .order("referred_at", { ascending: false }),
        supabase
          .from("referral_commissions")
          .select("id, commission_amount, order_subtotal, status, created_at")
          .eq("referrer_id", ref.id),
      ]);

      return { referrer: ref, referrals: referrals || [], commissions: commissions || [] };
    },
    enabled: !!selectedUser,
  });

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.full_name) {
      toast({
        title: "Error",
        description: "Name is required",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const emailToUse = formData.email || `${formData.full_name.toLowerCase().replace(/\s+/g, '.')}.${Date.now()}@placeholder.local`;
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: {
          email: emailToUse,
          full_name: formData.full_name,
          phone: formData.phone || null,
          role: "Customer",
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      // If a referrer was selected, create the customer_referral link
      if (formData.referrer_id && data.user?.id) {
        const selectedRef = activeReferrers?.find(r => r.id === formData.referrer_id);
        if (selectedRef) {
          await supabase.from("customer_referrals").insert([{
            customer_id: data.user.id,
            referrer_id: formData.referrer_id,
            referral_code_used: selectedRef.referral_code,
          }]);
          // Update referrer stats
          const { count } = await supabase.from("customer_referrals")
            .select("*", { count: "exact", head: true })
            .eq("referrer_id", formData.referrer_id);
          await supabase.from("referrers").update({ total_referred: count || 0 }).eq("id", formData.referrer_id);
        }
      }

      await logAudit({
        action: "create",
        entityType: "user",
        entityId: data.user?.id ?? null,
        entityLabel: formData.full_name,
        summary: `Created customer ${formData.full_name}${formData.email ? ` (${formData.email})` : ""}${formData.referrer_id ? " with referrer link" : ""}`,
        metadata: {
          email: emailToUse,
          phone: formData.phone || null,
          referrer_id: formData.referrer_id || null,
        },
      });

      toast({
        title: "Success",
        description: "Customer created successfully",
      });

      setIsDialogOpen(false);
      setFormData({ full_name: "", email: "", phone: "", referrer_id: "" });
      queryClient.invalidateQueries({ queryKey: ["users-with-tiers"] });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getTierColor = (tier: string | null | undefined) => {
    switch (tier?.toLowerCase()) {
      case 'gold': return 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400';
      case 'silver': return 'bg-gray-400/20 text-gray-600 dark:text-gray-300';
      case 'bronze': return 'bg-orange-500/20 text-orange-600 dark:text-orange-400';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getTierLabel = (tier: string | null | undefined) => {
    if (!tier || tier === 'none') return 'Standard';
    return tier.charAt(0).toUpperCase() + tier.slice(1);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <UsersIcon className="h-7 w-7 sm:h-8 sm:w-8 text-primary" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Customers</h1>
            <p className="text-sm text-muted-foreground">Manage customer profiles and view order history</p>
          </div>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="min-h-[44px] w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              Add Customer
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Customer</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name *</Label>
                <Input
                  id="full_name"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="John Doe"
                  required
                  className="min-h-[44px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="john@example.com"
                  className="min-h-[44px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+1 234 567 8900"
                  className="min-h-[44px]"
                />
              </div>
              {activeReferrers && activeReferrers.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="referrer">Referred By (optional)</Label>
                  <Select
                    value={formData.referrer_id || "none"}
                    onValueChange={(value) => setFormData({ ...formData, referrer_id: value === "none" ? "" : value })}
                  >
                    <SelectTrigger className="min-h-[44px]">
                      <SelectValue placeholder="No referrer" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No referrer</SelectItem>
                      {activeReferrers.map((ref) => (
                        <SelectItem key={ref.id} value={ref.id}>
                          <div className="flex items-center gap-2">
                            <Share2 className="h-3 w-3" />
                            <span>{ref.name}</span>
                            <span className="text-xs text-muted-foreground">({ref.referral_code})</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} className="min-h-[44px]">
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoading} className="min-h-[44px]">
                  {isLoading ? "Creating..." : "Create Customer"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <CardTitle className="text-lg sm:text-xl">Customer List</CardTitle>
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          {usersLoading ? (
            <div className="space-y-3 p-4 sm:p-0">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : users && users.length > 0 ? (
            (() => {
              const filteredUsers = users.filter(user => 
                user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                user.email.toLowerCase().includes(searchTerm.toLowerCase())
              );
              return filteredUsers.length > 0 ? (
                <div className="space-y-2 p-4 sm:p-0">
                  {filteredUsers.map((user) => {
                    const tier = user.user_tiers?.[0];
                    return (
                      <div
                        key={user.id}
                        className="p-3 sm:p-4 rounded-lg border bg-card cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => setSelectedUser(user)}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{user.full_name}</p>
                            <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                          </div>
                          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                            <div className="text-center hidden sm:block">
                              <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                                <DollarSign className="h-3 w-3" />
                                <span className="text-sm font-medium">{(user.total_spent || 0).toFixed(0)}</span>
                              </div>
                              <p className="text-[10px] text-muted-foreground">{user.order_count || 0} orders</p>
                            </div>
                            <div className="text-center">
                              <div className="flex items-center gap-1">
                                <Star className="h-3 w-3 text-yellow-500" />
                                <span className="text-sm font-medium">{user.loyalty_points || 0}</span>
                              </div>
                            </div>
                            <Badge variant="secondary" className={`text-xs ${getTierColor(tier?.current_tier)}`}>
                              {getTierLabel(tier?.current_tier)}
                            </Badge>
                            <ChevronRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  No customers found matching "{searchTerm}"
                </p>
              );
            })()
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No customers yet.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Customer Details Sheet */}
      <Sheet open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Customer Profile</SheetTitle>
          </SheetHeader>
          
          {selectedUser && (
            <div className="mt-6 space-y-6">
              {/* Customer Info */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-xl font-semibold">{selectedUser.full_name}</h3>
                  <p className="text-muted-foreground">{selectedUser.email}</p>
                  {selectedUser.phone && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                      <Phone className="h-3 w-3" />
                      {selectedUser.phone}
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                    <Calendar className="h-3 w-3" />
                    Member since {format(new Date(selectedUser.created_at), "MMM d, yyyy")}
                  </div>
                  {userReferrer?.referrers && (
                    <div className="flex items-center gap-1.5 mt-2 p-2 rounded-md bg-muted/50 border">
                      <Share2 className="h-3.5 w-3.5 text-primary" />
                      <span className="text-sm">
                        Referred by <span className="font-medium text-foreground">{(userReferrer.referrers as any).name}</span>
                        <span className="text-muted-foreground ml-1">({(userReferrer.referrers as any).referral_code})</span>
                      </span>
                    </div>
                  )}
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-2 gap-3">
                  <Card>
                    <CardContent className="p-4 text-center">
                      <div className="flex items-center justify-center gap-2 mb-1">
                        <DollarSign className="h-5 w-5 text-green-500" />
                        <span className="text-2xl font-bold">${(selectedUser.total_spent || 0).toFixed(0)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Total Spent</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <div className="flex items-center justify-center gap-2 mb-1">
                        <ShoppingBag className="h-5 w-5 text-blue-500" />
                        <span className="text-2xl font-bold">{selectedUser.order_count || 0}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Total Orders</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <div className="flex items-center justify-center gap-2 mb-1">
                        <Star className="h-5 w-5 text-yellow-500" />
                        <span className="text-2xl font-bold">{selectedUser.loyalty_points || 0}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Loyalty Points</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <div className="flex items-center justify-center gap-2 mb-1">
                        <Award className="h-5 w-5 text-primary" />
                        <Badge variant="secondary" className={getTierColor(selectedUser.user_tiers?.[0]?.current_tier)}>
                          {getTierLabel(selectedUser.user_tiers?.[0]?.current_tier)}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {selectedUser.user_tiers?.[0]?.tier_discount_percent 
                          ? `${selectedUser.user_tiers[0].tier_discount_percent}% discount`
                          : 'No discount'
                        }
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {selectedUser.user_tiers?.[0]?.monthly_spend !== undefined && selectedUser.user_tiers[0].monthly_spend > 0 && (
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-sm">
                      <span className="text-muted-foreground">This Month's Spend: </span>
                      <span className="font-semibold">${(selectedUser.user_tiers[0].monthly_spend || 0).toFixed(2)}</span>
                    </p>
                  </div>
                )}
              </div>

              {/* Referrals made by this customer (if they're also a referrer) */}
              {customerAsReferrer?.referrer && (
                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <Share2 className="h-4 w-4 text-primary" />
                    Referrals from {customerAsReferrer.referrer.name}
                    <Badge variant="outline" className="ml-1 text-[10px]">
                      {customerAsReferrer.referrer.referral_code}
                    </Badge>
                  </h4>

                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <Card>
                      <CardContent className="p-3 text-center">
                        <p className="text-lg font-bold">{customerAsReferrer.referrer.total_referred || 0}</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Referred</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3 text-center">
                        <p className="text-lg font-bold">${Number(customerAsReferrer.referrer.total_revenue || 0).toFixed(0)}</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Revenue</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3 text-center">
                        <p className="text-lg font-bold text-primary">${Number(customerAsReferrer.referrer.total_commission || 0).toFixed(2)}</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Commission</p>
                      </CardContent>
                    </Card>
                  </div>

                  {customerAsReferrer.referrals.length > 0 ? (
                    <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                      {customerAsReferrer.referrals.map((r: any) => (
                        <div key={r.id} className="p-2.5 rounded-lg border bg-card flex items-center justify-between">
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{r.customer?.full_name || "Unknown"}</p>
                            <p className="text-xs text-muted-foreground truncate">{r.customer?.email || ""}</p>
                          </div>
                          <p className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                            {format(new Date(r.referred_at), "MMM d, yyyy")}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-3">
                      No referrals yet
                    </p>
                  )}
                </div>
              )}

              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4" />
                  Order History
                </h4>
                
                {ordersLoading ? (
                  <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : userOrders && userOrders.length > 0 ? (
                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                    {userOrders.map((order) => (
                      <div 
                        key={order.id} 
                        className="p-3 rounded-lg border bg-card"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-medium text-sm">
                              #{order.id.slice(0, 8).toUpperCase()}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(order.order_date), "MMM d, yyyy")}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-primary">${order.total.toFixed(2)}</p>
                            <Badge 
                              variant="secondary" 
                              className={
                                order.status === 'Delivered' || order.status === 'Paid' 
                                  ? 'bg-green-500/20 text-green-600' 
                                  : order.status === 'Shipped'
                                    ? 'bg-purple-500/20 text-purple-600'
                                    : 'bg-blue-500/20 text-blue-600'
                              }
                            >
                              {order.status}
                            </Badge>
                          </div>
                        </div>
                        {order.order_items && order.order_items.length > 0 && (
                          <div className="text-xs text-muted-foreground border-t pt-2 mt-2">
                            {order.order_items.slice(0, 3).map((item, idx) => (
                              <span key={item.id}>
                                {item.products?.name} ×{item.quantity}
                                {idx < Math.min(order.order_items!.length, 3) - 1 && ", "}
                              </span>
                            ))}
                            {order.order_items.length > 3 && (
                              <span> +{order.order_items.length - 3} more</span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No orders yet
                  </p>
                )}
              </div>

              <p className="text-xs text-muted-foreground text-center">
                Customer since {format(new Date(selectedUser.created_at), "MMMM yyyy")}
              </p>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
