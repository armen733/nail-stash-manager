import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MapPin, Navigation, Package, X, ChevronDown, ChevronUp, Route, Loader2, GripVertical, Search, Flame, Phone, Mail, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface OrderItemForMap {
  id: string;
  quantity: number;
  unit_price: number;
  products: {
    name: string;
    image_url?: string | null;
  } | null;
}

interface OrderForMap {
  id: string;
  customer_name: string | null;
  customer_address: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  total: number;
  subtotal: number;
  tax: number;
  status: string;
  order_date: string;
  notes: string | null;
  order_items?: OrderItemForMap[];
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
  const [legendVisible, setLegendVisible] = useState(true);
  const [statusFilters, setStatusFilters] = useState<Set<string>>(new Set(Object.keys(statusColors)));
  const [optimizedRoute, setOptimizedRoute] = useState<GeocodedOrder[] | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [showRoute, setShowRoute] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showHeatmap, setShowHeatmap] = useState(false);
  const { toast } = useToast();

  // Filter by status and search term
  const filteredGeocodedOrders = geocodedOrders.filter(o => {
    const matchesStatus = statusFilters.has(o.status);
    const matchesSearch = !searchTerm || 
      o.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.customer_address?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.customer_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.id.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  // Search results for dropdown
  const searchResults = searchTerm.length >= 2 
    ? geocodedOrders.filter(o => 
        o.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.customer_address?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.id.toLowerCase().includes(searchTerm.toLowerCase())
      ).slice(0, 5)
    : [];

  const toggleStatusFilter = (status: string) => {
    setStatusFilters(prev => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

  const selectAllStatuses = () => {
    setStatusFilters(new Set(Object.keys(statusColors)));
  };

  const clearAllStatuses = () => {
    setStatusFilters(new Set());
  };

  // Optimize route using Mapbox Optimization API (or nearest neighbor algorithm)
  const optimizeRoute = async () => {
    if (filteredGeocodedOrders.length < 2) {
      toast({
        title: "Not enough orders",
        description: "Need at least 2 orders with addresses to optimize a route.",
        variant: "destructive",
      });
      return;
    }

    if (filteredGeocodedOrders.length > 12) {
      toast({
        title: "Too many orders",
        description: "Route optimization works best with 12 or fewer stops. Using nearest neighbor algorithm.",
      });
    }

    setIsOptimizing(true);

    try {
      // Use Mapbox Optimization API for up to 12 waypoints
      if (filteredGeocodedOrders.length <= 12 && mapboxToken) {
        const coordinates = filteredGeocodedOrders.map(o => `${o.lng},${o.lat}`).join(';');
        const response = await fetch(
          `https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coordinates}?access_token=${mapboxToken}&roundtrip=false&source=first&destination=last&geometries=geojson`
        );
        const data = await response.json();

        if (data.trips && data.trips[0]) {
          const waypoints = data.waypoints;
          const orderedOrders = waypoints
            .sort((a: any, b: any) => a.waypoint_index - b.waypoint_index)
            .map((wp: any) => filteredGeocodedOrders[wp.waypoint_index]);
          
          setOptimizedRoute(orderedOrders);
          setShowRoute(true);
          
          // Draw the route on the map
          drawRoute(data.trips[0].geometry);
          
          toast({
            title: "Route optimized!",
            description: `Optimized route for ${orderedOrders.length} stops. Total distance: ${(data.trips[0].distance / 1609.34).toFixed(1)} miles`,
          });
        }
      } else {
        // Fallback: Simple nearest neighbor algorithm
        const optimized = nearestNeighborRoute(filteredGeocodedOrders);
        setOptimizedRoute(optimized);
        setShowRoute(true);
        
        // Draw simple polyline
        drawSimpleRoute(optimized);
        
        toast({
          title: "Route calculated",
          description: `Created route for ${optimized.length} stops using nearest neighbor algorithm.`,
        });
      }
    } catch (err) {
      console.error('Route optimization failed:', err);
      toast({
        title: "Optimization failed",
        description: "Could not optimize route. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsOptimizing(false);
    }
  };

  // Simple nearest neighbor algorithm
  const nearestNeighborRoute = (orders: GeocodedOrder[]): GeocodedOrder[] => {
    if (orders.length <= 1) return orders;
    
    const result: GeocodedOrder[] = [];
    const remaining = [...orders];
    
    // Start with the first order
    result.push(remaining.shift()!);
    
    while (remaining.length > 0) {
      const last = result[result.length - 1];
      let nearestIdx = 0;
      let nearestDist = Infinity;
      
      remaining.forEach((order, idx) => {
        const dist = Math.sqrt(
          Math.pow(order.lng - last.lng, 2) + Math.pow(order.lat - last.lat, 2)
        );
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIdx = idx;
        }
      });
      
      result.push(remaining.splice(nearestIdx, 1)[0]);
    }
    
    return result;
  };

  // Draw optimized route on map
  const drawRoute = (geometry: GeoJSON.Geometry) => {
    if (!map.current) return;

    // Remove existing route layer
    if (map.current.getSource('route')) {
      map.current.removeLayer('route-line');
      map.current.removeSource('route');
    }

    map.current.addSource('route', {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry,
      },
    });

    map.current.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route',
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-color': '#3b82f6',
        'line-width': 4,
        'line-opacity': 0.8,
      },
    });
  };

  // Draw simple polyline for fallback
  const drawSimpleRoute = (orders: GeocodedOrder[]) => {
    if (!map.current || orders.length < 2) return;

    const coordinates = orders.map(o => [o.lng, o.lat]);

    // Remove existing route layer
    if (map.current.getSource('route')) {
      map.current.removeLayer('route-line');
      map.current.removeSource('route');
    }

    map.current.addSource('route', {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates,
        },
      },
    });

    map.current.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route',
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-color': '#3b82f6',
        'line-width': 4,
        'line-opacity': 0.8,
        'line-dasharray': [2, 1],
      },
    });
  };

  // Clear route
  const clearRoute = () => {
    setOptimizedRoute(null);
    setShowRoute(false);
    setDraggedIndex(null);
    setDragOverIndex(null);
    
    if (map.current && map.current.getSource('route')) {
      map.current.removeLayer('route-line');
      map.current.removeSource('route');
    }
  };

  // Drag and drop handlers for manual reordering
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || !optimizedRoute) return;

    const newRoute = [...optimizedRoute];
    const [draggedItem] = newRoute.splice(draggedIndex, 1);
    newRoute.splice(dropIndex, 0, draggedItem);

    setOptimizedRoute(newRoute);
    setDraggedIndex(null);
    setDragOverIndex(null);

    // Redraw the route line
    drawSimpleRoute(newRoute);

    toast({
      title: "Route updated",
      description: "Stop order has been changed.",
    });
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

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

  // Initialize map ONCE when opened (not when filters change)
  useEffect(() => {
    if (!mapContainer.current || !mapboxToken || !open || loading) return;

    if (map.current) return; // Don't reinitialize if map exists

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

      // Create GeoJSON from ALL orders
      const geojsonData: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: geocodedOrders.map((order) => ({
          type: 'Feature',
          properties: {
            id: order.id,
            customer_name: order.customer_name,
            customer_address: order.customer_address,
            customer_email: order.customer_email,
            customer_phone: order.customer_phone,
            total: order.total,
            subtotal: order.subtotal,
            tax: order.tax,
            status: order.status,
            order_date: order.order_date,
            notes: order.notes,
            order_items: JSON.stringify(order.order_items || []),
            statusColor: statusColors[order.status] || '#6b7280',
          },
          geometry: {
            type: 'Point',
            coordinates: [order.lng, order.lat],
          },
        })),
      };

      // Add heatmap source (separate from clustered source)
      map.current.addSource('orders-heat', {
        type: 'geojson',
        data: geojsonData,
      });

      // Heatmap layer (initially hidden)
      map.current.addLayer({
        id: 'orders-heatmap',
        type: 'heatmap',
        source: 'orders-heat',
        paint: {
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'total'], 0, 0, 100, 1],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 3],
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(33,102,172,0)',
            0.2, 'rgb(103,169,207)',
            0.4, 'rgb(209,229,240)',
            0.6, 'rgb(253,219,199)',
            0.8, 'rgb(239,138,98)',
            1, 'rgb(178,24,43)'
          ],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 2, 9, 20],
          'heatmap-opacity': 0.7,
        },
        layout: {
          visibility: 'none',
        },
      });

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
                customer_email: leaf.properties.customer_email || null,
                customer_phone: leaf.properties.customer_phone || null,
                total: leaf.properties.total,
                subtotal: leaf.properties.subtotal || 0,
                tax: leaf.properties.tax || 0,
                status: leaf.properties.status,
                order_date: leaf.properties.order_date,
                notes: leaf.properties.notes || null,
                order_items: leaf.properties.order_items ? JSON.parse(leaf.properties.order_items) : [],
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
          customer_email: props?.customer_email || null,
          customer_phone: props?.customer_phone || null,
          total: props?.total,
          subtotal: props?.subtotal || 0,
          tax: props?.tax || 0,
          status: props?.status,
          order_date: props?.order_date,
          notes: props?.notes || null,
          order_items: props?.order_items ? JSON.parse(props.order_items) : [],
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

      // Fit bounds to show all markers
      if (geocodedOrders.length >= 1) {
        const bounds = new mapboxgl.LngLatBounds();
        geocodedOrders.forEach(order => {
          bounds.extend([order.lng, order.lat]);
        });
        map.current.fitBounds(bounds, { padding: 80, maxZoom: 12 });
      }
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [mapboxToken, open, loading, geocodedOrders]);

  // Update map data when filters change (without re-initializing map)
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    const geojsonData: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: filteredGeocodedOrders.map((order) => ({
        type: 'Feature',
        properties: {
          id: order.id,
          customer_name: order.customer_name,
          customer_address: order.customer_address,
          customer_email: order.customer_email,
          customer_phone: order.customer_phone,
          total: order.total,
          subtotal: order.subtotal,
          tax: order.tax,
          status: order.status,
          order_date: order.order_date,
          notes: order.notes,
          order_items: JSON.stringify(order.order_items || []),
          statusColor: statusColors[order.status] || '#6b7280',
        },
        geometry: {
          type: 'Point',
          coordinates: [order.lng, order.lat],
        },
      })),
    };

    const ordersSource = map.current.getSource('orders') as mapboxgl.GeoJSONSource;
    const heatSource = map.current.getSource('orders-heat') as mapboxgl.GeoJSONSource;
    
    if (ordersSource) ordersSource.setData(geojsonData);
    if (heatSource) heatSource.setData(geojsonData);
  }, [filteredGeocodedOrders]);

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
      <DialogContent className="max-w-none w-screen h-screen flex flex-col p-0 rounded-none [&>button]:hidden">
        <DialogHeader className="p-4 pb-0 absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-background/90 to-transparent">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Orders Map
            </DialogTitle>
            <div className="flex items-center gap-1">
              {/* Heatmap Toggle */}
              <Button 
                variant={showHeatmap ? "default" : "outline"}
                size="sm" 
                className="h-7 text-xs px-2 bg-background/80 backdrop-blur"
                onClick={() => {
                  setShowHeatmap(!showHeatmap);
                  if (map.current && map.current.getLayer('orders-heatmap')) {
                    map.current.setLayoutProperty(
                      'orders-heatmap',
                      'visibility',
                      !showHeatmap ? 'visible' : 'none'
                    );
                  }
                }}
              >
                <Flame className="h-3 w-3 mr-1" />
                Heatmap
              </Button>
              {/* Route Optimization Button */}
              {!showRoute ? (
                <Button 
                  variant="default" 
                  size="sm" 
                  className="h-7 text-xs px-2 bg-primary/90 backdrop-blur"
                  onClick={optimizeRoute}
                  disabled={isOptimizing || filteredGeocodedOrders.length < 2}
                >
                  {isOptimizing ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Route className="h-3 w-3 mr-1" />
                  )}
                  {isOptimizing ? 'Working...' : 'Route'}
                </Button>
              ) : (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-7 text-xs px-2 bg-background/80 backdrop-blur"
                  onClick={clearRoute}
                >
                  <X className="h-3 w-3 mr-1" />
                  Clear
                </Button>
              )}
              <Button 
                variant="outline" 
                size="icon" 
                className="h-9 w-9 bg-background/80 backdrop-blur"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
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

          {/* Search Bar - positioned below header, between filter and route panels */}
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-10 w-full max-w-[200px]">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search orders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-8 text-xs bg-background/90 backdrop-blur border shadow-lg"
              />
              {searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-lg shadow-lg overflow-hidden z-30">
                  {searchResults.map((order) => (
                    <button
                      key={order.id}
                      className="w-full text-left p-2 hover:bg-muted/50 text-sm border-b last:border-b-0"
                      onClick={() => {
                        setSelectedOrder(order);
                        setSearchTerm("");
                        if (map.current) {
                          map.current.flyTo({ center: [order.lng, order.lat], zoom: 14 });
                        }
                      }}
                    >
                      <p className="font-medium truncate">{order.customer_name || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground truncate">{order.customer_address}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Detailed Order Info Panel */}
          {selectedOrder && (
            <div className="absolute bottom-4 left-4 bg-background border rounded-lg shadow-lg max-w-sm max-h-[60vh] overflow-hidden flex flex-col">
              <div className="p-4 border-b flex items-start justify-between gap-2 shrink-0">
                <div>
                  <h3 className="font-semibold">{selectedOrder.customer_name || 'Unknown'}</h3>
                  <p className="text-sm text-muted-foreground">
                    Order #{selectedOrder.id.slice(0, 8)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge 
                    style={{ backgroundColor: statusColors[selectedOrder.status], color: 'white' }}
                  >
                    {selectedOrder.status}
                  </Badge>
                  <button 
                    onClick={() => setSelectedOrder(null)}
                    className="p-1 hover:bg-muted rounded"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {/* Customer Info */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase">Customer</h4>
                    <div className="space-y-1 text-sm">
                      {selectedOrder.customer_email && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-3 w-3 text-muted-foreground" />
                          <span className="truncate">{selectedOrder.customer_email}</span>
                        </div>
                      )}
                      {selectedOrder.customer_phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          <span>{selectedOrder.customer_phone}</span>
                        </div>
                      )}
                      {selectedOrder.customer_address && (
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-xs">{selectedOrder.customer_address}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        <span>{new Date(selectedOrder.order_date).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Order Items */}
                  {selectedOrder.order_items && selectedOrder.order_items.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-medium text-muted-foreground uppercase">Items ({selectedOrder.order_items.length})</h4>
                      <div className="space-y-2">
                        {selectedOrder.order_items.map((item) => (
                          <div key={item.id} className="flex items-center gap-2 bg-muted/50 rounded p-2">
                            {item.products?.image_url ? (
                              <img 
                                src={item.products.image_url} 
                                alt={item.products?.name || ''} 
                                className="w-8 h-8 rounded object-cover"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded bg-muted flex items-center justify-center">
                                <Package className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{item.products?.name || 'Product'}</p>
                              <p className="text-xs text-muted-foreground">× {item.quantity}</p>
                            </div>
                            <span className="text-sm font-medium">${(item.quantity * item.unit_price).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {selectedOrder.notes && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-medium text-muted-foreground uppercase">Notes</h4>
                      <p className="text-sm bg-muted/50 rounded p-2">{selectedOrder.notes}</p>
                    </div>
                  )}

                  {/* Totals */}
                  <div className="space-y-1 pt-2 border-t">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span>${selectedOrder.subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tax</span>
                      <span>${selectedOrder.tax.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-semibold">
                      <span>Total</span>
                      <span className="text-primary">${selectedOrder.total.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Actions */}
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
              </ScrollArea>
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

          {/* Filter Legend */}
          <div className="absolute top-4 left-4 bg-background/90 backdrop-blur border rounded-lg text-xs overflow-hidden min-w-[160px] z-20">
            <button 
              onClick={() => setLegendVisible(!legendVisible)}
              className="w-full flex items-center justify-between gap-2 p-3 hover:bg-muted/50 transition-colors"
            >
              <span className="font-medium">Filter by Status</span>
              {legendVisible ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>
            {legendVisible && (
              <div className="px-3 pb-3">
                <div className="flex gap-1 mb-2">
                  <button
                    onClick={selectAllStatuses}
                    className="text-[10px] px-2 py-0.5 rounded bg-muted hover:bg-muted/80 transition-colors"
                  >
                    All
                  </button>
                  <button
                    onClick={clearAllStatuses}
                    className="text-[10px] px-2 py-0.5 rounded bg-muted hover:bg-muted/80 transition-colors"
                  >
                    None
                  </button>
                </div>
                <div className="space-y-1">
                  {Object.entries(statusColors).map(([status, color]) => (
                    <label 
                      key={status} 
                      className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={statusFilters.has(status)}
                        onChange={() => toggleStatusFilter(status)}
                        className="rounded border-muted-foreground/50"
                      />
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: color }}
                      />
                      <span className={statusFilters.has(status) ? '' : 'text-muted-foreground'}>{status}</span>
                    </label>
                  ))}
                </div>
                <div className="border-t mt-2 pt-2 text-muted-foreground">
                  <p>Showing {filteredGeocodedOrders.length} of {geocodedOrders.length} orders</p>
                </div>
              </div>
            )}
          </div>

          {/* Optimized Route Panel - positioned on the right side */}
          {showRoute && optimizedRoute && (
            <div className="absolute top-4 right-4 bg-background/90 backdrop-blur border rounded-lg text-xs overflow-hidden max-w-[220px] max-h-[60vh] z-10">
              <div className="p-3 border-b bg-primary/10">
                <div className="flex items-center gap-2">
                  <Route className="h-4 w-4 text-primary" />
                  <span className="font-medium">Delivery Route</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {optimizedRoute.length} stops • Drag to reorder
                </p>
              </div>
              <div className="overflow-y-auto max-h-[calc(60vh-60px)]">
                {optimizedRoute.map((order, index) => (
                  <div 
                    key={order.id}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`p-2 border-b last:border-b-0 transition-all cursor-grab active:cursor-grabbing ${
                      draggedIndex === index 
                        ? 'opacity-50 bg-muted' 
                        : dragOverIndex === index 
                          ? 'bg-primary/20 border-primary' 
                          : 'hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex items-center gap-1">
                        <GripVertical className="h-3 w-3 text-muted-foreground" />
                        <div className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold shrink-0">
                          {index + 1}
                        </div>
                      </div>
                      <div 
                        className="min-w-0 flex-1 cursor-pointer"
                        onClick={() => {
                          setSelectedOrder(order);
                          if (map.current) {
                            map.current.flyTo({ center: [order.lng, order.lat], zoom: 14 });
                          }
                        }}
                      >
                        <p className="font-medium truncate">{order.customer_name || 'Unknown'}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{order.customer_address}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
