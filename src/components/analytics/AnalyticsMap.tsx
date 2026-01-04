import { useEffect, useRef, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MapPin, ChevronUp, ChevronDown, Moon, Sun, Satellite, Settings2, X } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

type MapStyle = "dark" | "light" | "satellite";

const MAP_STYLES: Record<MapStyle, string> = {
  dark: "mapbox://styles/mapbox/navigation-night-v1",
  light: "mapbox://styles/mapbox/standard",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
};

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
  const [loading, setLoading] = useState(true);
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [geocodedOrders, setGeocodedOrders] = useState<GeocodedOrder[]>([]);
  const [showStats, setShowStats] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [mapStyle, setMapStyle] = useState<MapStyle>("dark");
  const { toast } = useToast();

  // Add heatmap layer helper
  const addHeatmapLayer = () => {
    if (!map.current || geocodedOrders.length === 0) return;

    // Remove existing layers/sources if they exist
    if (map.current.getLayer("orders-heatmap")) {
      map.current.removeLayer("orders-heatmap");
    }
    if (map.current.getSource("orders-heat")) {
      map.current.removeSource("orders-heat");
    }

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
        "heatmap-weight": 1,
        "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 1, 15, 3],
        "heatmap-color": [
          "interpolate",
          ["linear"],
          ["heatmap-density"],
          0, "rgba(147, 197, 253, 0)",
          0.1, "rgba(147, 197, 253, 0.2)",
          0.3, "rgba(96, 165, 250, 0.4)",
          0.5, "rgba(59, 130, 246, 0.6)",
          0.7, "rgba(37, 99, 235, 0.8)",
          1, "rgba(29, 78, 216, 1)",
        ],
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 15, 15, 40],
        "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 7, 0.9, 15, 0.6],
      },
    });
  };

  // Fetch mapbox token when opened
  useEffect(() => {
    if (!open) return;
    
    const fetchToken = async () => {
      try {
        console.log("Fetching Mapbox token...");
        const { data, error } = await supabase.functions.invoke("get-mapbox-token");
        if (error) throw error;
        console.log("Mapbox token received:", data?.token ? "yes" : "no");
        setMapboxToken(data.token);
      } catch (error: any) {
        console.error("Failed to fetch Mapbox token:", error);
        toast({
          title: "Map Error",
          description: "Failed to load map configuration",
          variant: "destructive",
        });
      }
    };
    fetchToken();
  }, [open, toast]);

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

  // Initialize map when open and token available
  useEffect(() => {
    if (!open || !mapboxToken || !mapContainer.current) return;
    
    // Clean up any existing map instance first
    if (map.current) {
      map.current.remove();
      map.current = null;
    }

    console.log("Initializing Mapbox map...");
    mapboxgl.accessToken = mapboxToken;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: MAP_STYLES[mapStyle],
      center: [-98.5795, 39.8283], // Center of USA
      zoom: 3,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");
    
    map.current.on("load", () => {
      console.log("Map loaded successfully");
      // Force resize after load to ensure proper rendering
      map.current?.resize();
    });
    
    // Also trigger resize after a short delay for safety
    setTimeout(() => {
      map.current?.resize();
    }, 100);

    // Cleanup on unmount or when dependencies change
    return () => {
      if (map.current) {
        console.log("Cleaning up map...");
        map.current.remove();
        map.current = null;
      }
    };
  }, [open, mapboxToken, mapStyle]);

  // Update heatmap when orders change
  useEffect(() => {
    if (!map.current || geocodedOrders.length === 0) return;
    
    const updateMap = () => {
      addHeatmapLayer();
      
      const bounds = new mapboxgl.LngLatBounds();
      geocodedOrders.forEach((order) => {
        bounds.extend([order.lng, order.lat]);
      });
      map.current?.fitBounds(bounds, { padding: 60, maxZoom: 12 });
    };
    
    if (map.current.isStyleLoaded()) {
      updateMap();
    } else {
      map.current.once("load", updateMap);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geocodedOrders]);

  // Handle style change
  const handleStyleChange = (newStyle: MapStyle) => {
    if (!map.current || newStyle === mapStyle) return;
    
    setMapStyle(newStyle);
    map.current.setStyle(MAP_STYLES[newStyle]);
    
    map.current.once("style.load", () => {
      addHeatmapLayer();
    });
  };

  // Memoize stats calculations
  const { totalOrders, totalRevenue } = useMemo(() => ({
    totalOrders: geocodedOrders.length,
    totalRevenue: geocodedOrders.reduce((sum, o) => sum + o.total, 0),
  }), [geocodedOrders]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-background/90 to-transparent">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Geographic Sales Analysis</h2>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => onOpenChange(false)}
          className="rounded-full"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Map container - fullscreen with explicit dimensions */}
      <div ref={mapContainer} className="absolute inset-0 w-full h-full" style={{ width: '100%', height: '100%' }} />
      
      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10">
          <div className="text-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-sm text-muted-foreground">
              Loading order locations...
            </p>
          </div>
        </div>
      )}

      {/* Stats overlay - collapsible */}
      <div className="absolute top-20 left-4 z-20">
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

      {/* Bottom controls */}
      <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowControls(!showControls)}
          className="shadow-lg h-8 w-8 p-0"
        >
          <Settings2 className="h-4 w-4" />
        </Button>

        {showControls && (
          <div className="bg-background/95 backdrop-blur-sm rounded-lg shadow-lg p-1 border animate-in slide-in-from-left-2">
            <ToggleGroup 
              type="single" 
              value={mapStyle} 
              onValueChange={(value) => value && handleStyleChange(value as MapStyle)}
            >
              <ToggleGroupItem value="dark" aria-label="Dusk mode" className="h-8 w-8 p-0">
                <Moon className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="light" aria-label="Light mode" className="h-8 w-8 p-0">
                <Sun className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="satellite" aria-label="Satellite view" className="h-8 w-8 p-0">
                <Satellite className="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        )}
      </div>

      {/* No data message - doesn't block the map */}
      {geocodedOrders.length === 0 && !loading && (
        <div className="absolute bottom-4 right-4 z-20 bg-background/95 backdrop-blur-sm rounded-lg shadow-lg p-4 border">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" />
            <span>No orders with addresses for this period</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalyticsMap;