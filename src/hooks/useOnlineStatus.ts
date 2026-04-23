import { useEffect, useRef, useState } from "react";
import { flushQueue, queueLength } from "@/lib/offline-queue";
import { useToast } from "@/hooks/use-toast";

/**
 * Tracks navigator.onLine and silently flushes the offline order queue
 * whenever the device transitions back to online.
 *
 * Optimized: avoids IndexedDB scans on every page navigation by skipping
 * mount-time work when there's nothing queued and we're already online.
 */
export function useOnlineStatus() {
  const { toast } = useToast();
  const [online, setOnline] = useState<boolean>(typeof navigator === "undefined" ? true : navigator.onLine);
  const [pending, setPending] = useState<number>(0);
  const refreshTimer = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;

    const refreshPending = () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(async () => {
        const n = await queueLength();
        if (mounted) setPending(n);
      }, 150);
    };

    const handleOnline = async () => {
      setOnline(true);
      const before = await queueLength();
      if (mounted) setPending(before);
      if (before === 0) return;
      const result = await flushQueue();
      const after = await queueLength();
      if (mounted) setPending(after);
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

    const handleQueueChanged = () => {
      refreshPending();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("offline-queue-changed", handleQueueChanged);

    // Cheap mount-time check: only do work if there's actually something to do.
    // This avoids scanning IndexedDB + running flush on every page navigation.
    queueLength().then((n) => {
      if (!mounted) return;
      setPending(n);
      if (n > 0 && navigator.onLine) {
        // There's queued work — kick off a sync.
        handleOnline();
      }
    });

    return () => {
      mounted = false;
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
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
