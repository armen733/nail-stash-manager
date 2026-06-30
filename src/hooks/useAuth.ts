import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";
import { recordSession, heartbeatSession, getCurrentSessionToken } from "@/lib/session-tracker";

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

// Singleton to share auth state across components
let authState: AuthState = {
  user: null,
  session: null,
  loading: true,
};

let listeners: Set<() => void> = new Set();
let initialized = false;

const notifyListeners = () => {
  listeners.forEach(listener => listener());
};

const initAuth = () => {
  if (initialized) return;
  initialized = true;

  // Set up auth state listener
  supabase.auth.onAuthStateChange((event, session) => {
    authState = {
      user: session?.user ?? null,
      session,
      loading: false,
    };
    notifyListeners();
    if (event === "SIGNED_IN" && session?.user) {
      setTimeout(() => { recordSession().catch(() => {}); }, 0);
    }
  });

  // Get initial session
  supabase.auth.getSession().then(({ data: { session } }) => {
    authState = {
      user: session?.user ?? null,
      session,
      loading: false,
    };
    notifyListeners();
    if (session?.user) {
      setTimeout(() => { recordSession().catch(() => {}); }, 0);
    }
  });

  // Heartbeat every 5 minutes
  setInterval(() => { heartbeatSession().catch(() => {}); }, 5 * 60 * 1000);
};

export const useAuth = () => {
  const [, forceUpdate] = useState({});

  useEffect(() => {
    initAuth();
    
    const listener = () => forceUpdate({});
    listeners.add(listener);
    
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const signOut = useCallback(async () => {
    try {
      const token = getCurrentSessionToken();
      const { data: { user } } = await supabase.auth.getUser();
      if (user && token) {
        await supabase.from("user_sessions").delete()
          .eq("user_id", user.id).eq("session_token", token);
      }
    } catch {}
    await supabase.auth.signOut();
  }, []);

  return {
    user: authState.user,
    session: authState.session,
    loading: authState.loading,
    signOut,
  };
};
