import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import type { SupplyStorePin } from "@/components/supply-stores/SupplyStoresMap";

const SupplyStoresMap = lazy(() => import("@/components/supply-stores/SupplyStoresMap"));

const Loading = () => (
  <div className="h-[550px] flex items-center justify-center rounded-lg border border-border">
    <Loader2 className="h-6 w-6 animate-spin text-primary" />
  </div>
);

export const LazySupplyStoresMap = ({ stores, fullScreen }: { stores: SupplyStorePin[]; fullScreen?: boolean }) => (
  <Suspense fallback={<Loading />}>
    <SupplyStoresMap stores={stores} fullScreen={fullScreen} />
  </Suspense>
);
