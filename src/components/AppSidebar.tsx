import { LayoutDashboard, Package, Building2, ShoppingCart, LogOut, User, BarChart3, AlertTriangle, Users, Percent } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
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
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import neraLogoDark from "@/assets/nera-logo-dark.png";

const menuItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Products", url: "/products", icon: Package },
  { title: "Low Stock", url: "/low-stock", icon: AlertTriangle },
  { title: "Salons", url: "/salons", icon: Building2 },
  { title: "Orders", url: "/orders", icon: ShoppingCart },
  { title: "Users", url: "/users", icon: Users },
  { title: "Promotions", url: "/promotions", icon: Percent },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
  { title: "Profile", url: "/profile", icon: User },
];

export function AppSidebar() {
  const { state, setOpenMobile, isMobile, openMobile } = useSidebar();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const collapsed = state === "collapsed";

  const handleNavClick = () => {
    // Always close on mobile when clicking a nav item
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
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      onClick={handleNavClick}
                      className={({ isActive }) =>
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold min-h-[44px] px-3 py-2 flex items-center gap-3 touch-manipulation"
                          : "hover:bg-sidebar-accent/50 active:bg-sidebar-accent/70 min-h-[44px] px-3 py-2 flex items-center gap-3 touch-manipulation"
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
