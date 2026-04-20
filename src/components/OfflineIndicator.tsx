import { CloudOff, CloudUpload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/**
 * Compact pill that appears in the top bar when offline or when there
 * are queued orders waiting to sync. Hidden entirely when online + empty.
 */
export function OfflineIndicator() {
  const { online, pending } = useOnlineStatus();

  if (online && pending === 0) return null;

  if (!online) {
    return (
      <Badge variant="outline" className="gap-1.5 border-destructive/40 text-destructive">
        <CloudOff className="h-3.5 w-3.5" />
        <span className="text-xs">Offline{pending > 0 ? ` · ${pending} queued` : ""}</span>
      </Badge>
    );
  }

  // Online with pending — syncing in background
  return (
    <Badge variant="outline" className="gap-1.5 border-primary/40 text-primary">
      <CloudUpload className="h-3.5 w-3.5 animate-pulse" />
      <span className="text-xs">Syncing {pending}…</span>
    </Badge>
  );
}
