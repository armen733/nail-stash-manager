import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";

interface ManagerRouteProps {
  children: React.ReactNode;
}

export const ManagerRoute = ({ children }: ManagerRouteProps) => {
  const { user, session, loading: authLoading } = useAuth();
  const { isManager, loading: roleLoading } = useUserRole();

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Redirect to auth if not logged in
  if (!user || !session) {
    return <Navigate to="/auth" replace />;
  }

  // Show loading while checking role
  if (roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Redirect drivers to orders page
  if (!isManager) {
    return <Navigate to="/orders" replace />;
  }

  return <>{children}</>;
};