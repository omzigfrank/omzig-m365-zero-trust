"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import Image from "next/image";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/audit", label: "Audit", icon: "security" },
  { href: "/reports", label: "Reports", icon: "analytics", disabled: true },
  { href: "/deploy", label: "Deploy", icon: "rocket_launch", disabled: true },
];

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, switchTenant, tenantId } = useAuth();

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  // Extract tenant domain from email (e.g., "admin@contoso.com" -> "contoso.com")
  const tenantDomain = user?.email?.split("@")[1] ?? "Unknown tenant";

  return (
    <aside
      className={`fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-gray-200 bg-white transition-transform duration-200 md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
    >
      {/* Close button (mobile only) */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 md:hidden"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
      )}

      {/* Logo */}
      <div className="px-6 pb-6 pt-6">
        <Image src="/omzig-logo.png" alt="Omzig" width={130} height={40} priority />
      </div>

      {/* Tenant indicator */}
      <div className="mx-4 mb-6 rounded bg-gray-50 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px] text-omzig-400">
            domain
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-gray-800">
              {tenantDomain}
            </p>
            <p className="truncate text-[10px] text-gray-500">
              {tenantId ? `${tenantId.slice(0, 8)}...` : "Tenant"}
            </p>
          </div>
        </div>
        <button
          onClick={switchTenant}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded bg-omzig-400/10 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-omzig-400 transition hover:bg-omzig-400/15"
        >
          <span className="material-symbols-outlined text-[14px]">
            swap_horiz
          </span>
          Switch Tenant
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);

          if (item.disabled) {
            return (
              <div
                key={item.href}
                className="mx-2 flex cursor-default items-center gap-3 rounded px-4 py-2.5 text-gray-400"
              >
                <span className="material-symbols-outlined text-[20px]">
                  {item.icon}
                </span>
                <span className="text-xs font-medium uppercase tracking-wide">
                  {item.label}
                </span>
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                isActive
                  ? "mx-2 flex items-center gap-3 rounded border-l-2 border-omzig-400 bg-omzig-400/5 px-4 py-2.5 text-omzig-400 transition"
                  : "mx-2 flex items-center gap-3 rounded border-l-2 border-transparent px-4 py-2.5 text-gray-600 transition hover:bg-gray-50 hover:text-gray-800"
              }
            >
              <span
                className={`material-symbols-outlined text-[20px] ${isActive ? "text-omzig-400" : ""}`}
              >
                {item.icon}
              </span>
              <span className="text-xs font-medium uppercase tracking-wide">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="mt-auto border-t border-gray-200 px-4 py-5">
        {/* User profile */}
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-omzig-400/10 text-xs font-semibold text-omzig-400">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-800">
              {user?.name || "User"}
            </p>
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
              Security Analyst
            </p>
          </div>
        </div>

        {/* Utility links */}
        <div className="space-y-1">
          <a
            href="https://omzig.it"
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center gap-3 rounded px-2 py-2 text-gray-500 transition hover:bg-gray-50 hover:text-gray-800"
          >
            <span className="material-symbols-outlined text-[20px]">
              language
            </span>
            <span className="text-xs font-medium uppercase tracking-wide">
              omzig.it
            </span>
          </a>
          <a
            href="mailto:support@omzig.it"
            className="flex w-full items-center gap-3 rounded px-2 py-2 text-gray-500 transition hover:bg-gray-50 hover:text-gray-800"
          >
            <span className="material-symbols-outlined text-[20px]">
              help
            </span>
            <span className="text-xs font-medium uppercase tracking-wide">
              Support
            </span>
          </a>
        </div>
      </div>
    </aside>
  );
}
