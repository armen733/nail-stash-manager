import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';

// Lazy load the heavy OrdersMap component (named export)
const OrdersMap = lazy(() => import('@/components/orders/OrdersMap').then(m => ({ default: m.OrdersMap })));

interface LazyOrdersMapProps {
  orders: Array<{
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
    order_items?: Array<{
      id: string;
      quantity: number;
      unit_price: number;
      products: {
        name: string;
        image_url?: string | null;
      } | null;
    }>;
  }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusChange?: (orderId: string, newStatus: string) => void;
}

const MapLoader = () => (
  <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
    <div className="flex flex-col items-center gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <span className="text-sm text-muted-foreground">Loading map...</span>
    </div>
  </div>
);

export const LazyOrdersMap = (props: LazyOrdersMapProps) => {
  // Only render the map component when it's open
  if (!props.open) return null;
  
  return (
    <Suspense fallback={<MapLoader />}>
      <OrdersMap {...props} />
    </Suspense>
  );
};
