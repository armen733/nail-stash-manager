import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const useNotifications = () => {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = async () => {
    try {
      // Check environment support (iOS requires installed PWA)
      const { isPushSupported } = await import('@/lib/push-notifications');
      const supported = isPushSupported();
      if (!supported) {
        toast({
          title: 'Not supported',
          description: 'Push notifications are not available on this device/browser',
          variant: 'destructive',
        });
        return false;
      }

      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        toast({
          title: 'Permission denied',
          description: 'Please enable notifications in your browser settings',
          variant: 'destructive',
        });
        return false;
      }
      return true;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      toast({
        title: 'Error',
        description: 'Failed to request notification permission',
        variant: 'destructive',
      });
      return false;
    }
  };

  const subscribeToPush = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const { subscribeToPushNotifications } = await import('@/lib/push-notifications');
      const sub = await subscribeToPushNotifications();
      setSubscription(sub);

      toast({
        title: 'Notifications enabled',
        description: "You'll receive notifications for new orders",
      });
    } catch (error) {
      console.error('Error subscribing to push:', error);
      toast({
        title: 'Error',
        description: 'Failed to enable notifications',
        variant: 'destructive',
      });
    }
  };

  return {
    permission,
    subscription,
    requestPermission,
  };
};

