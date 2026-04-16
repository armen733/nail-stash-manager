import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Users, DollarSign, TrendingUp, CheckCircle, Clock,
  UserPlus, Copy, Download, Phone, Mail, Calendar, Share2,
} from "lucide-react";
import { downloadCSV } from "@/lib/csv-export";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";

interface Referrer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  referral_code: string;
  commission_rate: number;
  status: string;
  total_referred: number;
  total_revenue: number;
  total_commission: number;
  created_at: string;
}

interface Commission {
  id: string;
  order_id: string;
  customer_id: string;
  order_subtotal: number;
  commission_rate: number;
  commission_amount: number;
  status: string;
  paid_at: string | null;
  created_at: string;
  profiles: { full_name: string; email: string } | null;
}

interface ReferredCustomer {
  id: string;
  customer_id: string;
  referral_code_used: string;
  referred_at: string;
  profiles: { full_name: string; email: string; phone: string | null } | null;
}

const ReferrerProfile = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [referrer, setReferrer] = useState<Referrer | null>(null);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [customers, setCustomers] = useState<ReferredCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [commissionFilter, setCommissionFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");

  useEffect(() => {
    if (id) fetchData();
  }, [id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [refRes, commRes, custRes] = await Promise.all([
        supabase.from("referrers").select("*").eq("id", id!).single(),
        supabase.from("referral_commissions")
          .select("*, profiles(full_name, email)")
          .eq("referrer_id", id!)
          .order("created_at", { ascending: false }),
        supabase.from("customer_referrals")
          .select("*, profiles(full_name, email, phone)")
          .eq("referrer_id", id!)
          .order("referred_at", { ascending: false }),
      ]);

      if (refRes.error) throw refRes.error;
      if (commRes.error) throw commRes.error;
      if (custRes.error) throw custRes.error;

      setReferrer(refRes.data);
      setCommissions(commRes.data || []);
      setCustomers(custRes.data || []);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleMarkPaid = async (commissionId: string) => {
    try {
      const { error } = await supabase.from("referral_commissions")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", commissionId);
      if (error) throw error;
      toast({ title: "Success", description: "Commission marked as paid" });
      fetchData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleMarkAllPaid = async () => {
    try {
      const { error } = await supabase.from("referral_commissions")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("referrer_id", id!)
        .eq("status", "pending");
      if (error) throw error;
      toast({ title: "Success", description: "All pending commissions marked as paid" });
      fetchData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: "Copied!", description: `Code ${code} copied to clipboard` });
  };

  const stats = useMemo(() => {
    const totalRevenue = commissions.reduce((s, c) => s + Number(c.order_subtotal), 0);
    const totalCommission = commissions.reduce((s, c) => s + Number(c.commission_amount), 0);
    const unpaid = commissions.filter(c => c.status === "pending").reduce((s, c) => s + Number(c.commission_amount), 0);
    const paid = commissions.filter(c => c.status === "paid").reduce((s, c) => s + Number(c.commission_amount), 0);
    const orderCount = commissions.length;
    return { totalRevenue, totalCommission, unpaid, paid, orderCount, customerCount: customers.length };
  }, [commissions, customers]);

  // Build unique month options from commission data
  const monthOptions = useMemo(() => {
    const months = new Map<string, string>();
    commissions.forEach(c => {
      const d = new Date(c.created_at);
      const key = format(d, "yyyy-MM");
      if (!months.has(key)) {
        months.set(key, format(d, "MMM yyyy"));
      }
    });
    return Array.from(months.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [commissions]);

  const filteredCommissions = useMemo(() => {
    let filtered = commissions;
    if (commissionFilter !== "all") {
      filtered = filtered.filter(c => c.status === commissionFilter);
    }
    if (dateFilter !== "all") {
      const now = new Date();
      let start: Date, end: Date;
      if (dateFilter === "week") {
        start = startOfWeek(now); end = endOfWeek(now);
      } else if (dateFilter === "month") {
        start = startOfMonth(now); end = endOfMonth(now);
      } else {
        // Specific month filter like "2026-04"
        const [y, m] = dateFilter.split("-").map(Number);
        start = new Date(y, m - 1, 1);
        end = endOfMonth(start);
      }
      filtered = filtered.filter(c => {
        const d = new Date(c.created_at);
        return d >= start && d <= end;
      });
    }
    return filtered;
  }, [commissions, commissionFilter, dateFilter]);

  const exportCommissions = () => {
    const data = filteredCommissions.map(c => ({
      Date: format(new Date(c.created_at), "yyyy-MM-dd"),
      Customer: c.profiles?.full_name || "",
      "Order Subtotal": Number(c.order_subtotal).toFixed(2),
      "Rate %": String(c.commission_rate),
      Commission: Number(c.commission_amount).toFixed(2),
      Status: c.status,
      "Paid At": c.paid_at ? format(new Date(c.paid_at), "yyyy-MM-dd") : "",
    }));
    downloadCSV(data, `${referrer?.name || "referrer"}-commissions`);
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!referrer) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Referrer not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/referrals")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Referrals
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/referrals")} className="mt-1 shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold truncate">{referrer.name}</h1>
            <Badge variant={referrer.status === "active" ? "default" : "secondary"}>
              {referrer.status}
            </Badge>
          </div>
          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
            <button onClick={() => copyCode(referrer.referral_code)} className="flex items-center gap-1 font-mono bg-muted px-2 py-0.5 rounded hover:bg-muted/80">
              <Share2 className="h-3 w-3" /> {referrer.referral_code} <Copy className="h-3 w-3" />
            </button>
            {referrer.phone && (
              <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {referrer.phone}</span>
            )}
            {referrer.email && (
              <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {referrer.email}</span>
            )}
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Since {format(new Date(referrer.created_at), "MMM d, yyyy")}
            </span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <UserPlus className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-lg font-bold">{stats.customerCount}</p>
            <p className="text-xs text-muted-foreground">Customers</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <TrendingUp className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-lg font-bold">{stats.orderCount}</p>
            <p className="text-xs text-muted-foreground">Orders</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <DollarSign className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-lg font-bold">${stats.totalRevenue.toFixed(0)}</p>
            <p className="text-xs text-muted-foreground">Revenue</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <DollarSign className="h-5 w-5 mx-auto text-accent-foreground mb-1" />
            <p className="text-lg font-bold">${stats.totalCommission.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Total Commission</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Clock className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-lg font-bold">${stats.unpaid.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Unpaid</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <CheckCircle className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-lg font-bold">${stats.paid.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Paid Out</p>
          </CardContent>
        </Card>
      </div>

      {/* Referred Customers */}
      <Card>
        <CardHeader className="p-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" /> Referred Customers ({customers.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden sm:table-cell">Email</TableHead>
                  <TableHead className="hidden md:table-cell">Phone</TableHead>
                  <TableHead>Code Used</TableHead>
                  <TableHead className="hidden sm:table-cell">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                      No referred customers yet
                    </TableCell>
                  </TableRow>
                ) : customers.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.profiles?.full_name || "Unknown"}</TableCell>
                    <TableCell className="hidden sm:table-cell">{c.profiles?.email || "—"}</TableCell>
                    <TableCell className="hidden md:table-cell">{c.profiles?.phone || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{c.referral_code_used}</TableCell>
                    <TableCell className="hidden sm:table-cell">{format(new Date(c.referred_at), "MMM d, yyyy")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Commissions */}
      <Card>
        <CardHeader className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <DollarSign className="h-5 w-5" /> Commissions ({filteredCommissions.length})
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={commissionFilter} onValueChange={setCommissionFilter}>
                <SelectTrigger className="w-[110px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                </SelectContent>
              </Select>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="w-[140px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  {monthOptions.map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={exportCommissions}>
                <Download className="h-4 w-4 mr-1" /> CSV
              </Button>
              {stats.unpaid > 0 && (
                <Button size="sm" onClick={handleMarkAllPaid}>
                  <CheckCircle className="h-4 w-4 mr-1" /> Pay All (${stats.unpaid.toFixed(2)})
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
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
                    <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                      No commissions found
                    </TableCell>
                  </TableRow>
                ) : filteredCommissions.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-sm">{format(new Date(c.created_at), "MMM d")}</TableCell>
                    <TableCell className="font-medium">{c.profiles?.full_name || "—"}</TableCell>
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
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ReferrerProfile;
