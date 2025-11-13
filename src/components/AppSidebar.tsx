import { LayoutDashboard, Package, Building2, ShoppingCart, LogOut, User, BarChart3, AlertTriangle } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";

const menuItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Products", url: "/products", icon: Package },
  { title: "Low Stock", url: "/low-stock", icon: AlertTriangle },
  { title: "Salons", url: "/salons", icon: Building2 },
  { title: "Orders", url: "/orders", icon: ShoppingCart },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
  { title: "Profile", url: "/profile", icon: User },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const navigate = useNavigate();
  const collapsed = state === "collapsed";

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Error signing out");
    } else {
      toast.success("Signed out successfully");
      navigate("/auth");
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
                          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium min-h-[3rem] px-4"
                          : "hover:bg-sidebar-accent/50 min-h-[3rem] px-4"
                      }
                    >
                      <item.icon className="h-6 w-6 md:h-5 md:w-5" />
                      {!collapsed && <span className="text-lg md:text-base">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 space-y-3">
        <div className="flex items-center gap-3 min-h-[3rem]">
          <ThemeToggle />
          {!collapsed && <span className="text-base md:text-sm text-muted-foreground">Theme</span>}
        </div>
        <Button
          variant="ghost"
          onClick={handleLogout}
          className="w-full justify-start min-h-[3rem] px-4"
        >
          <LogOut className="h-6 w-6 md:h-5 md:w-5" />
          {!collapsed && <span className="text-lg md:text-base">Logout</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
