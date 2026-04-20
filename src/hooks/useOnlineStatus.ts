import { useEffect, useState } from "react";
import { flushQueue, queueLength } from "@/lib/offline-queue";
import { useToast } from "@/hooks/use-toast";

/**
 * Tracks navigator.onLine and silently flushes the offline order queue
 * whenever the device transitions back to online.
 */
export function useOnlineStatus() {
  const { toast } = useToast();
  const [online, setOnline] = useState<boolean>(typeof navigator === "undefined" ? true : navigator.onLine);
  const [pending, setPending] = useState<number>(0);

  useEffect(() => {
    let mounted = true;
    queueLength().then((n) => mounted && setPending(n));

    const refreshPending = async () => {
      const n = await queueLength();
      if (mounted) setPending(n);
    };

    const handleOnline = async () => {
      setOnline(true);
      await refreshPending();
      const before = await queueLength();
      if (before === 0) return;
      const result = await flushQueue();
      await refreshPending();
      if (result.succeeded > 0) {
        toast({
          title: "Back online",
          description: `Synced ${result.succeeded} pending order${result.succeeded === 1 ? "" : "s"}.`,
        });
      }
      if (result.failed > 0) {
        toast({
          title: "Some orders failed to sync",
          description: `${result.failed} order${result.failed === 1 ? "" : "s"} still pending. Will retry.`,
          variant: "destructive",
        });
      }
    };

    const handleOffline = () => {
      setOnline(false);
      refreshPending();
    };

    // Custom event so other parts of the app can ask for a refresh
    const handleQueueChanged = () => {
      refreshPending();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("offline-queue-changed", handleQueueChanged);

    // Try a sync on mount in case we loaded online with pending orders
    if (navigator.onLine) {
      handleOnline();
    }

    return () => {
      mounted = false;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("offline-queue-changed", handleQueueChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { online, pending };
}

/** Call after enqueuing/removing an order so the indicator updates immediately. */
export function notifyQueueChanged() {
  window.dispatchEvent(new Event("offline-queue-changed"));
}
