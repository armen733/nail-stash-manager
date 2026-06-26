/**
 * Route prefetching utility for better navigation performance
 * Preloads route chunks when user hovers over navigation links
 */

// Map of routes to their lazy import functions
const routeImports: Record<string, () => Promise<unknown>> = {
  '/': () => import('@/pages/Index'),
  '/products': () => import('@/pages/Products'),
  
  '/salons': () => import('@/pages/Salons'),
  '/orders': () => import('@/pages/Orders'),
  '/users': () => import('@/pages/Users'),
  '/promotions': () => import('@/pages/Promotions'),
  '/analytics': () => import('@/pages/Analytics'),
  '/profile': () => import('@/pages/Profile'),
};

// Track which routes have been prefetched to avoid duplicate requests
const prefetchedRoutes = new Set<string>();

/**
 * Prefetch a route's JavaScript chunk
 * @param route - The route path to prefetch
 */
export const prefetchRoute = (route: string) => {
  // Skip if already prefetched or no import function exists
  if (prefetchedRoutes.has(route) || !routeImports[route]) {
    return;
  }

  // Mark as prefetched immediately to prevent race conditions
  prefetchedRoutes.add(route);

  // Use requestIdleCallback if available, otherwise setTimeout
  const schedulePreload = window.requestIdleCallback || ((cb) => setTimeout(cb, 1));

  schedulePreload(() => {
    routeImports[route]().catch(() => {
      // If prefetch fails, remove from set so it can be tried again
      prefetchedRoutes.delete(route);
    });
  });
};

/**
 * Create onMouseEnter handler for prefetching
 * @param route - The route path to prefetch on hover
 */
export const createPrefetchHandler = (route: string) => {
  return () => prefetchRoute(route);
};

/**
 * Prefetch multiple routes at once (useful for likely next pages)
 * @param routes - Array of route paths to prefetch
 */
export const prefetchRoutes = (routes: string[]) => {
  routes.forEach(prefetchRoute);
};

/**
 * Check if a route has been prefetched
 * @param route - The route path to check
 */
export const isRoutePrefetched = (route: string): boolean => {
  return prefetchedRoutes.has(route);
};
