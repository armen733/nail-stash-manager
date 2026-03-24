import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SalonOrderHistory } from "@/components/salons/SalonOrderHistory";
import { lazy, Suspense } from "react";
const VisitStatusMap = lazy(() => import("@/components/visits/VisitStatusMap"));
import {
  Search, MapPin, AlertTriangle, CheckCircle, Plus,
  Building2, ShoppingCart, ChevronLeft, ChevronRight,
  CalendarDays, Map as MapIcon, Loader2, X,
} from "lucide-react";
import {
  differenceInDays, format, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth,
  isSameDay, addMonths, subMonths, isToday,
} from "date-fns";

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
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "calendar";
  const setActiveTab = (tab: string) => setSearchParams({ tab }, { replace: true });
  const [salons, setSalons] = useState<SalonWithVisit[]>([]);
  const [allVisits, setAllVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "overdue" | "recent">("all");
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [selectedSalonId, setSelectedSalonId] = useState<string | null>(null);
  const [checkinNotes, setCheckinNotes] = useState("");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  // Salon order history
  const [orderHistorySalonId, setOrderHistorySalonId] = useState<string | null>(null);
  const [orderHistorySalonName, setOrderHistorySalonName] = useState("");
  const [orderHistoryOpen, setOrderHistoryOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: salonsData }, { data: visitsData }] = await Promise.all([
        supabase.from("salons").select("id, name, address, city, phone, contact_name").order("name"),
        supabase.from("salon_visits").select("id, salon_id, visit_type, notes, visited_at, order_id").order("visited_at", { ascending: false }),
      ]);

      const salonMap = new Map((salonsData || []).map(s => [s.id, s.name]));
      const enrichedVisits = (visitsData || []).map(v => ({
        ...v,
        salon_name: salonMap.get(v.salon_id) || "Unknown",
      }));
      setAllVisits(enrichedVisits);

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
        return { ...s, last_visit: visit?.last || null, last_visit_type: visit?.type || null, visit_count: visit?.count || 0, days_since_visit: daysSince };
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

  const openSalonProfile = (salon: SalonWithVisit) => {
    // Save scroll position of main container before navigating
    const main = document.querySelector('main');
    if (main) {
      sessionStorage.setItem('visitTracker_scrollY', String(main.scrollTop));
    }
    navigate(`/salons/${salon.id}`);
  };

  // Restore scroll position when data finishes loading
  useEffect(() => {
    if (loading) return;
    const saved = sessionStorage.getItem('visitTracker_scrollY');
    if (saved) {
      const main = document.querySelector('main');
      if (main) {
        requestAnimationFrame(() => {
          main.scrollTop = Number(saved);
        });
      }
      sessionStorage.removeItem('visitTracker_scrollY');
    }
  }, [loading]);

  // Calendar data
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart);
    const calEnd = endOfWeek(monthEnd);
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [currentMonth]);

  const visitsByDate = useMemo(() => {
    const map = new Map<string, Visit[]>();
    for (const v of allVisits) {
      const key = format(new Date(v.visited_at), "yyyy-MM-dd");
      const existing = map.get(key) || [];
      existing.push(v);
      map.set(key, existing);
    }
    return map;
  }, [allVisits]);

  const selectedDateVisits = useMemo(() => {
    if (!selectedDate) return [];
    const key = format(selectedDate, "yyyy-MM-dd");
    return visitsByDate.get(key) || [];
  }, [selectedDate, visitsByDate]);

  // Salon list filtering
  const filteredSalons = useMemo(() => {
    let list = salons;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s => s.name.toLowerCase().includes(q) || s.city?.toLowerCase().includes(q) || s.contact_name?.toLowerCase().includes(q));
    }
    if (filter === "overdue") list = list.filter(s => s.days_since_visit === null || s.days_since_visit >= 7);
    else if (filter === "recent") list = list.filter(s => s.days_since_visit !== null && s.days_since_visit < 7);
    return [...list].sort((a, b) => (b.days_since_visit ?? 999) - (a.days_since_visit ?? 999));
  }, [salons, search, filter]);

  const overdueCount = salons.filter(s => s.days_since_visit === null || s.days_since_visit >= 7).length;
  const visitedThisWeek = salons.filter(s => s.days_since_visit !== null && s.days_since_visit < 7).length;
  const neverVisited = salons.filter(s => s.days_since_visit === null).length;

  const getStatusBadge = (s: SalonWithVisit) => {
    if (s.days_since_visit === null) return <Badge variant="destructive" className="text-xs">Never</Badge>;
    if (s.days_since_visit >= 14) return <Badge variant="destructive" className="text-xs">{s.days_since_visit}d</Badge>;
    if (s.days_since_visit >= 7) return <Badge variant="outline" className="text-xs border-orange-500/50 text-orange-500">{s.days_since_visit}d</Badge>;
    return <Badge variant="outline" className="text-xs border-primary/50 text-primary">{s.days_since_visit}d</Badge>;
  };

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold">Visit Tracker</h1>
        <p className="text-sm text-muted-foreground">Track salon visits & orders</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2 md:gap-3">
        <Card className="bg-card">
          <CardContent className="p-2.5 md:p-4 text-center">
            <Building2 className="h-4 w-4 mx-auto text-muted-foreground" />
            <p className="text-lg md:text-2xl font-bold mt-1">{salons.length}</p>
            <p className="text-[10px] md:text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-2.5 md:p-4 text-center">
            <CheckCircle className="h-4 w-4 mx-auto text-primary" />
            <p className="text-lg md:text-2xl font-bold mt-1 text-primary">{visitedThisWeek}</p>
            <p className="text-[10px] md:text-xs text-muted-foreground">This Week</p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-2.5 md:p-4 text-center">
            <AlertTriangle className="h-4 w-4 mx-auto text-orange-500" />
            <p className="text-lg md:text-2xl font-bold mt-1 text-orange-500">{overdueCount}</p>
            <p className="text-[10px] md:text-xs text-muted-foreground">Overdue</p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-2.5 md:p-4 text-center">
            <AlertTriangle className="h-4 w-4 mx-auto text-destructive" />
            <p className="text-lg md:text-2xl font-bold mt-1 text-destructive">{neverVisited}</p>
            <p className="text-[10px] md:text-xs text-muted-foreground">Never</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="calendar"><CalendarDays className="h-3.5 w-3.5 mr-1.5" />Calendar</TabsTrigger>
          <TabsTrigger value="salons"><Building2 className="h-3.5 w-3.5 mr-1.5" />Salons</TabsTrigger>
          <button
            type="button"
            onClick={() => setMapOpen(true)}
            className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 text-muted-foreground hover:text-foreground"
          >
            <MapIcon className="h-3.5 w-3.5 mr-1.5" />Map
          </button>
        </TabsList>

        {/* ===== CALENDAR TAB ===== */}
        <TabsContent value="calendar" className="mt-3 space-y-3">
          <Card>
            <CardContent className="p-3 md:p-4">
              {/* Month navigation */}
              <div className="flex items-center justify-between mb-3">
                <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(m => subMonths(m, 1))} className="h-8 w-8">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <h2 className="text-sm md:text-base font-semibold">{format(currentMonth, "MMMM yyyy")}</h2>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { setCurrentMonth(new Date()); setSelectedDate(new Date()); }}>
                    Today
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(m => addMonths(m, 1))} className="h-8 w-8">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 mb-1">
                {dayNames.map(d => (
                  <div key={d} className="text-center text-[10px] md:text-xs font-medium text-muted-foreground py-1">{d}</div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7 border-t border-l border-border">
                {calendarDays.map(day => {
                  const key = format(day, "yyyy-MM-dd");
                  const dayVisits = visitsByDate.get(key) || [];
                  const inMonth = isSameMonth(day, currentMonth);
                  const today = isToday(day);
                  const selected = selectedDate && isSameDay(day, selectedDate);
                  const orderVisits = dayVisits.filter(v => v.visit_type === "order");
                  const manualVisits = dayVisits.filter(v => v.visit_type === "manual");

                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedDate(day)}
                      className={cn(
                        "relative border-r border-b border-border p-1 min-h-[52px] md:min-h-[72px] text-left transition-colors hover:bg-accent/50",
                        !inMonth && "bg-muted/30",
                        selected && "bg-accent ring-1 ring-primary",
                      )}
                    >
                      <span className={cn(
                        "text-xs md:text-sm font-medium inline-flex items-center justify-center",
                        !inMonth && "text-muted-foreground/40",
                        today && "bg-primary text-primary-foreground rounded-full w-5 h-5 md:w-6 md:h-6 text-[10px] md:text-xs",
                      )}>
                        {format(day, "d")}
                      </span>
                      {/* Visit dots */}
                      <div className="mt-0.5 space-y-0.5 overflow-hidden">
                        {orderVisits.length > 0 && (
                          <div className="flex items-center gap-0.5 truncate">
                            <ShoppingCart className="h-2.5 w-2.5 text-primary flex-shrink-0" />
                            <span className="text-[9px] md:text-[10px] text-primary truncate">
                              {orderVisits.length === 1 ? orderVisits[0].salon_name : `${orderVisits.length} orders`}
                            </span>
                          </div>
                        )}
                        {manualVisits.length > 0 && (
                          <div className="flex items-center gap-0.5 truncate">
                            <CheckCircle className="h-2.5 w-2.5 text-primary flex-shrink-0" />
                            <span className="text-[9px] md:text-[10px] text-primary truncate">
                              {manualVisits.length === 1 ? manualVisits[0].salon_name : `${manualVisits.length} visits`}
                            </span>
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Selected date detail */}
          {selectedDate && (
            <Card>
              <CardContent className="p-3 md:p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">{format(selectedDate, "EEEE, MMMM d, yyyy")}</h3>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => {
                      setSelectedSalonId(null);
                      setCheckinOpen(true);
                    }}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Visit
                  </Button>
                </div>
                {selectedDateVisits.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">No visits on this day</p>
                ) : (
                  <div className="space-y-2">
                    {selectedDateVisits.map(v => (
                      <div key={v.id} className="flex items-center gap-2.5 p-2 rounded-md bg-muted/50">
                        <div className={cn(
                          "h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0",
                          v.visit_type === "order" ? "bg-primary/10 text-primary" : "bg-accent text-accent-foreground"
                        )}>
                          {v.visit_type === "order" ? <ShoppingCart className="h-3.5 w-3.5" /> : <CheckCircle className="h-3.5 w-3.5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{v.salon_name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {v.visit_type === "order" ? "Order placed" : "Manual visit"}
                            {v.notes && ` — ${v.notes}`}
                          </p>
                        </div>
                        <span className="text-[10px] text-muted-foreground">{format(new Date(v.visited_at), "h:mm a")}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ===== SALONS TAB ===== */}
        <TabsContent value="salons" className="mt-3 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search salons..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="flex gap-1.5">
              <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => setFilter("all")}>
                All
              </Button>
              <Button
                variant={filter === "overdue" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter("overdue")}
              >
                Overdue ({overdueCount})
              </Button>
              <Button
                variant={filter === "recent" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter("recent")}
              >
                OK ({visitedThisWeek})
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : filteredSalons.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-muted-foreground">No salons found</CardContent></Card>
          ) : (
            <div className="space-y-1.5">
              {filteredSalons.map(salon => (
                <Card
                  key={salon.id}
                  className={cn(
                    "cursor-pointer transition-colors hover:bg-accent/30",
                    (salon.days_since_visit === null || salon.days_since_visit >= 7) && "border-destructive/25",
                  )}
                  onClick={() => openSalonProfile(salon)}
                >
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className={cn(
                      "h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold",
                      salon.days_since_visit === null ? "bg-destructive/10 text-destructive" :
                      salon.days_since_visit >= 7 ? "bg-orange-500/10 text-orange-500" :
                      "bg-primary/10 text-primary",
                    )}>
                      {salon.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-sm truncate">{salon.name}</h3>
                        {getStatusBadge(salon)}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                        {salon.city && <span className="flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{salon.city}</span>}
                        {salon.last_visit && (
                          <span>Last: {format(new Date(salon.last_visit), "MMM d")}</span>
                        )}
                        <span>{salon.visit_count} visits</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 flex-shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSalonId(salon.id);
                        setCheckinOpen(true);
                      }}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      <span className="text-xs">Visit</span>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Full-screen Map Dialog */}
        <Dialog open={mapOpen} onOpenChange={setMapOpen}>
          <DialogContent className="max-w-[100vw] w-screen h-screen max-h-screen p-0 border-0 rounded-none [&>button]:hidden">
            <div className="relative w-full h-full">
              <Button
                variant="secondary"
                size="icon"
                className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 z-50 h-10 w-10 rounded-full shadow-lg bg-background/90 backdrop-blur-sm"
                onClick={() => setMapOpen(false)}
              >
                <X className="h-5 w-5" />
              </Button>
              <Suspense fallback={
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              }>
                <VisitStatusMap
                  fullScreen
                  salons={salons.filter(s => s.address).map(s => ({
                    id: s.id,
                    name: s.name,
                    address: s.address!,
                    city: s.city,
                    phone: s.phone,
                    daysSinceVisit: s.days_since_visit,
                  }))}
                />
              </Suspense>
            </div>
          </DialogContent>
        </Dialog>
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
              {selectedSalonId ? (
                <p className="text-sm font-medium mt-1">{salons.find(s => s.id === selectedSalonId)?.name || "—"}</p>
              ) : (
                <select
                  className="w-full mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={selectedSalonId || ""}
                  onChange={e => setSelectedSalonId(e.target.value || null)}
                >
                  <option value="">Select a salon...</option>
                  {salons.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              )}
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

      {/* Salon Order History Dialog */}
      <SalonOrderHistory
        salonId={orderHistorySalonId}
        salonName={orderHistorySalonName}
        open={orderHistoryOpen}
        onOpenChange={setOrderHistoryOpen}
      />

    </div>
  );
}
