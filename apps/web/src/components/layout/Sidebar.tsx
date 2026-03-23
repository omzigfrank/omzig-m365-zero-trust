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

export function Sidebar() {
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

  // Extract tenant domain from email (e.g., "admin@contoso.com" → "contoso.com")
  const tenantDomain = user?.email?.split("@")[1] ?? "Unknown tenant";

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col bg-[#001A33]">
      {/* Logo */}
      <div className="px-6 pb-6 pt-6">
        <Image
          src="/omzig-logo.svg"
          alt="Omzig"
          width={120}
          height={30}
          className="brightness-0 invert"
          priority
        />
      </div>

      {/* Tenant indicator */}
      <div className="mx-4 mb-6 rounded-lg bg-white/5 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px] text-[#00A3A3]">
            domain
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-white">
              {tenantDomain}
            </p>
            <p className="truncate text-[10px] text-slate-500">
              {tenantId ? `${tenantId.slice(0, 8)}...` : "Tenant"}
            </p>
          </div>
        </div>
        <button
          onClick={switchTenant}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded bg-white/10 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#00A3A3] transition hover:bg-white/15"
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
                className="mx-2 flex cursor-default items-center gap-3 rounded px-4 py-2.5 text-slate-400"
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
                  ? "mx-2 flex items-center gap-3 rounded border-l-4 border-[#00A3A3] bg-white/5 px-4 py-2.5 text-white transition"
                  : "mx-2 flex items-center gap-3 rounded border-l-4 border-transparent px-4 py-2.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
              }
            >
              <span
                className={`material-symbols-outlined text-[20px] ${isActive ? "text-[#00A3A3]" : ""}`}
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
      <div className="mt-auto border-t border-white/10 px-4 py-5">
        {/* User profile */}
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-container/20 text-xs font-semibold text-[#00A3A3]">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">
              {user?.name || "User"}
            </p>
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
              Security Analyst
            </p>
          </div>
        </div>

        {/* Utility links */}
        <div className="space-y-1">
          <button className="flex w-full items-center gap-3 rounded px-2 py-2 text-slate-400 transition hover:bg-white/10 hover:text-white">
            <span className="material-symbols-outlined text-[20px]">
              settings
            </span>
            <span className="text-xs font-medium uppercase tracking-wide">
              Settings
            </span>
          </button>
          <button className="flex w-full items-center gap-3 rounded px-2 py-2 text-slate-400 transition hover:bg-white/10 hover:text-white">
            <span className="material-symbols-outlined text-[20px]">
              help
            </span>
            <span className="text-xs font-medium uppercase tracking-wide">
              Support
            </span>
          </button>
        </div>
      </div>
    </aside>
  );
}
