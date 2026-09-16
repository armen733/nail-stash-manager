import { LayoutDashboard, Package, Building2, ShoppingCart, LogOut, User, BarChart3, Percent, CalendarCheck, Share2, Warehouse, History } from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import neraLogoDark from "@/assets/nera-logo-dark.png";
import { prefetchRoute } from "@/lib/prefetch";
import { cn } from "@/lib/utils";

interface MenuItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  managerOnly: boolean;
}

const topMenuItems: MenuItem[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, managerOnly: true },
  { title: "Orders", url: "/orders", icon: ShoppingCart, managerOnly: false },
  { title: "Products", url: "/products", icon: Package, managerOnly: true },
  { title: "Warehouse", url: "/warehouse", icon: Warehouse, managerOnly: true },
  { title: "Salons", url: "/salons", icon: Building2, managerOnly: true },
  { title: "Users", url: "/users", icon: User, managerOnly: true },
  { title: "Promotions", url: "/promotions", icon: Percent, managerOnly: true },
  { title: "Analytics", url: "/analytics", icon: BarChart3, managerOnly: true },
  { title: "Visit Tracker", url: "/visit-tracker", icon: CalendarCheck, managerOnly: true },
  { title: "Referrals", url: "/referrals", icon: Share2, managerOnly: true },
  { title: "Audit Log", url: "/audit-log", icon: History, managerOnly: true },
  { title: "Profile", url: "/profile", icon: User, managerOnly: false },
];

export function AppSidebar() {
  const { state, setOpenMobile, isMobile } = useSidebar();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { isManager, loading: roleLoading } = useUserRole();
  const location = useLocation();
  const collapsed = state === "collapsed";

  const handleNavClick = () => {
    setOpenMobile(false);
  };

  const handleLogout = async () => {
    try {
      await signOut();
      toast.success("Signed out successfully");
      navigate("/auth");
      setOpenMobile(false);
    } catch (error) {
      toast.error("Error signing out");
    }
  };

  const visibleItems = topMenuItems.filter(item => {
    if (roleLoading) return true;
    if (item.managerOnly && !isManager) return false;
    return true;
  });

  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="pt-[env(safe-area-inset-top,0px)]">
        <SidebarGroup>
          <SidebarGroupLabel className="px-3 py-3">
            {!collapsed ? (
              <img src={neraLogoDark} alt="NÉRA Beauty" className="h-8 w-auto" />
            ) : null}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      onClick={handleNavClick}
                      onMouseEnter={() => prefetchRoute(item.url)}
                      onTouchStart={() => prefetchRoute(item.url)}
                      className={({ isActive }) =>
                        cn(
                          "min-h-[44px] px-3 py-2 flex items-center gap-3 touch-manipulation",
                          isMobile &&
                            "min-h-[72px] px-5 py-4 gap-5 rounded-xl w-full",
                          isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                            : "hover:bg-sidebar-accent/50 active:bg-sidebar-accent/70"
                        )
                      }
                    >
                      <item.icon className={cn("h-5 w-5 flex-shrink-0", isMobile && "h-8 w-8")} />
                      {!collapsed && <span className={cn("text-sm font-medium", isMobile && "text-xl font-semibold")}>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className={cn("p-3 space-y-2 pb-[env(safe-area-inset-bottom,16px)]", isMobile && "px-4 pb-[env(safe-area-inset-bottom,20px)] space-y-3")}>
        <div className={cn("flex items-center gap-3 min-h-[44px] px-3 py-2", isMobile && "min-h-[72px] gap-5 px-5 py-4 rounded-xl")}>
          <ThemeToggle />
          {!collapsed && <span className={cn("text-sm text-muted-foreground", isMobile && "text-xl font-semibold")}>Theme</span>}
        </div>
        <Button
          variant="ghost"
          onClick={handleLogout}
          className={cn(
            "w-full justify-start min-h-[44px] px-3 touch-manipulation active:bg-sidebar-accent/70",
            isMobile && "min-h-[72px] px-5 rounded-xl"
          )}
        >
          <LogOut className={cn("h-5 w-5", isMobile && "h-8 w-8")} />
          {!collapsed && <span className={cn("ml-3 text-sm font-medium", isMobile && "ml-5 text-xl font-semibold")}>Logout</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
