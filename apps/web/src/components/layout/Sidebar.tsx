"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/audit", label: "Audit", icon: "security" },
  { href: "/reports", label: "Reports", icon: "analytics", disabled: true },
  { href: "/deploy", label: "Deploy", icon: "rocket_launch", disabled: true },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  return (
    <aside className="flex h-screen w-64 flex-col bg-[#001A33] fixed left-0 top-0 z-40">
      {/* Wordmark */}
      <div className="px-6 pt-8 pb-10">
        <span className="text-xl font-black tracking-widest text-white">
          OMZIG
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);

          if (item.disabled) {
            return (
              <div
                key={item.href}
                className="mx-2 flex items-center gap-3 rounded px-4 py-2.5 text-slate-400 cursor-default"
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
