import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useGeolocation } from "@/hooks/useGeolocation";
import { Loader2, ChevronUp, ChevronDown, Moon, Sun, Satellite, Settings2, X, Building2 } from "lucide-react";
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

interface GeocodedSalon {
  id: string;
  name: string;
  address: string;
  city: string | null;
  phone: string | null;
  lat: number;
  lng: number;
}

const AnalyticsMap = ({ open, onOpenChange }: AnalyticsMapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const userLocation = useGeolocation(open);
  const [loading, setLoading] = useState(true);
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [geocodedSalons, setGeocodedSalons] = useState<GeocodedSalon[]>([]);
  const [showStats, setShowStats] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [mapStyle, setMapStyle] = useState<MapStyle>("dark");
  const { toast } = useToast();

  // Add salon markers helper
  const addSalonMarkers = () => {
    if (!map.current || geocodedSalons.length === 0) return;

    // Remove existing markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // Add markers for each salon
    geocodedSalons.forEach((salon) => {
      // Create custom marker element
      const el = document.createElement('div');
      el.className = 'salon-marker';
      el.innerHTML = `
        <div class="w-10 h-10 bg-primary rounded-full flex items-center justify-center shadow-lg border-2 border-white cursor-pointer hover:scale-110 transition-transform">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/>
            <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>
            <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/>
            <path d="M10 6h4"/>
            <path d="M10 10h4"/>
            <path d="M10 14h4"/>
            <path d="M10 18h4"/>
          </svg>
        </div>
      `;

      // Create maps URL
      const encodedAddress = encodeURIComponent(salon.address);
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const mapsUrl = isIOS 
        ? `maps://maps.apple.com/?q=${encodedAddress}`
        : `https://maps.google.com/?q=${encodedAddress}`;

      // Create popup with better contrast and clickable address
      const popup = new mapboxgl.Popup({ offset: 25, className: 'salon-popup' }).setHTML(`
        <div style="padding: 12px; min-width: 200px;">
          <h3 style="font-weight: 700; font-size: 15px; color: #1a1a1a; margin: 0 0 8px 0;">${salon.name}</h3>
          <a href="${mapsUrl}" target="_blank" rel="noopener" style="display: block; font-size: 13px; color: #2563eb; text-decoration: none; margin-bottom: 4px; line-height: 1.4;">
            📍 ${salon.address}
          </a>
          ${salon.city ? `<p style="font-size: 12px; color: #4b5563; margin: 0 0 4px 0;">${salon.city}</p>` : ''}
          ${salon.phone ? `<a href="tel:${salon.phone}" style="display: block; font-size: 13px; color: #2563eb; text-decoration: none; margin-top: 8px;">📞 ${salon.phone}</a>` : ''}
        </div>
      `);

      const marker = new mapboxgl.Marker(el)
        .setLngLat([salon.lng, salon.lat])
        .setPopup(popup)
        .addTo(map.current!);

      markersRef.current.push(marker);
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

  // Fetch and geocode salons when dialog opens
  useEffect(() => {
    if (!open || !mapboxToken) return;

    const fetchSalons = async () => {
      setLoading(true);
      try {
        const { data: salons, error } = await supabase
          .from("salons")
          .select("id, name, address, city, phone")
          .not("address", "is", null);

        if (error) throw error;

        // Geocode salons
        const geocoded: GeocodedSalon[] = [];
        const geocodeCache: Record<string, { lat: number; lng: number }> = {};

        for (const salon of salons || []) {
          if (!salon.address) continue;

          const address = salon.address.trim().toLowerCase();

          if (geocodeCache[address]) {
            geocoded.push({
              id: salon.id,
              name: salon.name,
              address: salon.address,
              city: salon.city,
              phone: salon.phone,
              ...geocodeCache[address],
            });
            continue;
          }

          try {
            const response = await fetch(
              `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
                salon.address
              )}.json?access_token=${mapboxToken}&limit=1`
            );
            const data = await response.json();

            if (data.features && data.features.length > 0) {
              const [lng, lat] = data.features[0].center;
              geocodeCache[address] = { lat, lng };
              geocoded.push({
                id: salon.id,
                name: salon.name,
                address: salon.address,
                city: salon.city,
                phone: salon.phone,
                lat,
                lng,
              });
            }
          } catch (error) {
            console.error("Geocoding error:", error);
          }
        }

        setGeocodedSalons(geocoded);
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

    fetchSalons();
  }, [open, mapboxToken, toast]);

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
      // Remove markers first
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];
      if (map.current) {
        console.log("Cleaning up map...");
        map.current.remove();
        map.current = null;
      }
    };
  }, [open, mapboxToken, mapStyle]);

  // Update markers when salons change
  useEffect(() => {
    if (!map.current || geocodedSalons.length === 0) return;
    
    const updateMap = () => {
      addSalonMarkers();
      
      const bounds = new mapboxgl.LngLatBounds();
      geocodedSalons.forEach((salon) => {
        bounds.extend([salon.lng, salon.lat]);
      });
      map.current?.fitBounds(bounds, { padding: 60, maxZoom: 12 });
    };
    
    if (map.current.isStyleLoaded()) {
      updateMap();
    } else {
      map.current.once("load", updateMap);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geocodedSalons]);

  // Add user location marker
  useEffect(() => {
    if (!map.current || !userLocation.lat || !userLocation.lng) return;

    // Remove existing user marker
    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }

    const el = document.createElement('div');
    el.innerHTML = `
      <div class="relative flex items-center justify-center" style="width: 44px; height: 44px;">
        <div class="absolute w-10 h-10 bg-blue-500/20 rounded-full animate-ping"></div>
        <div class="absolute w-7 h-7 bg-blue-500/25 rounded-full"></div>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="#3b82f6" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3)); z-index: 10;">
          <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
        </svg>
      </div>
    `;

    const popup = new mapboxgl.Popup({ offset: 15 }).setText('Your location');

    userMarkerRef.current = new mapboxgl.Marker(el)
      .setLngLat([userLocation.lng, userLocation.lat])
      .setPopup(popup)
      .addTo(map.current);

    return () => {
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
    };
  }, [userLocation.lat, userLocation.lng]);

  // Handle style change
  const handleStyleChange = (newStyle: MapStyle) => {
    if (!map.current || newStyle === mapStyle) return;
    
    setMapStyle(newStyle);
    map.current.setStyle(MAP_STYLES[newStyle]);
    
    map.current.once("style.load", () => {
      addSalonMarkers();
    });
  };

  // Memoize stats calculations
  const totalSalons = geocodedSalons.length;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-background/90 to-transparent">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Registered Salons Map</h2>
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
              Loading salon locations...
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
            <h4 className="font-semibold text-sm">Salon Stats</h4>
            <div className="flex items-center gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Total Salons: </span>
                <span className="font-medium">{totalSalons}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground pt-2 border-t">
              Click on a marker to see salon details
            </p>
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
      {geocodedSalons.length === 0 && !loading && (
        <div className="absolute bottom-4 right-4 z-20 bg-background/95 backdrop-blur-sm rounded-lg shadow-lg p-4 border">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Building2 className="h-4 w-4" />
            <span>No salons with addresses registered</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalyticsMap;