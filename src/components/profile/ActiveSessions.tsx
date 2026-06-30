import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Smartphone, Tablet, Monitor, MapPin, Clock, Trash2, Globe, Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getCurrentSessionToken } from "@/lib/session-tracker";
import { formatDistanceToNow } from "date-fns";

interface UserSession {
  id: string;
  session_token: string;
  device_type: string | null;
  device_name: string | null;
  browser: string | null;
  os: string | null;
  ip_address: string | null;
  location: string | null;
  last_seen_at: string;
  created_at: string;
}

interface PushDevice {
  id: string;
  endpoint: string;
  device_type: string | null;
  device_name: string | null;
  browser: string | null;
  os: string | null;
  created_at: string;
  last_seen_at: string | null;
}

const deviceIcon = (type: string | null) => {
  if (type === "Mobile") return <Smartphone className="h-5 w-5" />;
  if (type === "Tablet") return <Tablet className="h-5 w-5" />;
  return <Monitor className="h-5 w-5" />;
};

// Infer device info from the push endpoint URL when metadata is missing
// (older subscriptions saved before we started capturing user agent details).
const inferFromEndpoint = (endpoint: string) => {
  if (endpoint.includes("web.push.apple.com")) {
    return { label: "Apple device (iPhone / iPad / Mac)", browser: "Safari", icon: <Smartphone className="h-5 w-5" /> };
  }
  if (endpoint.includes("fcm.googleapis.com") || endpoint.includes("android.googleapis.com")) {
    return { label: "Android device", browser: "Chrome", icon: <Smartphone className="h-5 w-5" /> };
  }
  if (endpoint.includes("mozilla.com")) {
    return { label: "Firefox device", browser: "Firefox", icon: <Monitor className="h-5 w-5" /> };
  }
  if (endpoint.includes("windows.com") || endpoint.includes("notify.windows.com")) {
    return { label: "Windows device", browser: "Edge", icon: <Monitor className="h-5 w-5" /> };
  }
  return { label: "Unknown device", browser: null, icon: <Monitor className="h-5 w-5" /> };
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export const ActiveSessions = () => {
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [pushDevices, setPushDevices] = useState<PushDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [removingPushId, setRemovingPushId] = useState<string | null>(null);
  const { toast } = useToast();
  const currentToken = getCurrentSessionToken();

  const fetchSessions = async () => {
    const [{ data, error }, { data: pushData, error: pushError }] = await Promise.all([
      supabase
        .from("user_sessions")
        .select("*")
        .order("last_seen_at", { ascending: false }),
      supabase
        .from("push_subscriptions")
        .select("id, endpoint, device_type, device_name, browser, os, created_at, last_seen_at")
        .order("last_seen_at", { ascending: false }),
    ]);

    if (error || pushError) {
      toast({ title: "Error", description: error?.message || pushError?.message, variant: "destructive" });
    } else {
      setSessions(data || []);
      setPushDevices(pushData || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchSessions(); }, []);

  const revoke = async (s: UserSession) => {
    setRevokingId(s.id);
    const { error } = await supabase.from("user_sessions").delete().eq("id", s.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Session removed", description: "That device entry was removed from the list." });
      setSessions(prev => prev.filter(x => x.id !== s.id));
    }
    setRevokingId(null);
  };

  const removePushDevice = async (device: PushDevice) => {
    setRemovingPushId(device.id);
    const { error } = await supabase.from("push_subscriptions").delete().eq("id", device.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Device removed", description: "That notification device was removed from the list." });
      setPushDevices(prev => prev.filter(x => x.id !== device.id));
    }
    setRemovingPushId(null);
  };

  const renderDeviceLabel = (deviceName?: string | null, os?: string | null) =>
    [deviceName, os].filter(Boolean).join(" · ") || "Unknown device";


  return (
    <Card className="shadow-[var(--shadow-card)]">
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
          <Globe className="h-5 w-5" />
          Active Sessions
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Devices where your account has been signed in recently.
        </p>
      </CardHeader>
      <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0 space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading sessions...</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sessions tracked yet.</p>
        ) : (
          sessions.map((s) => {
            const isCurrent = s.session_token === currentToken;
            return (
              <div
                key={s.id}
                className="flex items-start gap-3 p-3 rounded-lg border bg-card"
              >
                <div className="mt-1 text-muted-foreground">{deviceIcon(s.device_type)}</div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sm">
                      {[s.device_name, s.os].filter(Boolean).join(" · ") || "Unknown device"}
                    </span>
                    {s.browser && (
                      <Badge variant="outline" className="text-[10px]">{s.browser}</Badge>
                    )}
                    {isCurrent && (
                      <Badge className="text-[10px] bg-green-600 hover:bg-green-600">This device</Badge>
                    )}
                  </div>
                  {(s.location || s.ip_address) && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      <span className="truncate">
                        {s.location || s.ip_address}
                        {s.location && s.ip_address ? ` · ${s.ip_address}` : ""}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    Last active {formatDistanceToNow(new Date(s.last_seen_at), { addSuffix: true })} · {formatDate(s.last_seen_at)}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3 opacity-60" />
                    First signed in {formatDate(s.created_at)}
                  </div>

                </div>
                {!isCurrent && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => revoke(s)}
                    disabled={revokingId === s.id}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            );
          })
        )}
        {pushDevices.length > 0 && (
          <div className="space-y-2 pt-2">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Bell className="h-3.5 w-3.5" />
              Saved notification devices ({pushDevices.length})
            </div>
            <p className="text-[11px] text-muted-foreground -mt-1">
              Devices that enabled push notifications. Older entries don't have full details — they'll refresh next time you open the app on that device.
            </p>
            {pushDevices.map((device) => {
              const inferred = inferFromEndpoint(device.endpoint);
              const label = [device.device_name, device.os].filter(Boolean).join(" · ") || inferred.label;
              const browser = device.browser || inferred.browser;
              return (
                <div key={device.id} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/25">
                  <div className="mt-1 text-muted-foreground">
                    {device.device_type ? deviceIcon(device.device_type) : inferred.icon}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm">{label}</span>
                      {browser && <Badge variant="outline" className="text-[10px]">{browser}</Badge>}
                      <Badge variant="secondary" className="text-[10px]">Notifications</Badge>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      Added {formatDate(device.created_at)}
                    </div>
                    {device.last_seen_at && device.last_seen_at !== device.created_at && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        Last seen {formatDistanceToNow(new Date(device.last_seen_at), { addSuffix: true })}
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removePushDevice(device)}
                    disabled={removingPushId === device.id}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground pt-1">
          Removing an entry clears it from this list. To force sign-out everywhere, change your password.
        </p>
      </CardContent>
    </Card>
  );
};
