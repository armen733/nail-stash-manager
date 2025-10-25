import { supabase } from "@/integrations/supabase/client";

// Basic feature detection helpers
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as any).standalone === true;

export const isPushSupported = () => {
  const hasSW = 'serviceWorker' in navigator;
  const hasNotif = 'Notification' in window;
  const hasPush = 'PushManager' in window;
  // iOS only supports Web Push for installed PWAs (standalone)
  if (isIOS() && !isStandalone()) return false;
  return hasSW && hasNotif && hasPush;
};

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};
export const requestNotificationPermission = async () => {
  if (!('Notification' in window)) {
    throw new Error('This browser does not support notifications');
  }

  if (!('serviceWorker' in navigator)) {
    throw new Error('This browser does not support service workers');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission denied');
  }

  return permission;
};

export const subscribeToPushNotifications = async () => {
  try {
    if (!isPushSupported()) {
      const reason = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(
        window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
      )
        ? 'On iOS, push notifications only work after installing the app to your Home Screen.'
        : 'This browser does not support Web Push notifications.';
      throw new Error(reason);
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    await requestNotificationPermission();

    const registration = await navigator.serviceWorker.ready;
    if (!registration.pushManager) {
      throw new Error('PushManager is not available on this device/browser');
    }
    
    // Get VAPID public key from backend (kept in secrets)
    const { data: keyData, error: keyError } = await supabase.functions.invoke('get-vapid-key');
    if (keyError || !keyData?.publicKey) {
      throw new Error('Failed to load push configuration');
    }
    const convertedVapidKey = urlBase64ToUint8Array(keyData.publicKey);

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedVapidKey
    });

    const subscriptionJSON = subscription.toJSON();

    // Save to database - use user_id and endpoint as the unique key for upsert
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id: user.id,
        endpoint: subscriptionJSON.endpoint!,
        p256dh: subscriptionJSON.keys!.p256dh!,
        auth: subscriptionJSON.keys!.auth!
      }, {
        onConflict: 'user_id,endpoint'
      });

    if (error) throw error;

    return subscription;
  } catch (error) {
    console.error('Error subscribing to push notifications:', error);
    throw error;
  }
};

export const unsubscribeFromPushNotifications = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await subscription.unsubscribe();
      
      // Remove from database
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', user.id);
    }
  } catch (error) {
    console.error('Error unsubscribing from push notifications:', error);
    throw error;
  }
};
