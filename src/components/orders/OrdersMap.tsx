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
  const [selectedClusterOrders, setSelectedClusterOrders] = useState<GeocodedOrder[]>([]);
  const [geocodedOrders, setGeocodedOrders] = useState<GeocodedOrder[]>([]);
  const [loading, setLoading] = useState(true);

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

  // Initialize map with clustering
  useEffect(() => {
    if (!mapContainer.current || !mapboxToken || !open || loading) return;

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
        : [-118.2437, 34.0522],
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.current.on('load', () => {
      if (!map.current) return;

      // Create GeoJSON from orders
      const geojsonData: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: geocodedOrders.map((order) => ({
          type: 'Feature',
          properties: {
            id: order.id,
            customer_name: order.customer_name,
            customer_address: order.customer_address,
            total: order.total,
            status: order.status,
            order_date: order.order_date,
            statusColor: statusColors[order.status] || '#6b7280',
          },
          geometry: {
            type: 'Point',
            coordinates: [order.lng, order.lat],
          },
        })),
      };

      // Add clustered source
      map.current.addSource('orders', {
        type: 'geojson',
        data: geojsonData,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });

      // Cluster circles
      map.current.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'orders',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step',
            ['get', 'point_count'],
            '#3b82f6',  // Blue for small clusters
            5, '#8b5cf6',  // Purple for medium
            10, '#22c55e', // Green for large
          ],
          'circle-radius': [
            'step',
            ['get', 'point_count'],
            20,   // 20px for small clusters
            5, 25,  // 25px for 5+
            10, 30, // 30px for 10+
          ],
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
        },
      });

      // Cluster count label
      map.current.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'orders',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 14,
        },
        paint: {
          'text-color': '#ffffff',
        },
      });

      // Individual order markers
      map.current.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: 'orders',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['get', 'statusColor'],
          'circle-radius': 12,
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
        },
      });

      // Click on cluster to zoom in or show orders list
      map.current.on('click', 'clusters', async (e) => {
        if (!map.current || !e.features?.[0]) return;
        
        const feature = e.features[0];
        const clusterId = feature.properties?.cluster_id;
        const source = map.current.getSource('orders') as mapboxgl.GeoJSONSource;
        
        // Get cluster expansion zoom
        source.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err || !map.current) return;

          const coordinates = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
          
          // If we're already at max zoom for clusters, show orders list
          if (zoom && zoom >= 14) {
            source.getClusterLeaves(clusterId, 100, 0, (err, leaves) => {
              if (err || !leaves) return;
              
              const clusterOrders: GeocodedOrder[] = leaves.map((leaf: any) => ({
                id: leaf.properties.id,
                customer_name: leaf.properties.customer_name,
                customer_address: leaf.properties.customer_address,
                total: leaf.properties.total,
                status: leaf.properties.status,
                order_date: leaf.properties.order_date,
                lng: (leaf.geometry as GeoJSON.Point).coordinates[0],
                lat: (leaf.geometry as GeoJSON.Point).coordinates[1],
              }));
              
              setSelectedClusterOrders(clusterOrders);
              setSelectedOrder(null);
            });
          } else {
            map.current.easeTo({
              center: coordinates,
              zoom: zoom || 14,
            });
          }
        });
      });

      // Click on individual marker
      map.current.on('click', 'unclustered-point', (e) => {
        if (!e.features?.[0]) return;
        
        const props = e.features[0].properties;
        const coords = (e.features[0].geometry as GeoJSON.Point).coordinates;
        
        setSelectedOrder({
          id: props?.id,
          customer_name: props?.customer_name,
          customer_address: props?.customer_address,
          total: props?.total,
          status: props?.status,
          order_date: props?.order_date,
          lng: coords[0],
          lat: coords[1],
        });
        setSelectedClusterOrders([]);
      });

      // Cursor styles
      map.current.on('mouseenter', 'clusters', () => {
        if (map.current) map.current.getCanvas().style.cursor = 'pointer';
      });
      map.current.on('mouseleave', 'clusters', () => {
        if (map.current) map.current.getCanvas().style.cursor = '';
      });
      map.current.on('mouseenter', 'unclustered-point', () => {
        if (map.current) map.current.getCanvas().style.cursor = 'pointer';
      });
      map.current.on('mouseleave', 'unclustered-point', () => {
        if (map.current) map.current.getCanvas().style.cursor = '';
      });
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
      <DialogContent className="max-w-none w-screen h-screen flex flex-col p-0 rounded-none">
        <DialogHeader className="p-4 pb-0 absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-background/90 to-transparent">
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

          {/* Single Order Info Panel */}
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

          {/* Cluster Orders List Panel */}
          {selectedClusterOrders.length > 0 && (
            <div className="absolute bottom-4 left-4 right-4 bg-background border rounded-lg shadow-lg p-4 max-w-sm max-h-[300px] overflow-y-auto">
              <button 
                onClick={() => setSelectedClusterOrders([])}
                className="absolute top-2 right-2 p-1 hover:bg-muted rounded z-10"
              >
                <X className="h-4 w-4" />
              </button>
              
              <h3 className="font-semibold mb-3">{selectedClusterOrders.length} Orders in this area</h3>
              
              <div className="space-y-2">
                {selectedClusterOrders.map((order) => (
                  <div 
                    key={order.id}
                    className="p-2 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => {
                      setSelectedOrder(order);
                      setSelectedClusterOrders([]);
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{order.customer_name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">${order.total.toFixed(2)}</p>
                      </div>
                      <Badge 
                        variant="outline"
                        className="shrink-0 text-xs"
                        style={{ backgroundColor: statusColors[order.status], color: 'white', borderColor: 'transparent' }}
                      >
                        {order.status}
                      </Badge>
                    </div>
                  </div>
                ))}
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
            <div className="border-t mt-2 pt-2">
              <p className="text-muted-foreground">Click clusters to zoom or view orders</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
