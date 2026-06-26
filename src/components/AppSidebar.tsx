import { useState } from "react";
import { LayoutDashboard, Package, Building2, ShoppingCart, LogOut, User, BarChart3, Percent, CalendarCheck, Share2, Warehouse, History, ChevronRight } from "lucide-react";
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarMenuAction,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
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

interface MenuGroup {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  managerOnly: boolean;
  children: MenuItem[];
}

const topMenuItems: MenuItem[] = [
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

const dashboardGroup: MenuGroup = {
  title: "Dashboard",
  url: "/",
  icon: LayoutDashboard,
  managerOnly: true,
  children: [
    { title: "Orders", url: "/orders", icon: ShoppingCart, managerOnly: false },
  ],
};

export function AppSidebar() {
  const { state, setOpenMobile, isMobile } = useSidebar();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { isManager, loading: roleLoading } = useUserRole();
  const location = useLocation();
  const collapsed = state === "collapsed";
  const [dashboardOpen, setDashboardOpen] = useState(() =>
    location.pathname === "/orders" || location.pathname === "/"
  );

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

  const visibleTopItems = topMenuItems.filter(item => {
    if (roleLoading) return true;
    if (item.managerOnly && !isManager) return false;
    return true;
  });

  const visibleDashboardChildren = dashboardGroup.children.filter(item => {
    if (roleLoading) return true;
    if (item.managerOnly && !isManager) return false;
    return true;
  });

  const dashboardGroupVisible = roleLoading || isManager || visibleDashboardChildren.length > 0;

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
              {dashboardGroupVisible && (
                <SidebarMenuItem>
                  <Collapsible
                    open={dashboardOpen || collapsed}
                    onOpenChange={setDashboardOpen}
                    className="group/collapsible"
                  >
                    <div className="relative">
                      <SidebarMenuButton asChild isActive={location.pathname === "/" || location.pathname === "/orders"}>
                        <NavLink
                          to="/"
                          end
                          onClick={handleNavClick}
                          onMouseEnter={() => prefetchRoute("/")}
                          onTouchStart={() => prefetchRoute("/")}
                          className={({ isActive }) =>
                            cn(
                              "min-h-[44px] px-3 py-2 flex items-center gap-3 touch-manipulation",
                              isActive
                                ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                                : "hover:bg-sidebar-accent/50 active:bg-sidebar-accent/70"
                            )
                          }
                        >
                          <LayoutDashboard className="h-5 w-5 flex-shrink-0" />
                          {!collapsed && <span className="text-sm font-medium">Dashboard</span>}
                        </NavLink>
                      </SidebarMenuButton>
                      {!collapsed && (
                        <SidebarMenuAction
                          onClick={() => setDashboardOpen(open => !open)}
                          className={cn(
                            "transition-transform",
                            dashboardOpen && "rotate-90"
                          )}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </SidebarMenuAction>
                      )}
                    </div>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {visibleDashboardChildren.map(child => (
                          <SidebarMenuSubItem key={child.title}>
                            <SidebarMenuSubButton asChild isActive={location.pathname === child.url}>
                              <NavLink
                                to={child.url}
                                onClick={handleNavClick}
                                onMouseEnter={() => prefetchRoute(child.url)}
                                onTouchStart={() => prefetchRoute(child.url)}
                              >
                                <child.icon className="h-4 w-4" />
                                <span>{child.title}</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </Collapsible>
                </SidebarMenuItem>
              )}

              {visibleTopItems.map((item) => (
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
                          isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                            : "hover:bg-sidebar-accent/50 active:bg-sidebar-accent/70"
                        )
                      }
                    >
                      <item.icon className="h-5 w-5 flex-shrink-0" />
                      {!collapsed && <span className="text-sm font-medium">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-3 space-y-2 pb-[env(safe-area-inset-bottom,16px)]">
        <div className="flex items-center gap-3 min-h-[44px] px-3 py-2">
          <ThemeToggle />
          {!collapsed && <span className="text-sm text-muted-foreground">Theme</span>}
        </div>
        <Button
          variant="ghost"
          onClick={handleLogout}
          className="w-full justify-start min-h-[44px] px-3 touch-manipulation active:bg-sidebar-accent/70"
        >
          <LogOut className="h-5 w-5" />
          {!collapsed && <span className="ml-3 text-sm font-medium">Logout</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
