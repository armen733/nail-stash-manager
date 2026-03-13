import { memo } from "react";
import { NavLink } from "react-router-dom";
import { LayoutDashboard, Package, ShoppingCart, User, BarChart3 } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { cn } from "@/lib/utils";
import { prefetchRoute } from "@/lib/prefetch";

const navItems = [
  { title: "Home", url: "/", icon: LayoutDashboard, managerOnly: true },
  { title: "Products", url: "/products", icon: Package, managerOnly: true },
  { title: "Orders", url: "/orders", icon: ShoppingCart, managerOnly: false },
  { title: "Analytics", url: "/analytics", icon: BarChart3, managerOnly: true },
  { title: "Profile", url: "/profile", icon: User, managerOnly: false },
];

export const BottomNav = memo(function BottomNav() {
  const { isManager, loading } = useUserRole();

  const visibleItems = navItems.filter(item => {
    if (loading) return true;
    if (item.managerOnly && !isManager) return false;
    return true;
  });

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border md:hidden pb-[env(safe-area-inset-bottom,0px)]">
      <div className="flex items-center justify-around h-14">
        {visibleItems.map((item) => (
          <NavLink
            key={item.url}
            to={item.url}
            end={item.url === "/"}
            onTouchStart={() => prefetchRoute(item.url)}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-muted-foreground transition-colors touch-manipulation",
                isActive && "text-primary"
              )
            }
          >
            <item.icon className="h-5 w-5" />
            <span className="text-[10px] font-medium leading-none">{item.title}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
});
