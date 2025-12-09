import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import {
  Settings,
  Users,
  LayoutDashboard,
  Building,
  Megaphone,
  HandCoins,
  Briefcase,
  Ticket,
  Mail,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: string[];
}

const sidebarItems: SidebarItem[] = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: ["admin", "sales", "product", "finops", "business_analyst"],
  },
  {
    name: "Clients",
    href: "/clients",
    icon: Building,
    roles: ["admin", "sales", "product", "business_analyst"],
  },
  {
    name: "VC",
    href: "/vc",
    icon: Megaphone,
    roles: ["admin", "sales", "product"],
  },
  {
    name: "Fund Raise",
    href: "/fundraise",
    icon: HandCoins,
    roles: ["admin", "sales", "product"],
  },
  {
    name: "Sales",
    href: "/sales",
    icon: Briefcase,
    roles: ["admin", "sales", "product"],
  },
  {
    name: "Tickets",
    href: "/tickets",
    icon: Ticket,
    roles: ["admin", "sales", "product", "development"],
  },
  {
    name: "Settings",
    href: "/admin/users",
    icon: Settings,
    roles: ["admin"],
  },
];

interface ConfigPageSidebarProps {
  currentPage?: string;
}

export function ConfigPageSidebar({ currentPage }: ConfigPageSidebarProps) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) return null;

  // Filter items based on user role
  const visibleItems = sidebarItems.filter((item) =>
    item.roles.includes(user.role as any),
  );

  const isActive = (href: string) => {
    if (currentPage && href.includes(currentPage)) return true;
    return location.pathname === href;
  };

  return (
    <aside className="w-64 bg-gray-50 border-r border-gray-200 h-full overflow-y-auto">
      <div className="p-6">
        {/* Logo/Branding */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Mylapay</h2>
          <p className="text-xs text-gray-600 mt-1">
            {currentPage || "Config"}
          </p>
        </div>

        {/* Navigation */}
        <nav className="space-y-1">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex items-center justify-between px-4 py-3 rounded-lg transition-colors",
                  active
                    ? "bg-blue-100 text-blue-900 font-medium"
                    : "text-gray-700 hover:bg-gray-100",
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-5 w-5" />
                  <span className="text-sm">{item.name}</span>
                </div>
                {active && <ChevronRight className="h-4 w-4" />}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
