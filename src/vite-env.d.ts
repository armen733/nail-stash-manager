/// <reference types="vite/client" />

// Extend ServiceWorkerRegistration with Push API types
interface ServiceWorkerRegistration {
  readonly pushManager: PushManager;
}
