import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider, useTheme } from "next-themes";
import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ManagerRoute } from "@/components/ManagerRoute";
import { useSwipeGesture } from "@/hooks/useSwipeGesture";
import { useIsMobile } from "@/hooks/use-mobile";
import logoLight from "@/assets/nera-logo-transparent.png";
import logoDark from "@/assets/nera-logo-dark.png";
import { BottomNav } from "@/components/BottomNav";

// Lazy load pages for better performance
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const Products = lazy(() => import("./pages/Products"));
const Salons = lazy(() => import("./pages/Salons"));
const Orders = lazy(() => import("./pages/Orders"));
const Profile = lazy(() => import("./pages/Profile"));
const Analytics = lazy(() => import("./pages/Analytics"));
const LowStock = lazy(() => import("./pages/LowStock"));
const Users = lazy(() => import("./pages/Users"));
const Promotions = lazy(() => import("./pages/Promotions"));
const NotFound = lazy(() => import("./pages/NotFound"));

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
            className="h-10 sm:h-14 md:h-20 lg:h-24 w-auto object-contain"
            style={{ background: 'transparent' }}
          />
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
              path="/low-stock"
              element={
                <ManagerRoute>
                  <AppLayout>
                    <LowStock />
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
