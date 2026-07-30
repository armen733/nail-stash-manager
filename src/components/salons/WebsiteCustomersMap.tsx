import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, X, Globe, MapPin } from "lucide-react";

export interface CustomerPin {
  name: string;
  address: string;
  orders: number;
  revenue: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pins: CustomerPin[];
}

const WebsiteCustomersMap = ({ open, onOpenChange, pins }: Props) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [placed, setPlaced] = useState(0);

  useEffect(() => {
    if (!open || token) return;
    supabase.functions
      .invoke("get-mapbox-token")
      .then(({ data }) => setToken(data?.token ?? null))
      .catch(() => setToken(null));
  }, [open, token]);

  useEffect(() => {
    if (!open || !token || !mapContainer.current) return;
    mapboxgl.accessToken = token;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/navigation-night-v1",
      center: [-98.5795, 39.8283],
      zoom: 3,
    });
    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      const bounds = new mapboxgl.LngLatBounds();
      let count = 0;
      const cache: Record<string, [number, number]> = {};

      for (const pin of pins) {
        if (cancelled) return;
        const key = pin.address.trim().toLowerCase();
        let coords = cache[key];
        if (!coords) {
          try {
            const res = await fetch(
              `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
                pin.address
              )}.json?access_token=${token}&limit=1`
            );
            const json = await res.json();
            if (!json.features?.length) continue;
            coords = json.features[0].center as [number, number];
            cache[key] = coords;
          } catch {
            continue;
          }
        }

        const el = document.createElement("div");
        const size = Math.min(46, 26 + Math.round(pin.orders * 4));
        el.innerHTML = `
          <div style="width:${size}px;height:${size}px" class="rounded-full bg-primary flex items-center justify-center border-2 border-white shadow-lg text-[11px] font-bold text-primary-foreground cursor-pointer hover:scale-110 transition-transform">
            ${pin.orders}
          </div>`;

        const popup = new mapboxgl.Popup({ offset: 22 }).setHTML(`
          <div style="padding:10px;min-width:190px">
            <h3 style="font-weight:700;font-size:14px;color:#1a1a1a;margin:0 0 6px">${pin.name}</h3>
            <a href="https://maps.google.com/?q=${encodeURIComponent(pin.address)}" target="_blank" rel="noopener" style="font-size:12px;color:#2563eb;text-decoration:none;line-height:1.4">📍 ${pin.address}</a>
            <p style="font-size:12px;color:#4b5563;margin:8px 0 0">${pin.orders} order${pin.orders > 1 ? "s" : ""} · $${pin.revenue.toFixed(2)}</p>
          </div>`);

        const marker = new mapboxgl.Marker(el).setLngLat(coords).setPopup(popup).addTo(map.current!);
        markersRef.current.push(marker);
        bounds.extend(coords);
        count++;
      }

      if (!cancelled) {
        setPlaced(count);
        if (count > 0) map.current?.fitBounds(bounds, { padding: 70, maxZoom: 11 });
        setLoading(false);
      }
    };

    map.current.on("load", run);

    return () => {
      cancelled = true;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.current?.remove();
      map.current = null;
    };
  }, [open, token, pins]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background">
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-background/90 to-transparent">
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Website customer locations</h2>
        </div>
        <Button variant="outline" size="icon" className="rounded-full" onClick={() => onOpenChange(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div ref={mapContainer} className="absolute inset-0 w-full h-full" />

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10">
          <div className="text-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-sm text-muted-foreground">Locating customers...</p>
          </div>
        </div>
      )}

      {!loading && (
        <div className="absolute bottom-4 left-4 z-20 bg-background/95 backdrop-blur-sm rounded-lg shadow-lg p-3 border">
          <p className="text-sm font-medium flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" /> {placed} of {pins.length} addresses mapped
          </p>
        </div>
      )}
    </div>
  );
};

export default WebsiteCustomersMap;
