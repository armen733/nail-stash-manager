import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type UserRole = "Owner" | "Sales Rep" | "Customer";

interface UserRoleState {
  role: UserRole | null;
  loading: boolean;
  isManager: boolean;
  isDriver: boolean;
}

export const useUserRole = () => {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<UserRoleState>({
    role: null,
    loading: true,
    isManager: false,
    isDriver: false,
  });

  const fetchRole = useCallback(async () => {
    if (!user) {
      setState({
        role: null,
        loading: false,
        isManager: false,
        isDriver: false,
      });
      return;
    }

    try {
      // First check user_roles table
      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (roleError) {
        console.error("Error fetching user role:", roleError);
      }

      // Fallback to profiles table if no user_roles entry
      if (!roleData) {
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        if (profileError) {
          console.error("Error fetching profile role:", profileError);
        }

        const role = (profileData?.role as UserRole) || "Customer";
        const isManager = role === "Owner" || role === "Sales Rep";
        
        setState({
          role,
          loading: false,
          isManager,
          isDriver: !isManager,
        });
        return;
      }

      const role = roleData.role as UserRole;
      const isManager = role === "Owner" || role === "Sales Rep";
      
      setState({
        role,
        loading: false,
        isManager,
        isDriver: !isManager,
      });
    } catch (error) {
      console.error("Error in useUserRole:", error);
      setState({
        role: "Customer",
        loading: false,
        isManager: false,
        isDriver: true,
      });
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) {
      fetchRole();
    }
  }, [authLoading, fetchRole]);

  return {
    ...state,
    refetch: fetchRole,
  };
};