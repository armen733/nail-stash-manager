import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MapPin, ChevronUp, ChevronDown } from "lucide-react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

interface AnalyticsMapProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dateRange?: { from: Date; to: Date };
}

interface GeocodedOrder {
  id: string;
  address: string;
  total: number;
  lat: number;
  lng: number;
}

const AnalyticsMap = ({ open, onOpenChange, dateRange }: AnalyticsMapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const mapInitialized = useRef(false);
  const [loading, setLoading] = useState(true);
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [geocodedOrders, setGeocodedOrders] = useState<GeocodedOrder[]>([]);
  const [showStats, setShowStats] = useState(true);
  const { toast } = useToast();

  // Fetch mapbox token
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("get-mapbox-token");
        if (error) throw error;
        setMapboxToken(data.token);
      } catch (error: any) {
        console.error("Failed to fetch Mapbox token:", error);
      }
    };
    fetchToken();
  }, []);

  // Fetch and geocode orders when dialog opens
  useEffect(() => {
    if (!open || !mapboxToken) return;

    const fetchOrders = async () => {
      setLoading(true);
      try {
        let query = supabase
          .from("orders")
          .select("id, customer_address, total, created_at")
          .not("customer_address", "is", null)
          .in("status", ["Confirmed", "Shipped", "Delivered", "Paid"]);

        if (dateRange?.from) {
          query = query.gte("created_at", dateRange.from.toISOString());
        }
        if (dateRange?.to) {
          query = query.lte("created_at", dateRange.to.toISOString());
        }

        const { data: orders, error } = await query;

        if (error) throw error;

        // Geocode orders
        const geocoded: GeocodedOrder[] = [];
        const geocodeCache: Record<string, { lat: number; lng: number }> = {};

        for (const order of orders || []) {
          if (!order.customer_address) continue;

          const address = order.customer_address.trim().toLowerCase();

          if (geocodeCache[address]) {
            geocoded.push({
              id: order.id,
              address: order.customer_address,
              total: order.total || 0,
              ...geocodeCache[address],
            });
            continue;
          }

          try {
            const response = await fetch(
              `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
                order.customer_address
              )}.json?access_token=${mapboxToken}&limit=1`
            );
            const data = await response.json();

            if (data.features && data.features.length > 0) {
              const [lng, lat] = data.features[0].center;
              geocodeCache[address] = { lat, lng };
              geocoded.push({
                id: order.id,
                address: order.customer_address,
                total: order.total || 0,
                lat,
                lng,
              });
            }
          } catch (error) {
            console.error("Geocoding error:", error);
          }
        }

        setGeocodedOrders(geocoded);
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

    fetchOrders();
  }, [open, mapboxToken, dateRange, toast]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || !mapboxToken || !open || loading) return;
    if (map.current || mapInitialized.current) return;

    mapInitialized.current = true;
    mapboxgl.accessToken = mapboxToken;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-98.5795, 39.8283], // Center of USA
      zoom: 3,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.current.on("load", () => {
      if (!map.current || geocodedOrders.length === 0) return;

      // Add heatmap source
      map.current.addSource("orders-heat", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: geocodedOrders.map((order) => ({
            type: "Feature" as const,
            properties: {
              total: order.total,
            },
            geometry: {
              type: "Point" as const,
              coordinates: [order.lng, order.lat],
            },
          })),
        },
      });

      // Add heatmap layer with blue color scheme
      map.current.addLayer({
        id: "orders-heatmap",
        type: "heatmap",
        source: "orders-heat",
        paint: {
          // Increase weight based on order density
          "heatmap-weight": 1,
          // Increase intensity as zoom level increases
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 1, 15, 3],
          // Color gradient from transparent to sky blue
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0, "rgba(147, 197, 253, 0)",      // transparent
            0.1, "rgba(147, 197, 253, 0.2)",  // very light blue
            0.3, "rgba(96, 165, 250, 0.4)",   // light blue
            0.5, "rgba(59, 130, 246, 0.6)",   // blue
            0.7, "rgba(37, 99, 235, 0.8)",    // darker blue
            1, "rgba(29, 78, 216, 1)",        // sky blue / deep blue
          ],
          // Increase radius as zoom increases
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 15, 15, 40],
          // Decrease opacity as zoom increases
          "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 7, 0.9, 15, 0.6],
        },
      });

      // Fit bounds to orders
      if (geocodedOrders.length > 0) {
        const bounds = new mapboxgl.LngLatBounds();
        geocodedOrders.forEach((order) => {
          bounds.extend([order.lng, order.lat]);
        });
        map.current.fitBounds(bounds, { padding: 60, maxZoom: 12 });
      }
    });
  }, [mapboxToken, open, loading, geocodedOrders]);

  // Reset map when dialog closes
  useEffect(() => {
    if (!open) {
      mapInitialized.current = false;
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    }
  }, [open]);

  const totalOrders = geocodedOrders.length;
  const totalRevenue = geocodedOrders.reduce((sum, o) => sum + o.total, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[85vh] p-0 gap-0">
        <DialogHeader className="p-4 pb-2 border-b">
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Geographic Sales Analysis
          </DialogTitle>
        </DialogHeader>

        <div className="relative flex-1 h-full">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-3">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                <p className="text-sm text-muted-foreground">
                  Loading order locations...
                </p>
              </div>
            </div>
          ) : (
            <>
              <div ref={mapContainer} className="w-full h-full min-h-[500px]" />

              {/* Stats overlay - collapsible */}
              <div className="absolute top-4 left-4">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowStats(!showStats)}
                  className="shadow-lg"
                >
                  {showStats ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
                  Stats
                </Button>
                
                {showStats && (
                  <div className="mt-2 bg-background/95 backdrop-blur-sm rounded-lg shadow-lg p-4 space-y-2 border animate-in slide-in-from-top-2">
                    <h4 className="font-semibold text-sm">Heatmap Stats</h4>
                    <div className="flex items-center gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Orders: </span>
                        <span className="font-medium">{totalOrders}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Revenue: </span>
                        <span className="font-medium">${totalRevenue.toFixed(2)}</span>
                      </div>
                    </div>
                    
                    {/* Legend */}
                    <div className="pt-2 border-t">
                      <p className="text-xs text-muted-foreground mb-1">Order Density</p>
                      <div className="flex items-center gap-1">
                        <div className="h-3 flex-1 rounded" style={{
                          background: "linear-gradient(to right, rgba(147, 197, 253, 0.3), rgba(96, 165, 250, 0.5), rgba(59, 130, 246, 0.7), rgba(37, 99, 235, 0.9), rgba(29, 78, 216, 1))"
                        }} />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground mt-1">
                        <span>Low</span>
                        <span>High</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {geocodedOrders.length === 0 && !loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                  <div className="text-center space-y-2">
                    <MapPin className="h-12 w-12 mx-auto text-muted-foreground/50" />
                    <p className="text-muted-foreground">
                      No orders with addresses found for this period
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AnalyticsMap;
