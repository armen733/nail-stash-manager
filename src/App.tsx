import { Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider, useTheme } from "next-themes";
import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ManagerRoute } from "@/components/ManagerRoute";
import { useSwipeGesture } from "@/hooks/useSwipeGesture";
import { useIsMobile } from "@/hooks/use-mobile";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import logoLight from "@/assets/nera-logo-transparent.png";
import logoDark from "@/assets/nera-logo-dark.png";
import { BottomNav } from "@/components/BottomNav";

// Lazy load pages for better performance (retry + reload on stale chunks)
const Index = lazyWithRetry(() => import("./pages/Index"));
const Auth = lazyWithRetry(() => import("./pages/Auth"));
const Products = lazyWithRetry(() => import("./pages/Products"));
const Salons = lazyWithRetry(() => import("./pages/Salons"));
const Orders = lazyWithRetry(() => import("./pages/Orders"));
const Profile = lazyWithRetry(() => import("./pages/Profile"));
const Analytics = lazyWithRetry(() => import("./pages/Analytics"));

const Warehouse = lazyWithRetry(() => import("./pages/Warehouse"));
const WarehouseLocationDetail = lazyWithRetry(() => import("./pages/WarehouseLocationDetail"));
const Users = lazyWithRetry(() => import("./pages/Users"));
const Promotions = lazyWithRetry(() => import("./pages/Promotions"));
const VisitTracker = lazyWithRetry(() => import("./pages/VisitTracker"));
const SalonProfile = lazyWithRetry(() => import("./pages/SalonProfile"));
const Referrals = lazyWithRetry(() => import("./pages/Referrals"));
const ReferrerProfile = lazyWithRetry(() => import("./pages/ReferrerProfile"));
const NotFound = lazyWithRetry(() => import("./pages/NotFound"));
const AuditLog = lazyWithRetry(() => import("./pages/AuditLog"));
const SupplyStores = lazyWithRetry(() => import("./pages/SupplyStores"));


// Configure React Query with better caching defaults
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes - data won't refetch if fresh
      gcTime: 1000 * 60 * 30, // 30 minutes - keep in cache
      refetchOnWindowFocus: false, // Don't refetch when window regains focus
      retry: 1, // Only retry failed requests once
    },
  },
});

// Loading fallback component
const PageLoader = () => (
  <div className="min-h-[50vh] flex items-center justify-center">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
  </div>
);

// Inner layout component that can access sidebar context
const AppLayoutInner = ({ children }: { children: React.ReactNode }) => {
  const { theme, resolvedTheme } = useTheme();
  const currentTheme = theme === "system" ? resolvedTheme : theme;
  const logo = currentTheme === "dark" ? logoDark : logoLight;
  const { setOpen, setOpenMobile, isMobile, openMobile } = useSidebar();

  // Add swipe gestures for mobile
  useSwipeGesture({
    onSwipeRight: () => {
      if (isMobile) {
        setOpenMobile(true);
      } else {
        setOpen(true);
      }
    },
    onSwipeLeft: () => {
      if (isMobile) {
        setOpenMobile(false);
      } else {
        setOpen(false);
      }
    },
    threshold: 50,
    edgeWidth: 40,
  });

  return (
    <div className="h-screen flex w-full safe-left safe-right overflow-hidden">
      <AppSidebar />
      
      {/* Mobile backdrop overlay */}
      {isMobile && openMobile && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 animate-fade-in"
          onClick={() => setOpenMobile(false)}
          aria-hidden="true"
        />
      )}
      
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <header className="border-b bg-card flex items-center justify-center px-4 relative flex-shrink-0 sticky top-0 z-50 py-3 md:py-6 pt-[max(env(safe-area-inset-top,0px),12px)] md:pt-[max(env(safe-area-inset-top,0px),24px)]">
          <SidebarTrigger className="absolute left-4 top-1/2 -translate-y-1/2" />
          <img 
            src={logo} 
            alt="NÉRA Beauty" 
            className="h-14 sm:h-16 md:h-20 lg:h-24 w-auto object-contain"
            style={{ background: 'transparent' }}
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <OfflineIndicator />
          </div>
        </header>
        <div className="flex-1 p-3 sm:p-4 md:p-6 safe-bottom">
          <Suspense fallback={<PageLoader />}>
            {children}
          </Suspense>
        </div>
      </main>
    </div>
  );
};

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <SidebarProvider>
      <AppLayoutInner>{children}</AppLayoutInner>
    </SidebarProvider>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <Routes>
            <Route path="/auth" element={
              <Suspense fallback={<PageLoader />}>
                <Auth />
              </Suspense>
            } />
            {/* Manager-only routes */}
            <Route
              path="/"
              element={
                <ManagerRoute>
                  <AppLayout>
                    <Index />
                  </AppLayout>
                </ManagerRoute>
              }
            />
            <Route
              path="/products"
              element={
                <ManagerRoute>
                  <AppLayout>
                    <Products />
                  </AppLayout>
                </ManagerRoute>
              }
            />
            <Route
              path="/warehouse"
              element={
                <ManagerRoute>
                  <AppLayout>
                    <Warehouse />
                  </AppLayout>
                </ManagerRoute>
              }
            />
            <Route
              path="/warehouse/:id"
              element={
                <ManagerRoute>
                  <AppLayout>
                    <WarehouseLocationDetail />
                  </AppLayout>
                </ManagerRoute>
              }
            />
            <Route
              path="/salons"
              element={
                <ManagerRoute>
                  <AppLayout>
                    <Salons />
                  </AppLayout>
                </ManagerRoute>
              }
            />
            <Route
              path="/users"
              element={
                <ManagerRoute>
                  <AppLayout>
                    <Users />
                  </AppLayout>
                </ManagerRoute>
              }
            />
            <Route
              path="/analytics"
              element={
                <ManagerRoute>
                  <AppLayout>
                    <Analytics />
                  </AppLayout>
                </ManagerRoute>
              }
            />
            <Route
              path="/promotions"
              element={
                <ManagerRoute>
                  <AppLayout>
                    <Promotions />
                  </AppLayout>
                </ManagerRoute>
              }
            />
            <Route
              path="/visit-tracker"
              element={
                <ManagerRoute>
                  <AppLayout>
                    <VisitTracker />
                  </AppLayout>
                </ManagerRoute>
              }
            />
            <Route
              path="/salons/:id"
              element={
                <ManagerRoute>
                  <AppLayout>
                    <SalonProfile />
                  </AppLayout>
                </ManagerRoute>
              }
            />
            <Route
              path="/referrals"
              element={
                <ManagerRoute>
                  <AppLayout>
                    <Referrals />
                  </AppLayout>
                </ManagerRoute>
              }
            />
            <Route
              path="/referrals/:id"
              element={
                <ManagerRoute>
                  <AppLayout>
                    <ReferrerProfile />
                  </AppLayout>
                </ManagerRoute>
              }
            />
            <Route
              path="/supply-stores"
              element={
                <ManagerRoute>
                  <AppLayout>
                    <SupplyStores />
                  </AppLayout>
                </ManagerRoute>
              }
            />
            <Route
              path="/audit-log"
              element={
                <ManagerRoute>
                  <AppLayout>
                    <AuditLog />
                  </AppLayout>
                </ManagerRoute>
              }
            />
            {/* Routes accessible by all users */}
            <Route
              path="/orders"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Orders />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Profile />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route path="*" element={
              <Suspense fallback={<PageLoader />}>
                <NotFound />
              </Suspense>
            } />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
