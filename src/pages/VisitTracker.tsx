import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Search, MapPin, Clock, AlertTriangle, CheckCircle, Plus, CalendarDays, Building2, ShoppingCart, Eye } from "lucide-react";
import { formatDistanceToNow, differenceInDays, format } from "date-fns";

type SalonWithVisit = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  contact_name: string | null;
  last_visit: string | null;
  last_visit_type: string | null;
  visit_count: number;
  days_since_visit: number | null;
};

type Visit = {
  id: string;
  salon_id: string;
  visit_type: string;
  notes: string | null;
  visited_at: string;
  order_id: string | null;
  salon_name?: string;
};

export default function VisitTracker() {
  const [salons, setSalons] = useState<SalonWithVisit[]>([]);
  const [recentVisits, setRecentVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "overdue" | "recent">("all");
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [selectedSalonId, setSelectedSalonId] = useState<string | null>(null);
  const [checkinNotes, setCheckinNotes] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySalonId, setHistorySalonId] = useState<string | null>(null);
  const [salonHistory, setSalonHistory] = useState<Visit[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all salons
      const { data: salonsData } = await supabase
        .from("salons")
        .select("id, name, address, city, phone, contact_name")
        .order("name");

      // Fetch all visits
      const { data: visitsData } = await supabase
        .from("salon_visits")
        .select("id, salon_id, visit_type, notes, visited_at, order_id")
        .order("visited_at", { ascending: false });

      // Fetch recent visits with salon names (last 50)
      const recentRaw = (visitsData || []).slice(0, 50);
      const salonMap = new Map((salonsData || []).map(s => [s.id, s.name]));
      const enrichedRecent = recentRaw.map(v => ({
        ...v,
        salon_name: salonMap.get(v.salon_id) || "Unknown",
      }));
      setRecentVisits(enrichedRecent);

      // Build salon visit summary
      const visitsBySalon = new Map<string, { last: string; type: string; count: number }>();
      for (const v of visitsData || []) {
        const existing = visitsBySalon.get(v.salon_id);
        if (!existing) {
          visitsBySalon.set(v.salon_id, { last: v.visited_at, type: v.visit_type, count: 1 });
        } else {
          existing.count++;
          if (new Date(v.visited_at) > new Date(existing.last)) {
            existing.last = v.visited_at;
            existing.type = v.visit_type;
          }
        }
      }

      const enrichedSalons: SalonWithVisit[] = (salonsData || []).map(s => {
        const visit = visitsBySalon.get(s.id);
        const daysSince = visit ? differenceInDays(new Date(), new Date(visit.last)) : null;
        return {
          ...s,
          last_visit: visit?.last || null,
          last_visit_type: visit?.type || null,
          visit_count: visit?.count || 0,
          days_since_visit: daysSince,
        };
      });

      setSalons(enrichedSalons);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load visit data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCheckin = async () => {
    if (!selectedSalonId) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("salon_visits").insert({
      salon_id: selectedSalonId,
      visited_by: user?.id || null,
      visit_type: "manual",
      notes: checkinNotes || null,
    });
    if (error) {
      toast.error("Failed to check in");
    } else {
      toast.success("Checked in successfully!");
      setCheckinOpen(false);
      setCheckinNotes("");
      setSelectedSalonId(null);
      fetchData();
    }
  };

  const openHistory = async (salonId: string) => {
    setHistorySalonId(salonId);
    setHistoryOpen(true);
    const { data } = await supabase
      .from("salon_visits")
      .select("id, salon_id, visit_type, notes, visited_at, order_id")
      .eq("salon_id", salonId)
      .order("visited_at", { ascending: false })
      .limit(50);
    setSalonHistory(data || []);
  };

  const filteredSalons = useMemo(() => {
    let list = salons;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.city?.toLowerCase().includes(q) ||
        s.contact_name?.toLowerCase().includes(q)
      );
    }
    if (filter === "overdue") {
      list = list.filter(s => s.days_since_visit === null || s.days_since_visit >= 7);
    } else if (filter === "recent") {
      list = list.filter(s => s.days_since_visit !== null && s.days_since_visit < 7);
    }
    // Sort: overdue first, then by days since visit desc
    list = [...list].sort((a, b) => {
      const aDays = a.days_since_visit ?? 999;
      const bDays = b.days_since_visit ?? 999;
      return bDays - aDays;
    });
    return list;
  }, [salons, search, filter]);

  const overdueCount = salons.filter(s => s.days_since_visit === null || s.days_since_visit >= 7).length;
  const visitedThisWeek = salons.filter(s => s.days_since_visit !== null && s.days_since_visit < 7).length;
  const neverVisited = salons.filter(s => s.days_since_visit === null).length;
  const historySalon = salons.find(s => s.id === historySalonId);

  const getStatusBadge = (s: SalonWithVisit) => {
    if (s.days_since_visit === null) {
      return <Badge variant="destructive" className="text-xs">Never visited</Badge>;
    }
    if (s.days_since_visit >= 14) {
      return <Badge variant="destructive" className="text-xs">{s.days_since_visit}d ago</Badge>;
    }
    if (s.days_since_visit >= 7) {
      return <Badge variant="secondary" className="text-xs bg-orange-500/20 text-orange-600 dark:text-orange-400">{s.days_since_visit}d ago</Badge>;
    }
    return <Badge variant="secondary" className="text-xs bg-green-500/20 text-green-600 dark:text-green-400">{s.days_since_visit}d ago</Badge>;
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Visit Tracker</h1>
          <p className="text-sm text-muted-foreground">Track and manage salon visits</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Total Salons</span>
            </div>
            <p className="text-xl md:text-2xl font-bold mt-1">{salons.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-xs text-muted-foreground">Visited This Week</span>
            </div>
            <p className="text-xl md:text-2xl font-bold mt-1 text-green-600 dark:text-green-400">{visitedThisWeek}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              <span className="text-xs text-muted-foreground">Overdue (7d+)</span>
            </div>
            <p className="text-xl md:text-2xl font-bold mt-1 text-orange-600 dark:text-orange-400">{overdueCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-red-500" />
              <span className="text-xs text-muted-foreground">Never Visited</span>
            </div>
            <p className="text-xl md:text-2xl font-bold mt-1 text-red-600 dark:text-red-400">{neverVisited}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="salons">
        <TabsList>
          <TabsTrigger value="salons">Salons</TabsTrigger>
          <TabsTrigger value="timeline">Recent Visits</TabsTrigger>
        </TabsList>

        <TabsContent value="salons" className="space-y-3 mt-3">
          {/* Search & filter */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search salons..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={filter === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter("all")}
              >
                All ({salons.length})
              </Button>
              <Button
                variant={filter === "overdue" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter("overdue")}
                className={filter !== "overdue" ? "border-orange-500/50 text-orange-600 dark:text-orange-400" : ""}
              >
                Overdue ({overdueCount})
              </Button>
              <Button
                variant={filter === "recent" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter("recent")}
                className={filter !== "recent" ? "border-green-500/50 text-green-600 dark:text-green-400" : ""}
              >
                Recent ({visitedThisWeek})
              </Button>
            </div>
          </div>

          {/* Salon list */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : filteredSalons.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No salons found
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredSalons.map(salon => (
                <Card key={salon.id} className={cn(
                  "transition-colors",
                  (salon.days_since_visit === null || salon.days_since_visit >= 7) && "border-orange-500/30"
                )}>
                  <CardContent className="p-3 md:p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm md:text-base truncate">{salon.name}</h3>
                          {getStatusBadge(salon)}
                          {salon.visit_count > 0 && (
                            <span className="text-xs text-muted-foreground">({salon.visit_count} visits)</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          {salon.city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{salon.city}</span>}
                          {salon.last_visit && (
                            <span className="flex items-center gap-1">
                              {salon.last_visit_type === "order" ? <ShoppingCart className="h-3 w-3" /> : <CheckCircle className="h-3 w-3" />}
                              {format(new Date(salon.last_visit), "MMM d, yyyy")}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openHistory(salon.id)}
                          className="h-8 px-2"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            setSelectedSalonId(salon.id);
                            setCheckinOpen(true);
                          }}
                          className="h-8 px-3"
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Check in
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="timeline" className="space-y-3 mt-3">
          {recentVisits.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No visits recorded yet
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {recentVisits.map(visit => (
                <Card key={visit.id}>
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0",
                      visit.visit_type === "order" ? "bg-primary/10 text-primary" : "bg-green-500/10 text-green-600 dark:text-green-400"
                    )}>
                      {visit.visit_type === "order" ? <ShoppingCart className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{visit.salon_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {visit.visit_type === "order" ? "Order placed" : "Manual visit"}
                        {visit.notes && ` — ${visit.notes}`}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(visit.visited_at), { addSuffix: true })}
                    </span>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Check-in Dialog */}
      <Dialog open={checkinOpen} onOpenChange={setCheckinOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Check In Visit</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Salon</Label>
              <p className="text-sm font-medium mt-1">
                {salons.find(s => s.id === selectedSalonId)?.name || "—"}
              </p>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="e.g. Dropped off samples, discussed new products..."
                value={checkinNotes}
                onChange={e => setCheckinNotes(e.target.value)}
                className="mt-1"
              />
            </div>
            <Button onClick={handleCheckin} className="w-full">
              <CheckCircle className="h-4 w-4 mr-2" />
              Confirm Check-in
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Visit History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{historySalon?.name} — Visit History</DialogTitle>
          </DialogHeader>
          {salonHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No visits recorded</p>
          ) : (
            <div className="max-h-[400px] overflow-y-auto space-y-2">
              {salonHistory.map(v => (
                <div key={v.id} className="flex items-start gap-3 p-2 rounded-md bg-muted/50">
                  <div className={cn(
                    "h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",
                    v.visit_type === "order" ? "bg-primary/10 text-primary" : "bg-green-500/10 text-green-600"
                  )}>
                    {v.visit_type === "order" ? <ShoppingCart className="h-3.5 w-3.5" /> : <CheckCircle className="h-3.5 w-3.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {v.visit_type === "order" ? "Order visit" : "Manual visit"}
                    </p>
                    {v.notes && <p className="text-xs text-muted-foreground">{v.notes}</p>}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(v.visited_at), "MMM d, yyyy 'at' h:mm a")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
