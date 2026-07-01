import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Search, Plus, Users, DollarSign, TrendingUp, Download, Edit, Trash2,
  CheckCircle, Clock, UserPlus, Copy, RefreshCw, Banknote, Printer,
} from "lucide-react";
import { downloadCSV } from "@/lib/csv-export";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { PayoutsTab } from "@/components/referrals/PayoutsTab";
import { printAffiliateInvitation } from "@/lib/affiliate-invitation-print";
import { printSalonInvitation } from "@/lib/salon-invitation-print";
import { printSupplyInvitation } from "@/lib/supply-invitation-print";
import { printSamplePricingSheet } from "@/lib/sample-pricing-sheet-print";

interface Referrer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  referral_code: string;
  commission_rate: number;
  status: string;
  linked_profile_id: string | null;
  total_referred: number;
  total_revenue: number;
  total_commission: number;
  created_at: string;
}

interface CustomerReferral {
  id: string;
  customer_id: string;
  referrer_id: string;
  referral_code_used: string;
  referred_at: string;
  profiles: { full_name: string; email: string; phone: string | null } | null;
  referrers: { name: string; referral_code: string } | null;
}

interface Commission {
  id: string;
  order_id: string;
  referrer_id: string;
  customer_id: string;
  order_subtotal: number;
  commission_rate: number;
  commission_amount: number;
  status: string;
  paid_at: string | null;
  created_at: string;
  referrers: { name: string; referral_code: string } | null;
  profiles: { full_name: string; email: string } | null;
}

const generateCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "REF-";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
};

const Referrals = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [referrers, setReferrers] = useState<Referrer[]>([]);
  const [customerReferrals, setCustomerReferrals] = useState<CustomerReferral[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingReferrer, setEditingReferrer] = useState<Referrer | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [commissionFilter, setCommissionFilter] = useState("all");
  const [commissionDateFilter, setCommissionDateFilter] = useState("all");

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    referral_code: generateCode(),
    commission_rate: "10",
    status: "active",
  });

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [refRes, custRes, commRes] = await Promise.all([
        supabase.from("referrers").select("*").order("created_at", { ascending: false }),
        supabase.from("customer_referrals").select("*, profiles(full_name, email, phone), referrers(name, referral_code)").order("referred_at", { ascending: false }),
        supabase.from("referral_commissions").select("*, referrers(name, referral_code), profiles(full_name, email)").order("created_at", { ascending: false }),
      ]);

      if (refRes.error) throw refRes.error;
      if (custRes.error) throw custRes.error;
      if (commRes.error) throw commRes.error;

      setReferrers(refRes.data || []);
      setCustomerReferrals(custRes.data || []);
      setCommissions(commRes.data || []);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveReferrer = async () => {
    if (!formData.name || !formData.referral_code) {
      toast({ title: "Error", description: "Name and referral code are required", variant: "destructive" });
      return;
    }

    try {
      const payload = {
        name: formData.name,
        phone: formData.phone || null,
        email: formData.email || null,
        referral_code: formData.referral_code.toUpperCase(),
        commission_rate: parseFloat(formData.commission_rate) || 10,
        status: formData.status,
      };

      if (editingReferrer) {
        const { error } = await supabase.from("referrers").update(payload).eq("id", editingReferrer.id);
        if (error) throw error;
        toast({ title: "Success", description: "Referrer updated" });
      } else {
        const { error } = await supabase.from("referrers").insert([payload]);
        if (error) throw error;
        toast({ title: "Success", description: "Referrer created" });
      }

      setIsDialogOpen(false);
      setEditingReferrer(null);
      resetForm();
      fetchAll();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleDeleteReferrer = async () => {
    if (!deleteId) return;
    try {
      const { error } = await supabase.from("referrers").delete().eq("id", deleteId);
      if (error) throw error;
      toast({ title: "Success", description: "Referrer deleted" });
      setDeleteId(null);
      fetchAll();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setDeleteId(null);
    }
  };

  const handleMarkPaid = async (commissionId: string) => {
    try {
      const { error } = await supabase.from("referral_commissions")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", commissionId);
      if (error) throw error;

      // Update referrer cached total
      const commission = commissions.find(c => c.id === commissionId);
      if (commission) {
        // Recalculate totals
        await recalcReferrerStats(commission.referrer_id);
      }

      toast({ title: "Success", description: "Commission marked as paid" });
      fetchAll();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleBulkMarkPaid = async (referrerId: string) => {
    try {
      const { error } = await supabase.from("referral_commissions")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("referrer_id", referrerId)
        .eq("status", "pending");
      if (error) throw error;
      await recalcReferrerStats(referrerId);
      toast({ title: "Success", description: "All pending commissions marked as paid" });
      fetchAll();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const recalcReferrerStats = async (referrerId: string) => {
    // Recalculate from commissions table
    const { data: comms } = await supabase.from("referral_commissions")
      .select("order_subtotal, commission_amount")
      .eq("referrer_id", referrerId);
    
    const { count: refCount } = await supabase.from("customer_referrals")
      .select("*", { count: "exact", head: true })
      .eq("referrer_id", referrerId);

    const totalRevenue = comms?.reduce((s, c) => s + Number(c.order_subtotal), 0) || 0;
    const totalCommission = comms?.reduce((s, c) => s + Number(c.commission_amount), 0) || 0;

    await supabase.from("referrers").update({
      total_referred: refCount || 0,
      total_revenue: totalRevenue,
      total_commission: totalCommission,
    }).eq("id", referrerId);
  };

  const resetForm = () => {
    setFormData({
      name: "", phone: "", email: "",
      referral_code: generateCode(),
      commission_rate: "10", status: "active",
    });
  };

  const openEditDialog = (ref: Referrer) => {
    setEditingReferrer(ref);
    setFormData({
      name: ref.name,
      phone: ref.phone || "",
      email: ref.email || "",
      referral_code: ref.referral_code,
      commission_rate: String(ref.commission_rate),
      status: ref.status,
    });
    setIsDialogOpen(true);
  };

  const openCreateDialog = () => {
    setEditingReferrer(null);
    resetForm();
    setIsDialogOpen(true);
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: "Copied!", description: `Code ${code} copied to clipboard` });
  };

  // Dashboard stats
  const stats = useMemo(() => {
    const totalReferrers = referrers.filter(r => r.status === "active").length;
    const totalCustomersReferred = customerReferrals.length;
    const totalRevenue = commissions.reduce((s, c) => s + Number(c.order_subtotal), 0);
    const totalCommission = commissions.reduce((s, c) => s + Number(c.commission_amount), 0);
    const unpaidCommission = commissions.filter(c => c.status === "pending").reduce((s, c) => s + Number(c.commission_amount), 0);
    const paidCommission = commissions.filter(c => c.status === "paid").reduce((s, c) => s + Number(c.commission_amount), 0);
    return { totalReferrers, totalCustomersReferred, totalRevenue, totalCommission, unpaidCommission, paidCommission };
  }, [referrers, customerReferrals, commissions]);

  // Filtered data
  const filteredReferrers = useMemo(() =>
    referrers.filter(r => r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.referral_code.toLowerCase().includes(search.toLowerCase())),
    [referrers, search]
  );

  const filteredCommissions = useMemo(() => {
    let filtered = commissions;
    if (commissionFilter !== "all") {
      filtered = filtered.filter(c => c.status === commissionFilter);
    }
    if (commissionDateFilter !== "all") {
      const now = new Date();
      let start: Date, end: Date;
      if (commissionDateFilter === "week") {
        start = startOfWeek(now); end = endOfWeek(now);
      } else {
        start = startOfMonth(now); end = endOfMonth(now);
      }
      filtered = filtered.filter(c => {
        const d = new Date(c.created_at);
        return d >= start && d <= end;
      });
    }
    return filtered;
  }, [commissions, commissionFilter, commissionDateFilter]);

  const exportCommissions = () => {
    const data = filteredCommissions.map(c => ({
      Date: format(new Date(c.created_at), "yyyy-MM-dd"),
      Referrer: c.referrers?.name || "",
      Customer: c.profiles?.full_name || "",
      "Order Subtotal": Number(c.order_subtotal).toFixed(2),
      "Rate %": String(c.commission_rate),
      Commission: Number(c.commission_amount).toFixed(2),
      Status: c.status,
      "Paid At": c.paid_at ? format(new Date(c.paid_at), "yyyy-MM-dd") : "",
    }));
    downloadCSV(data, `referral-commissions`);
  };

  const exportReferrers = () => {
    const data = referrers.map(r => ({
      Name: r.name, Phone: r.phone || "", Email: r.email || "", Code: r.referral_code,
      "Commission Rate": String(r.commission_rate) + "%", Status: r.status,
      "Referred Customers": String(r.total_referred),
      "Total Revenue": Number(r.total_revenue).toFixed(2),
      "Total Commission": Number(r.total_commission).toFixed(2),
    }));
    downloadCSV(data, `referrers`);
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold">Referrals & Affiliates</h1>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-2">
          <Button variant="outline" size="sm" className="w-full sm:w-auto justify-center" onClick={() => printSupplyInvitation()}>
            <Printer className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Print Supply Invitation</span>
            <span className="sm:hidden">Supply Invite</span>
          </Button>
          <Button variant="outline" size="sm" className="w-full sm:w-auto justify-center" onClick={() => printSamplePricingSheet()}>
            <Printer className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Print Sample Pricing Sheet</span>
            <span className="sm:hidden">Sample Pricing</span>
          </Button>
          <Button variant="outline" size="sm" className="w-full sm:w-auto justify-center" onClick={() => printSalonInvitation()}>
            <Printer className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Print Salon Invitation</span>
            <span className="sm:hidden">Salon Invite</span>
          </Button>
          <Button variant="outline" size="sm" className="w-full sm:w-auto justify-center" onClick={() => printAffiliateInvitation()}>
            <Printer className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Print Affiliate Invitation</span>
            <span className="sm:hidden">Affiliate Invite</span>
          </Button>
          <Button onClick={openCreateDialog} size="sm" className="w-full sm:w-auto justify-center">
            <Plus className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Add Referrer</span>
            <span className="sm:hidden">Add Referrer</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
        <Card className="min-w-0">
          <CardContent className="p-2 sm:p-3 text-center">
            <Users className="h-4 w-4 sm:h-5 sm:w-5 mx-auto text-primary mb-1" />
            <p className="text-base sm:text-lg font-bold truncate">{stats.totalReferrers}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Active Referrers</p>
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardContent className="p-2 sm:p-3 text-center">
            <UserPlus className="h-4 w-4 sm:h-5 sm:w-5 mx-auto text-primary mb-1" />
            <p className="text-base sm:text-lg font-bold truncate">{stats.totalCustomersReferred}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Referred Customers</p>
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardContent className="p-2 sm:p-3 text-center">
            <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 mx-auto text-primary mb-1" />
            <p className="text-base sm:text-lg font-bold truncate">${stats.totalRevenue.toFixed(0)}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Revenue Generated</p>
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardContent className="p-2 sm:p-3 text-center">
            <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 mx-auto text-accent-foreground mb-1" />
            <p className="text-base sm:text-lg font-bold truncate">${stats.totalCommission.toFixed(2)}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Total Commission</p>
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardContent className="p-2 sm:p-3 text-center">
            <Clock className="h-4 w-4 sm:h-5 sm:w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-base sm:text-lg font-bold truncate">${stats.unpaidCommission.toFixed(2)}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Unpaid</p>
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardContent className="p-2 sm:p-3 text-center">
            <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 mx-auto text-primary mb-1" />
            <p className="text-base sm:text-lg font-bold truncate">${stats.paidCommission.toFixed(2)}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Paid Out</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="referrers">
        <div className="overflow-x-auto -mx-1 px-1">
          <TabsList className="inline-flex w-auto min-w-full md:w-auto md:min-w-0">
            <TabsTrigger value="referrers" className="whitespace-nowrap">Referrers</TabsTrigger>
            <TabsTrigger value="customers" className="whitespace-nowrap">Referred Customers</TabsTrigger>
            <TabsTrigger value="commissions" className="whitespace-nowrap">Commissions</TabsTrigger>
            <TabsTrigger value="payouts" className="whitespace-nowrap">
              <Banknote className="h-3.5 w-3.5 mr-1" /> Payouts
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="payouts" className="space-y-4">
          <PayoutsTab
            commissions={commissions}
            referrers={referrers}
            onAfterPayout={fetchAll}
          />
        </TabsContent>

        {/* REFERRERS TAB */}
        <TabsContent value="referrers" className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search referrers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button variant="outline" size="sm" onClick={exportReferrers}>
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead className="hidden md:table-cell">Phone</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">Referred</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">Revenue</TableHead>
                  <TableHead className="text-right hidden md:table-cell">Commission</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReferrers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      No referrers found. Create your first referrer!
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredReferrers.map((ref) => (
                    <TableRow key={ref.id}>
                      <TableCell className="font-medium">
                        <button onClick={() => navigate(`/referrals/${ref.id}`)} className="text-primary hover:underline text-left">
                          {ref.name}
                        </button>
                      </TableCell>
                      <TableCell>
                        <button onClick={() => copyCode(ref.referral_code)} className="flex items-center gap-1 text-xs font-mono bg-muted px-2 py-1 rounded hover:bg-muted/80">
                          {ref.referral_code} <Copy className="h-3 w-3" />
                        </button>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{ref.phone || "—"}</TableCell>
                      <TableCell className="text-right">{ref.commission_rate}%</TableCell>
                      <TableCell className="text-right hidden sm:table-cell">{ref.total_referred}</TableCell>
                      <TableCell className="text-right hidden sm:table-cell">${Number(ref.total_revenue).toFixed(0)}</TableCell>
                      <TableCell className="text-right hidden md:table-cell">${Number(ref.total_commission).toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant={ref.status === "active" ? "default" : "secondary"}>
                          {ref.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Print affiliate invitation"
                            onClick={() => printAffiliateInvitation({
                              referrerName: ref.name,
                              referralCode: ref.referral_code,
                              commissionRate: Number(ref.commission_rate),
                            })}
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(ref)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleBulkMarkPaid(ref.id)}>
                            <CheckCircle className="h-4 w-4 text-primary" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(ref.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* REFERRED CUSTOMERS TAB */}
        <TabsContent value="customers" className="space-y-4">
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead className="hidden sm:table-cell">Email</TableHead>
                  <TableHead>Referred By</TableHead>
                  <TableHead>Code Used</TableHead>
                  <TableHead className="hidden md:table-cell">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customerReferrals.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No referred customers yet
                    </TableCell>
                  </TableRow>
                ) : (
                  customerReferrals.map((cr) => (
                    <TableRow key={cr.id}>
                      <TableCell className="font-medium">{cr.profiles?.full_name || "Unknown"}</TableCell>
                      <TableCell className="hidden sm:table-cell">{cr.profiles?.email || "—"}</TableCell>
                      <TableCell>{cr.referrers?.name || "Unknown"}</TableCell>
                      <TableCell className="font-mono text-xs">{cr.referral_code_used}</TableCell>
                      <TableCell className="hidden md:table-cell">{format(new Date(cr.referred_at), "MMM d, yyyy")}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* COMMISSIONS TAB */}
        <TabsContent value="commissions" className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={commissionFilter} onValueChange={setCommissionFilter}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
            <Select value={commissionDateFilter} onValueChange={setCommissionDateFilter}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportCommissions}>
              <Download className="h-4 w-4 mr-1" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={fetchAll}>
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Referrer</TableHead>
                  <TableHead className="hidden sm:table-cell">Customer</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">Rate</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCommissions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No commissions found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCommissions.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-sm">{format(new Date(c.created_at), "MMM d")}</TableCell>
                      <TableCell className="font-medium">{c.referrers?.name || "—"}</TableCell>
                      <TableCell className="hidden sm:table-cell">{c.profiles?.full_name || "—"}</TableCell>
                      <TableCell className="text-right">${Number(c.order_subtotal).toFixed(2)}</TableCell>
                      <TableCell className="text-right hidden sm:table-cell">{c.commission_rate}%</TableCell>
                      <TableCell className="text-right font-medium">${Number(c.commission_amount).toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant={c.status === "paid" ? "default" : "secondary"}>
                          {c.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {c.status === "pending" && (
                          <Button variant="ghost" size="sm" onClick={() => handleMarkPaid(c.id)}>
                            <CheckCircle className="h-4 w-4 text-primary mr-1" /> Pay
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Referrer Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) { setEditingReferrer(null); resetForm(); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingReferrer ? "Edit Referrer" : "Add Referrer"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Full name" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="+1 555-000-0000" />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="email@example.com" />
            </div>
            <div>
              <Label>Referral Code *</Label>
              <div className="flex gap-2">
                <Input value={formData.referral_code} onChange={(e) => setFormData({ ...formData, referral_code: e.target.value.toUpperCase() })} placeholder="REF-XXXXX" className="font-mono" />
                <Button variant="outline" size="icon" onClick={() => setFormData({ ...formData, referral_code: generateCode() })}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <Label>Commission Rate (%)</Label>
              <Input type="number" value={formData.commission_rate} onChange={(e) => setFormData({ ...formData, commission_rate: e.target.value })} min="0" max="100" step="0.5" />
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch checked={formData.status === "active"} onCheckedChange={(checked) => setFormData({ ...formData, status: checked ? "active" : "inactive" })} />
            </div>
            <Button onClick={handleSaveReferrer} className="w-full">
              {editingReferrer ? "Update Referrer" : "Create Referrer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Referrer?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the referrer and all associated commission records. Customer referral links will also be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteReferrer} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Referrals;
