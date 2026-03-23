"use client";

import { useAuth } from "@/hooks/useAuth";

export function Header() {
  const { logout } = useAuth();

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between bg-slate-50 px-10 py-4 shadow-sm">
      {/* Search */}
      <div className="relative">
        <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant">
          search
        </span>
        <input
          type="text"
          placeholder="Search..."
          className="w-80 rounded-lg bg-surface-container-low py-2 pl-10 pr-4 text-sm text-on-surface placeholder:text-on-surface-variant/60 outline-none transition focus:ring-2 focus:ring-primary-container/40"
        />
      </div>

      {/* Sign out */}
      <button
        onClick={logout}
        className="text-sm font-medium text-teal-600 transition hover:text-teal-500"
      >
        Sign out
      </button>
    </header>
  );
}
