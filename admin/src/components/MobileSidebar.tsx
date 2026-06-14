"use client";

import { useState } from "react";
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
  Menu,
  X,
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Licenças", href: "/licenses", icon: KeyRound },
  { name: "Clientes", href: "/customers", icon: Users },
  { name: "Alertas", href: "/alerts", icon: ShieldAlert },
  { name: "Configurações", href: "/settings", icon: Settings },
];

export default function MobileSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);

  if (pathname === "/login") return null;

  return (
    <>
      {/* Top bar for mobile */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between bg-dark-900 px-4 py-3 border-b border-dark-700">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 bg-primary-600 rounded-lg">
            <Headphones className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-base font-bold text-white">AtendIA</h1>
        </div>
        <button
          onClick={() => setOpen(!open)}
          className="text-dark-300 hover:text-white"
        >
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile overlay */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-black/50"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={`md:hidden fixed top-0 left-0 z-50 w-64 h-full bg-dark-900 border-r border-dark-700 transform transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-3 px-6 py-5 border-b border-dark-700">
          <div className="flex items-center justify-center w-9 h-9 bg-primary-600 rounded-lg">
            <Headphones className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">AtendIA</h1>
            <p className="text-xs text-dark-400">Painel Admin</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navigation.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setOpen(false)}
                className={isActive ? "sidebar-link-active" : "sidebar-link"}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

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
    </>
  );
}
