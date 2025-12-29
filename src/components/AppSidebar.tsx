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
  const { state } = useSidebar();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const collapsed = state === "collapsed";

  const handleLogout = async () => {
    try {
      await signOut();
      toast.success("Signed out successfully");
      navigate("/auth");
    } catch (error) {
      toast.error("Error signing out");
    }
  };

  return (
    <Sidebar className={collapsed ? "w-14" : "w-72"} collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-xl font-semibold px-4 py-4">
            {!collapsed && "Salon Supply"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className={({ isActive }) =>
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium min-h-[52px] px-4 py-3 flex items-center gap-3 touch-manipulation"
                          : "hover:bg-sidebar-accent/50 active:bg-sidebar-accent/70 min-h-[52px] px-4 py-3 flex items-center gap-3 touch-manipulation"
                      }
                    >
                      <item.icon className="h-6 w-6 flex-shrink-0" />
                      {!collapsed && <span className="text-base">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 space-y-2">
        <div className="flex items-center gap-3 min-h-[52px] px-4 py-2">
          <ThemeToggle />
          {!collapsed && <span className="text-base text-muted-foreground">Theme</span>}
        </div>
        <Button
          variant="ghost"
          onClick={handleLogout}
          className="w-full justify-start min-h-[52px] px-4 touch-manipulation active:bg-sidebar-accent/70"
        >
          <LogOut className="h-6 w-6" />
          {!collapsed && <span className="ml-3 text-base">Logout</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
