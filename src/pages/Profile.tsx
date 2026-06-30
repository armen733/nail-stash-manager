import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { User, Mail, Shield, LogOut, Bell, BellOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { isPushSupported, subscribeToPushNotifications, unsubscribeFromPushNotifications } from "@/lib/push-notifications";
import { ActiveSessions } from "@/components/profile/ActiveSessions";
import { useAuth } from "@/hooks/useAuth";

interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: string;
  created_at: string;
}

const Profile = () => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState("");
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { signOut } = useAuth();

  useEffect(() => {
    fetchProfile();
    checkNotificationStatus();
  }, []);

  const checkNotificationStatus = async () => {
    setPushSupported(isPushSupported());
    
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        setNotificationsEnabled(!!subscription);
      } catch (error) {
        console.error('Error checking notification status:', error);
      }
    }
  };

  const handleToggleNotifications = async () => {
    setNotificationsLoading(true);
    try {
      if (notificationsEnabled) {
        await unsubscribeFromPushNotifications();
        setNotificationsEnabled(false);
        toast({
          title: "Notifications disabled",
          description: "You won't receive push notifications anymore",
        });
      } else {
        await subscribeToPushNotifications();
        setNotificationsEnabled(true);
        toast({
          title: "Notifications enabled",
          description: "You'll receive notifications for new orders",
        });
      }
    } catch (error: any) {
      const isPermissionDenied = error.message?.includes('permission denied') || 
                                  error.message?.includes('Permission denied');
      toast({
        title: isPermissionDenied ? "Permission Required" : "Error",
        description: isPermissionDenied 
          ? "Please allow notifications in your browser settings (click the lock icon in the address bar)"
          : error.message || "Failed to update notification settings",
        variant: "destructive",
      });
    } finally {
      setNotificationsLoading(false);
    }
  };

  const fetchProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) throw error;
      
      setProfile(data);
      setFullName(data.full_name);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!profile) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName })
        .eq("id", profile.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Profile updated successfully",
      });
      
      await fetchProfile();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Profile not found</div>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4 animate-fade-in max-w-2xl mx-auto px-1">
      <div>
        <h1 className="text-sm sm:text-base font-medium text-foreground">Profile Settings</h1>
        <p className="text-[11px] text-muted-foreground">Manage your account</p>
      </div>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <User className="h-5 w-5" />
            Personal Information
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name</Label>
              <Input
                id="full_name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your full name"
                required
                className="h-11 min-h-[44px]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <Input
                  id="email"
                  value={profile.email}
                  disabled
                  className="flex-1 h-11 min-h-[44px]"
                />
              </div>
              <p className="text-xs text-muted-foreground">Email cannot be changed</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <div className="flex items-center gap-2 min-h-[44px]">
                <Shield className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <Badge variant="secondary" className="text-sm py-1">{profile.role}</Badge>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Member Since</Label>
              <p className="text-sm text-muted-foreground min-h-[44px] flex items-center">
                {new Date(profile.created_at).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-4">
              <Button type="submit" disabled={saving} className="h-11 min-h-[44px]">
                {saving ? "Saving..." : "Save Changes"}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleLogout}
                className="h-11 min-h-[44px]"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Bell className="h-5 w-5" />
            Notification Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="space-y-1">
                <Label>Push Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  {pushSupported 
                    ? "Receive notifications when new orders are placed"
                    : "Push notifications are not supported on this device/browser"}
                </p>
              </div>
              <Button
                onClick={handleToggleNotifications}
                disabled={!pushSupported || notificationsLoading}
                variant={notificationsEnabled ? "destructive" : "default"}
                className="h-11 min-h-[44px] sm:w-auto w-full"
              >
                {notificationsLoading ? (
                  "Loading..."
                ) : notificationsEnabled ? (
                  <>
                    <BellOff className="mr-2 h-4 w-4" />
                    Disable
                  </>
                ) : (
                  <>
                    <Bell className="mr-2 h-4 w-4" />
                    Enable
                  </>
                )}
              </Button>
            </div>
            {notificationsEnabled && (
              <Badge variant="secondary" className="text-sm">
                ✓ Notifications are enabled
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <ActiveSessions />
    </div>
  );
};

export default Profile;
