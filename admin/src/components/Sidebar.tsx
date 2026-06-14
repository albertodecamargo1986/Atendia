"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard,
  KeyRound,
  Users,
  ShieldAlert,
  Settings,
  LogOut,
  Headphones,
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Licenças", href: "/licenses", icon: KeyRound },
  { name: "Clientes", href: "/customers", icon: Users },
  { name: "Alertas", href: "/alerts", icon: ShieldAlert },
  { name: "Configurações", href: "/settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  // Hide sidebar on login page
  if (pathname === "/login") {
    return null;
  }

  return (
    <aside className="hidden md:flex w-64 flex-col bg-dark-900 border-r border-dark-700">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-dark-700">
        <div className="flex items-center justify-center w-9 h-9 bg-primary-600 rounded-lg">
          <Headphones className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white">AtendIA</h1>
          <p className="text-xs text-dark-400">Painel Admin</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-thin">
        {navigation.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={isActive ? "sidebar-link-active" : "sidebar-link"}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* User + Logout */}
      <div className="px-3 py-4 border-t border-dark-700">
        <div className="px-3 py-2 mb-2">
          <p className="text-sm font-medium text-dark-200 truncate">
            {session?.user?.name || "Administrador"}
          </p>
          <p className="text-xs text-dark-400 truncate">
            {session?.user?.email || ""}
          </p>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="sidebar-link w-full"
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          <span>Sair</span>
        </button>
      </div>
    </aside>
  );
}
