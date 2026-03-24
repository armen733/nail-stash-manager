import { useEffect, useRef, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useGeolocation } from "@/hooks/useGeolocation";
import { Loader2, LocateFixed, Moon, Sun, Satellite, Settings2 } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

type MapStyle = "dark" | "light" | "satellite";
const MAP_STYLES: Record<MapStyle, string> = {
  dark: "mapbox://styles/mapbox/navigation-night-v1",
  light: "mapbox://styles/mapbox/standard",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
};

interface SalonVisitStatus {
  id: string;
  name: string;
  address: string;
  city: string | null;
  phone: string | null;
  daysSinceVisit: number | null; // null = never visited
}

interface VisitStatusMapProps {
  salons: SalonVisitStatus[];
  fullScreen?: boolean;
}

interface GeoSalon extends SalonVisitStatus {
  lat: number;
  lng: number;
}

const getMarkerColor = (daysSinceVisit: number | null): { bg: string; ring: string; label: string } => {
  if (daysSinceVisit === null) return { bg: "#ef4444", ring: "#fca5a5", label: "Never visited" };
  if (daysSinceVisit >= 14) return { bg: "#ef4444", ring: "#fca5a5", label: `${daysSinceVisit}d ago` };
  if (daysSinceVisit >= 7) return { bg: "#f97316", ring: "#fdba74", label: `${daysSinceVisit}d ago` };
  return { bg: "#22c55e", ring: "#86efac", label: `${daysSinceVisit}d ago` };
};

export default function VisitStatusMap({ salons, fullScreen }: VisitStatusMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const userLocation = useGeolocation(true);
  const [loading, setLoading] = useState(true);
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [geocodedSalons, setGeocodedSalons] = useState<GeoSalon[]>([]);
  const [mapStyle, setMapStyle] = useState<MapStyle>("dark");
  const [mapReady, setMapReady] = useState(0);
  const [showControls, setShowControls] = useState(false);

  // Fetch token
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("get-mapbox-token");
        if (error) throw error;
        setMapboxToken(data.token);
      } catch (err) {
        console.error("Failed to fetch Mapbox token:", err);
      }
    };
    fetchToken();
  }, []);

  // Geocode salons
  useEffect(() => {
    if (!mapboxToken || salons.length === 0) return;

    const geocode = async () => {
      setLoading(true);
      const geocoded: GeoSalon[] = [];
      const cache: Record<string, { lat: number; lng: number }> = {};

      for (const salon of salons) {
        if (!salon.address) continue;
        const key = salon.address.trim().toLowerCase();

        if (cache[key]) {
          geocoded.push({ ...salon, ...cache[key] });
          continue;
        }

        try {
          const res = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(salon.address)}.json?access_token=${mapboxToken}&limit=1`
          );
          const data = await res.json();
          if (data.features?.[0]) {
            const [lng, lat] = data.features[0].center;
            cache[key] = { lat, lng };
            geocoded.push({ ...salon, lat, lng });
          }
        } catch (err) {
          console.error("Geocoding error:", err);
        }
      }

      setGeocodedSalons(geocoded);
      setLoading(false);
    };

    geocode();
  }, [mapboxToken, salons]);

  // Add markers
  const addMarkers = () => {
    if (!map.current) return;
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    geocodedSalons.forEach(salon => {
      const color = getMarkerColor(salon.daysSinceVisit);
      const el = document.createElement("div");
      el.innerHTML = `
        <div style="
          width: 32px; height: 32px; border-radius: 50%;
          background: ${color.bg}; border: 2.5px solid ${color.ring};
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3); cursor: pointer;
          transition: transform 0.15s;
        " onmouseenter="this.style.transform='scale(1.2)'" onmouseleave="this.style.transform='scale(1)'">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/>
            <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>
            <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/>
          </svg>
        </div>
      `;

      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const encoded = encodeURIComponent(salon.address);
      const mapsUrl = isIOS ? `maps://maps.apple.com/?q=${encoded}` : `https://maps.google.com/?q=${encoded}`;

      const popup = new mapboxgl.Popup({ offset: 20, className: "salon-popup" }).setHTML(`
        <div style="padding: 10px; min-width: 180px;">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
            <div style="width: 8px; height: 8px; border-radius: 50%; background: ${color.bg};"></div>
            <span style="font-size: 11px; color: #6b7280;">${color.label}</span>
          </div>
          <h3 style="font-weight: 700; font-size: 14px; color: #1a1a1a; margin: 0 0 6px 0;">${salon.name}</h3>
          <a href="${mapsUrl}" target="_blank" rel="noopener" style="font-size: 12px; color: #2563eb; text-decoration: none; display: block; line-height: 1.4;">
            📍 ${salon.address}
          </a>
          ${salon.phone ? `<a href="tel:${salon.phone}" style="font-size: 12px; color: #2563eb; text-decoration: none; display: block; margin-top: 6px;">📞 ${salon.phone}</a>` : ""}
        </div>
      `);

      const marker = new mapboxgl.Marker(el)
        .setLngLat([salon.lng, salon.lat])
        .setPopup(popup)
        .addTo(map.current!);

      markersRef.current.push(marker);
    });
  };

  // Init map
  useEffect(() => {
    if (!mapboxToken || !mapContainer.current) return;

    if (map.current) {
      map.current.remove();
      map.current = null;
    }

    mapboxgl.accessToken = mapboxToken;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: MAP_STYLES[mapStyle],
      center: [-98.5795, 39.8283],
      zoom: 3,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");
    map.current.on("load", () => {
      map.current?.resize();
      setMapReady(prev => prev + 1);
    });

    setTimeout(() => map.current?.resize(), 100);

    return () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      if (map.current) { map.current.remove(); map.current = null; }
    };
  }, [mapboxToken, mapStyle]);

  // Update markers
  useEffect(() => {
    if (!map.current || geocodedSalons.length === 0) return;
    const update = () => {
      addMarkers();
      const bounds = new mapboxgl.LngLatBounds();
      geocodedSalons.forEach(s => bounds.extend([s.lng, s.lat]));
      map.current?.fitBounds(bounds, { padding: 50, maxZoom: 12 });
    };
    if (map.current.isStyleLoaded()) update();
    else map.current.once("load", update);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geocodedSalons]);

  // User location marker
  useEffect(() => {
    if (!map.current || userLocation.lat === null || userLocation.lng === null) return;
    if (userMarkerRef.current) { userMarkerRef.current.remove(); userMarkerRef.current = null; }

    const el = document.createElement("div");
    el.innerHTML = `
      <div style="width: 44px; height: 44px; position: relative; display: flex; align-items: center; justify-content: center;">
        <div style="position: absolute; width: 28px; height: 28px; background: rgba(59,130,246,0.2); border-radius: 50%; animation: ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="#3b82f6" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3)); z-index: 10;">
          <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
        </svg>
      </div>
    `;

    userMarkerRef.current = new mapboxgl.Marker(el)
      .setLngLat([userLocation.lng, userLocation.lat])
      .addTo(map.current);

    return () => { userMarkerRef.current?.remove(); userMarkerRef.current = null; };
  }, [userLocation.lat, userLocation.lng, mapReady]);

  const handleStyleChange = (s: MapStyle) => {
    if (!map.current || s === mapStyle) return;
    setMapStyle(s);
    map.current.setStyle(MAP_STYLES[s]);
    map.current.once("style.load", addMarkers);
  };

  const shouldShowLocationPrompt = !userLocation.loading && userLocation.lat === null;

  return (
    <div className={cn("relative w-full overflow-hidden", fullScreen ? "h-full" : "rounded-lg border border-border")} style={fullScreen ? undefined : { height: "450px" }}>
      <div ref={mapContainer} className="absolute inset-0 w-full h-full" />

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10">
          <div className="text-center space-y-2">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
            <p className="text-xs text-muted-foreground">Loading salon locations...</p>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute top-3 left-3 z-20 bg-background/90 backdrop-blur-sm rounded-lg shadow-lg p-2.5 border text-xs space-y-1.5">
        <p className="font-semibold text-[11px]">Visit Status</p>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ background: "#22c55e" }} />
          <span className="text-muted-foreground">Recent (&lt;7d)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ background: "#f97316" }} />
          <span className="text-muted-foreground">Overdue (7-13d)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ background: "#ef4444" }} />
          <span className="text-muted-foreground">Critical (14d+/Never)</span>
        </div>
      </div>

      {/* Map style controls */}
      <div className="absolute bottom-3 left-3 z-20 flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => setShowControls(!showControls)} className="shadow-lg h-8 w-8 p-0">
          <Settings2 className="h-4 w-4" />
        </Button>
        {showControls && (
          <div className="bg-background/95 backdrop-blur-sm rounded-lg shadow-lg p-1 border animate-in slide-in-from-left-2">
            <ToggleGroup type="single" value={mapStyle} onValueChange={v => v && handleStyleChange(v as MapStyle)}>
              <ToggleGroupItem value="dark" className="h-8 w-8 p-0"><Moon className="h-4 w-4" /></ToggleGroupItem>
              <ToggleGroupItem value="light" className="h-8 w-8 p-0"><Sun className="h-4 w-4" /></ToggleGroupItem>
              <ToggleGroupItem value="satellite" className="h-8 w-8 p-0"><Satellite className="h-4 w-4" /></ToggleGroupItem>
            </ToggleGroup>
          </div>
        )}
      </div>

      {/* Location prompt */}
      {shouldShowLocationPrompt && (
        <div className="absolute bottom-3 right-3 z-20">
          <Button size="sm" variant="secondary" className="shadow-lg" onClick={userLocation.requestLocation}>
            <LocateFixed className="h-3.5 w-3.5 mr-1.5" />
            My Location
          </Button>
        </div>
      )}
    </div>
  );
}
