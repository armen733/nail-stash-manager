import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

// Precache build assets
precacheAndRoute(self.__WB_MANIFEST);

// Navigation: serve cached shell instantly, update in background.
// Much snappier on flaky mobile networks vs NetworkFirst.
const navigationRoute = new NavigationRoute(
  new StaleWhileRevalidate({
    cacheName: 'app-shell',
  }),
  {
    denylist: [/^\/~oauth/, /^\/auth\/callback/],
  }
);
registerRoute(navigationRoute);

// Cache product/salon GETs from Supabase REST so the app can browse offline.
// Reduced timeout (4s -> 2s) so slow networks fall back to cache faster.
registerRoute(
  ({ url, request }) =>
    request.method === 'GET' &&
    url.hostname.endsWith('.supabase.co') &&
    url.pathname.startsWith('/rest/v1/') &&
    /\/(products|salons|stock_locations|category_field_configs|category_variant_types|product_images|product_stock|tax_settings)(\?|$)/.test(
      url.pathname
    ),
  new NetworkFirst({
    cacheName: 'supabase-data',
    networkTimeoutSeconds: 2,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 24 * 60 * 60 }),
    ],
  })
);

// Cache product images
registerRoute(
  ({ request, url }) =>
    request.destination === 'image' &&
    (url.hostname.endsWith('.supabase.co') || url.pathname.startsWith('/')),
  new CacheFirst({
    cacheName: 'images',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  })
);

// Cache fonts/css/js
registerRoute(
  ({ request }) => ['style', 'font', 'script'].includes(request.destination),
  new StaleWhileRevalidate({ cacheName: 'static-assets' })
);

// Allow client to trigger immediate activation of new SW
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// === Push notifications ===
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  const title = data.title || 'New Order';
  const options = {
    body: data.body || 'A new customer order has been placed',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'order-notification',
    requireInteraction: true,
    data: { url: data.url || '/orders' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url || '/orders'));
});
