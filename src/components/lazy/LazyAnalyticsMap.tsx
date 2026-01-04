import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';

// Lazy load the heavy AnalyticsMap component (default export)
const AnalyticsMap = lazy(() => import('@/components/analytics/AnalyticsMap'));

interface LazyAnalyticsMapProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dateRange?: { from: Date; to: Date };
}

const MapLoader = () => (
  <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
    <div className="flex flex-col items-center gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <span className="text-sm text-muted-foreground">Loading analytics map...</span>
    </div>
  </div>
);

export const LazyAnalyticsMap = (props: LazyAnalyticsMapProps) => {
  // Only render the map component when it's open
  if (!props.open) return null;
  
  return (
    <Suspense fallback={<MapLoader />}>
      <AnalyticsMap {...props} />
    </Suspense>
  );
};
