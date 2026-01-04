import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MapPin, Navigation, Package, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface OrderForMap {
  id: string;
  customer_name: string | null;
  customer_address: string | null;
  total: number;
  status: string;
  order_date: string;
}

interface OrdersMapProps {
  orders: OrderForMap[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface GeocodedOrder extends OrderForMap {
  lng: number;
  lat: number;
}

const statusColors: Record<string, string> = {
  'Draft': '#6b7280',
  'Confirmed': '#3b82f6',
  'Shipped': '#8b5cf6',
  'Delivered': '#22c55e',
  'Cancelled': '#ef4444',
};

export function OrdersMap({ orders, open, onOpenChange }: OrdersMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<GeocodedOrder | null>(null);
  const [geocodedOrders, setGeocodedOrders] = useState<GeocodedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  // Fetch Mapbox token
  useEffect(() => {
    async function fetchToken() {
      try {
        const { data, error } = await supabase.functions.invoke('get-mapbox-token');
        if (error) throw error;
        setMapboxToken(data.token);
      } catch (err) {
        console.error('Failed to fetch Mapbox token:', err);
      }
    }
    fetchToken();
  }, []);

  // Geocode addresses
  useEffect(() => {
    if (!mapboxToken || !open) return;

    async function geocodeOrders() {
      setLoading(true);
      const ordersWithAddress = orders.filter(o => o.customer_address);
      const geocoded: GeocodedOrder[] = [];

      for (const order of ordersWithAddress) {
        try {
          const response = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(order.customer_address!)}.json?access_token=${mapboxToken}&limit=1`
          );
          const data = await response.json();
          
          if (data.features && data.features.length > 0) {
            const [lng, lat] = data.features[0].center;
            geocoded.push({ ...order, lng, lat });
          }
        } catch (err) {
          console.error('Geocoding failed for:', order.customer_address, err);
        }
      }

      setGeocodedOrders(geocoded);
      setLoading(false);
    }

    geocodeOrders();
  }, [orders, mapboxToken, open]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || !mapboxToken || !open || loading) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    if (map.current) {
      map.current.remove();
    }

    mapboxgl.accessToken = mapboxToken;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      zoom: 10,
      center: geocodedOrders.length > 0 
        ? [geocodedOrders[0].lng, geocodedOrders[0].lat] 
        : [-118.2437, 34.0522], // Default to LA
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    // Add markers for each order
    geocodedOrders.forEach((order) => {
      const el = document.createElement('div');
      el.className = 'order-marker';
      el.style.cssText = `
        width: 36px;
        height: 36px;
        background-color: ${statusColors[order.status] || '#6b7280'};
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s;
      `;
      el.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M20 12V22H4V12"/><path d="M22 7H2V12H22V7Z"/><path d="M12 22V7"/><path d="M12 7H7.5C6.83696 7 6.20107 6.73661 5.73223 6.26777C5.26339 5.79893 5 5.16304 5 4.5C5 3.83696 5.26339 3.20107 5.73223 2.73223C6.20107 2.26339 6.83696 2 7.5 2C11 2 12 7 12 7Z"/><path d="M12 7H16.5C17.163 7 17.7989 6.73661 18.2678 6.26777C18.7366 5.79893 19 5.16304 19 4.5C19 3.83696 18.7366 3.20107 18.2678 2.73223C17.7989 2.26339 17.163 2 16.5 2C13 2 12 7 12 7Z"/></svg>`;
      
      el.addEventListener('mouseenter', () => {
        el.style.transform = 'scale(1.2)';
      });
      el.addEventListener('mouseleave', () => {
        el.style.transform = 'scale(1)';
      });
      el.addEventListener('click', () => {
        setSelectedOrder(order);
      });

      const marker = new mapboxgl.Marker(el)
        .setLngLat([order.lng, order.lat])
        .addTo(map.current!);

      markersRef.current.push(marker);
    });

    // Fit bounds to show all markers
    if (geocodedOrders.length > 1) {
      const bounds = new mapboxgl.LngLatBounds();
      geocodedOrders.forEach(order => {
        bounds.extend([order.lng, order.lat]);
      });
      map.current.fitBounds(bounds, { padding: 50 });
    }

    return () => {
      markersRef.current.forEach(marker => marker.remove());
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [mapboxToken, open, loading, geocodedOrders]);

  const openInAppleMaps = (address: string) => {
    const encoded = encodeURIComponent(address);
    window.open(`https://maps.apple.com/?address=${encoded}`, '_blank');
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'Delivered': return 'default';
      case 'Shipped': return 'secondary';
      case 'Confirmed': return 'outline';
      default: return 'outline';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Orders Map
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 relative">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
              <div className="text-center">
                <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Loading map...</p>
              </div>
            </div>
          ) : geocodedOrders.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
              <div className="text-center">
                <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground">No orders with addresses to display</p>
              </div>
            </div>
          ) : null}
          
          <div ref={mapContainer} className="w-full h-full" />

          {/* Order Info Panel */}
          {selectedOrder && (
            <div className="absolute bottom-4 left-4 right-4 bg-background border rounded-lg shadow-lg p-4 max-w-sm">
              <button 
                onClick={() => setSelectedOrder(null)}
                className="absolute top-2 right-2 p-1 hover:bg-muted rounded"
              >
                <X className="h-4 w-4" />
              </button>
              
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{selectedOrder.customer_name || 'Unknown'}</h3>
                    <p className="text-sm text-muted-foreground">
                      Order #{selectedOrder.id.slice(0, 8)}
                    </p>
                  </div>
                  <Badge 
                    variant={getStatusBadgeVariant(selectedOrder.status)}
                    style={{ backgroundColor: statusColors[selectedOrder.status], color: 'white' }}
                  >
                    {selectedOrder.status}
                  </Badge>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">${selectedOrder.total.toFixed(2)}</span>
                </div>

                {selectedOrder.customer_address && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    onClick={() => openInAppleMaps(selectedOrder.customer_address!)}
                  >
                    <Navigation className="h-4 w-4 mr-2" />
                    Open in Apple Maps
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="absolute top-4 left-4 bg-background/90 backdrop-blur border rounded-lg p-3 text-xs">
            <p className="font-medium mb-2">Status Legend</p>
            <div className="space-y-1">
              {Object.entries(statusColors).map(([status, color]) => (
                <div key={status} className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: color }}
                  />
                  <span>{status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
