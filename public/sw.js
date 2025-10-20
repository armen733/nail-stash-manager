self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  const title = data.title || 'New Order';
  const options = {
    body: data.body || 'A new customer order has been placed',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'order-notification',
    requireInteraction: true,
    data: {
      url: data.url || '/orders'
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/orders')
  );
});
