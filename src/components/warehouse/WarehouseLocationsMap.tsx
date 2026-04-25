import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useGeolocation } from "@/hooks/useGeolocation";
import { Loader2, LocateFixed, Moon, Sun, Satellite, Settings2, Maximize2, X } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

type MapStyle = "dark" | "light" | "satellite";
const MAP_STYLES: Record<MapStyle, string> = {
  dark: "mapbox://styles/mapbox/navigation-night-v1",
  light: "mapbox://styles/mapbox/standard",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
};

export interface WarehousePin {
  id: string; // stock_location id
  name: string;
  type: "warehouse" | "fba" | "consignment" | "driver";
  address: string | null;
  lat: number;
  lng: number;
  supplyStoreId: string | null;
  units: number;
  skus: number;
  lowSkus?: number;
  lowUnits?: number;

}

interface Props {
  pins: WarehousePin[];
  className?: string;
  fullscreen?: boolean;
  onExitFullscreen?: () => void;
}

const LOW_STOCK_COLOR = { bg: "#dc2626", ring: "#fca5a5" };

const TYPE_COLOR: Record<WarehousePin["type"], { bg: string; ring: string }> = {
  warehouse: { bg: "#2563eb", ring: "#93c5fd" },
  fba: { bg: "#ea580c", ring: "#fdba74" },
  consignment: { bg: "#16a34a", ring: "#86efac" },
  driver: { bg: "#7c3aed", ring: "#c4b5fd" },
};

export default function WarehouseLocationsMap({ pins, className, fullscreen: fullscreenProp, onExitFullscreen }: Props) {
  const navigate = useNavigate();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const userLocation = useGeolocation(true);
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [mapStyle, setMapStyle] = useState<MapStyle>("dark");
  const [mapReady, setMapReady] = useState(0);
  const [showControls, setShowControls] = useState(false);
  const [internalFullscreen, setInternalFullscreen] = useState(false);
  const isControlled = fullscreenProp !== undefined;
  const isFullscreen = isControlled ? !!fullscreenProp : internalFullscreen;
  const exitFullscreen = () => {
    if (isControlled) onExitFullscreen?.();
    else setInternalFullscreen(false);
  };
  const toggleFullscreen = () => {
    if (isControlled) {
      if (isFullscreen) onExitFullscreen?.();
    } else {
      setInternalFullscreen((v) => !v);
    }
  };

  // Resize map when entering/exiting fullscreen
  useEffect(() => {
    const t = setTimeout(() => map.current?.resize(), 50);
    return () => clearTimeout(t);
  }, [isFullscreen]);

  // ESC to exit fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  useEffect(() => {
    supabase.functions.invoke("get-mapbox-token").then(({ data, error }) => {
      if (!error) setMapboxToken(data?.token ?? null);
    });
  }, []);

  const addMarkers = () => {
    if (!map.current) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    pins.forEach((pin) => {
      const lowUnits = pin.lowUnits ?? 0;
      const isLow = lowUnits > 0;
      const colors = isLow ? LOW_STOCK_COLOR : TYPE_COLOR[pin.type];
      const el = document.createElement("div");
      el.innerHTML = `
        <div style="
          width: 32px; height: 32px; border-radius: 50%;
          background: ${colors.bg}; border: 2.5px solid ${colors.ring};
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3); cursor: pointer;
          transition: transform 0.15s; color: white; font-size: 14px; font-weight: 700;
          ${isLow ? "animation: pulse 1.6s ease-in-out infinite;" : ""}
        " onmouseenter="this.style.transform='scale(1.2)'" onmouseleave="this.style.transform='scale(1)'">
          ${pin.type === "warehouse" ? "W" : pin.type === "fba" ? "F" : pin.type === "consignment" ? "S" : "D"}
        </div>
      `;

      const popupNode = document.createElement("div");
      popupNode.style.padding = "10px";
      popupNode.style.minWidth = "210px";
      const addrLine = pin.address
        ? `<p style="font-size: 12px; color: #4b5563; margin: 4px 0 0 0;">📍 ${pin.address}</p>`
        : "";
      const typeLabel =
        pin.type === "warehouse" ? "Warehouse" : pin.type === "fba" ? "Amazon FBA" : pin.type === "consignment" ? "Supply Store" : "Driver";

      popupNode.innerHTML = `
        <h3 style="font-weight: 700; font-size: 14px; color: #111; margin: 0 0 4px 0;">${pin.name}</h3>
        <p style="font-size: 11px; color: #6b7280; margin: 0;">${typeLabel}${isLow ? ` · <span style="color:#dc2626; font-weight:600;">${lowUnits.toLocaleString()} low unit${lowUnits === 1 ? "" : "s"}</span>` : ""}</p>
        ${addrLine}
        <div style="display: flex; gap: 12px; margin-top: 8px; font-size: 11px; color: #4b5563;">
          <span><strong style="color: #111;">${pin.units.toLocaleString()}</strong> units</span>
          <span><strong style="color: #111;">${pin.skus.toLocaleString()}</strong> SKUs</span>
        </div>
        <div style="display: flex; gap: 6px; margin-top: 8px;">
          <button data-action="open" style="flex:1; background: ${colors.bg}; color: white; border: none; padding: 6px 10px; border-radius: 6px; font-size: 12px; cursor: pointer;">Open</button>
          ${pin.address ? `<button data-action="directions" style="flex:1; background: #f3f4f6; color: #111; border: none; padding: 6px 10px; border-radius: 6px; font-size: 12px; cursor: pointer;">Directions</button>` : ""}
        </div>
      `;
      popupNode.querySelector('[data-action="open"]')?.addEventListener("click", () => {
        navigate(`/warehouse/${pin.id}`);
      });
      popupNode.querySelector('[data-action="directions"]')?.addEventListener("click", () => {
        if (!pin.address) return;
        const encoded = encodeURIComponent(pin.address);
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        window.open(isIOS ? `maps://maps.apple.com/?q=${encoded}` : `https://maps.google.com/?q=${encoded}`, "_blank");
      });

      const popup = new mapboxgl.Popup({ offset: 20 }).setDOMContent(popupNode);

      const marker = new mapboxgl.Marker(el)
        .setLngLat([pin.lng, pin.lat])
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
      setMapReady((p) => p + 1);
    });
    setTimeout(() => map.current?.resize(), 100);

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [mapboxToken, mapStyle]);

  // Update markers + fit bounds
  useEffect(() => {
    if (!map.current || pins.length === 0) return;
    const update = () => {
      addMarkers();
      const bounds = new mapboxgl.LngLatBounds();
      pins.forEach((p) => bounds.extend([p.lng, p.lat]));
      if (pins.length === 1) {
        map.current?.setCenter([pins[0].lng, pins[0].lat]);
        map.current?.setZoom(13);
      } else {
        map.current?.fitBounds(bounds, { padding: 60, maxZoom: 12 });
      }
    };
    if (map.current.isStyleLoaded()) update();
    else map.current.once("load", update);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins, mapReady]);

  // User location pin
  useEffect(() => {
    if (!map.current || userLocation.lat === null || userLocation.lng === null) return;
    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }
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
    return () => {
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
    };
  }, [userLocation.lat, userLocation.lng, mapReady]);

  const handleStyleChange = (s: MapStyle) => {
    if (!map.current || s === mapStyle) return;
    setMapStyle(s);
    map.current.setStyle(MAP_STYLES[s]);
    map.current.once("style.load", addMarkers);
  };

  const shouldShowLocationPrompt = !userLocation.loading && userLocation.lat === null;

  if (!mapboxToken) {
    return (
      <div className={cn("flex items-center justify-center h-[550px] rounded-lg border border-border", className)}>
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden",
        isFullscreen
          ? "fixed inset-0 z-[100] rounded-none border-0"
          : "rounded-lg border border-border",
        !isFullscreen && className,
      )}
      style={isFullscreen ? undefined : { height: "600px" }}
    >
      <div ref={mapContainer} className="absolute inset-0 w-full h-full" />

      {/* Fullscreen / exit button */}
      <div className={cn("absolute right-3 z-30", isFullscreen ? "top-3" : "top-32")}>
        <Button
          variant="secondary"
          size="sm"
          className="shadow-lg h-8 w-8 p-0"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? <X className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
      </div>

      {pins.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10 pointer-events-none">
          <div className="text-center max-w-sm px-4">
            <p className="text-sm text-muted-foreground">
              No locations with coordinates yet. Link a consignment location to a supply store that has a lat/lng to see pins here.
            </p>
          </div>
        </div>
      )}

      {/* Legend */}
      {pins.length > 0 && (
        <div className="absolute top-3 left-3 z-20 bg-background/95 backdrop-blur-sm rounded-lg shadow-lg p-2 border text-[11px] space-y-1">
          {Object.entries(TYPE_COLOR).map(([key, c]) => {
            const count = pins.filter((p) => p.type === key && (p.lowSkus ?? 0) === 0).length;
            if (count === 0) return null;
            const label = key === "warehouse" ? "Warehouse" : key === "fba" ? "FBA" : key === "consignment" ? "Supply Store" : "Driver";
            return (
              <div key={key} className="flex items-center gap-1.5">
                <span
                  className="inline-block w-3 h-3 rounded-full border"
                  style={{ background: c.bg, borderColor: c.ring }}
                />
                <span>{label} ({count})</span>
              </div>
            );
          })}
          {(() => {
            const lowCount = pins.filter((p) => (p.lowSkus ?? 0) > 0).length;
            if (lowCount === 0) return null;
            return (
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block w-3 h-3 rounded-full border"
                  style={{ background: LOW_STOCK_COLOR.bg, borderColor: LOW_STOCK_COLOR.ring }}
                />
                <span className="font-semibold text-destructive">Low stock ({lowCount})</span>
              </div>
            );
          })()}
        </div>
      )}

      {/* Map style controls */}
      <div className="absolute bottom-3 left-3 z-20 flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => setShowControls(!showControls)} className="shadow-lg h-8 w-8 p-0">
          <Settings2 className="h-4 w-4" />
        </Button>
        {showControls && (
          <div className="bg-background/95 backdrop-blur-sm rounded-lg shadow-lg p-1 border animate-in slide-in-from-left-2">
            <ToggleGroup type="single" value={mapStyle} onValueChange={(v) => v && handleStyleChange(v as MapStyle)}>
              <ToggleGroupItem value="dark" className="h-8 w-8 p-0"><Moon className="h-4 w-4" /></ToggleGroupItem>
              <ToggleGroupItem value="light" className="h-8 w-8 p-0"><Sun className="h-4 w-4" /></ToggleGroupItem>
              <ToggleGroupItem value="satellite" className="h-8 w-8 p-0"><Satellite className="h-4 w-4" /></ToggleGroupItem>
            </ToggleGroup>
          </div>
        )}
      </div>

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
