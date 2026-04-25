import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
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

export interface SupplyStorePin {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  address: string | null;
  lat: number;
  lng: number;
}

interface Props {
  stores: SupplyStorePin[];
  fullScreen?: boolean;
}

export default function SupplyStoresMap({ stores, fullScreen }: Props) {
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

  useEffect(() => {
    supabase.functions.invoke("get-mapbox-token").then(({ data, error }) => {
      if (!error) setMapboxToken(data?.token ?? null);
    });
  }, []);

  const addMarkers = () => {
    if (!map.current) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    stores.forEach((store) => {
      const el = document.createElement("div");
      el.innerHTML = `
        <div style="
          width: 32px; height: 32px; border-radius: 50%;
          background: #16a34a; border: 2.5px solid #86efac;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3); cursor: pointer;
          transition: transform 0.15s;
        " onmouseenter="this.style.transform='scale(1.2)'" onmouseleave="this.style.transform='scale(1)'">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/>
            <line x1="2" x2="22" y1="7" y2="7"/>
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
            <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/>
          </svg>
        </div>
      `;

      const popupNode = document.createElement("div");
      popupNode.style.padding = "10px";
      popupNode.style.minWidth = "200px";
      const phoneLine = store.phone
        ? `<a href="tel:${store.phone}" style="font-size: 12px; color: #16a34a; text-decoration: none; display: block; margin-top: 4px;">📞 ${store.phone}</a>`
        : "";
      const contactLine = store.contact_name
        ? `<p style="font-size: 12px; color: #6b7280; margin: 0 0 4px 0;">${store.contact_name}</p>`
        : "";
      const addrLine = store.address
        ? `<p style="font-size: 12px; color: #4b5563; margin: 4px 0 0 0;">📍 ${store.address}</p>`
        : "";
      popupNode.innerHTML = `
        <h3 style="font-weight: 700; font-size: 14px; color: #111; margin: 0 0 4px 0;">${store.name}</h3>
        ${contactLine}
        ${addrLine}
        ${phoneLine}
        <button data-store-id="${store.id}" style="margin-top: 8px; background: #16a34a; color: white; border: none; padding: 6px 10px; border-radius: 6px; font-size: 12px; cursor: pointer; width: 100%;">View profile</button>
      `;
      popupNode.querySelector("button")?.addEventListener("click", () => {
        navigate(`/supply-stores/${store.id}`);
      });

      const popup = new mapboxgl.Popup({ offset: 20 }).setDOMContent(popupNode);

      const marker = new mapboxgl.Marker(el)
        .setLngLat([store.lng, store.lat])
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
    if (!map.current || stores.length === 0) return;
    const update = () => {
      addMarkers();
      const bounds = new mapboxgl.LngLatBounds();
      stores.forEach((s) => bounds.extend([s.lng, s.lat]));
      if (stores.length === 1) {
        map.current?.setCenter([stores[0].lng, stores[0].lat]);
        map.current?.setZoom(13);
      } else {
        map.current?.fitBounds(bounds, { padding: 60, maxZoom: 12 });
      }
    };
    if (map.current.isStyleLoaded()) update();
    else map.current.once("load", update);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores, mapReady]);

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
      <div className={cn("flex items-center justify-center", fullScreen ? "h-full" : "h-[450px] rounded-lg border border-border")}>
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div
      className={cn("relative w-full overflow-hidden", fullScreen ? "h-full" : "rounded-lg border border-border")}
      style={fullScreen ? undefined : { height: "550px" }}
    >
      <div ref={mapContainer} className="absolute inset-0 w-full h-full" />

      {stores.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10 pointer-events-none">
          <p className="text-sm text-muted-foreground">No supply stores with location data yet.</p>
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
