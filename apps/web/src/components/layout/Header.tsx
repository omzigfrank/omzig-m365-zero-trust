"use client";

import { useAuth } from "@/hooks/useAuth";

export function Header() {
  const { user, logout, switchTenant } = useAuth();

  const tenantDomain = user?.email?.split("@")[1] ?? "";

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
          className="w-80 rounded-lg bg-surface-container-low py-2 pl-10 pr-4 text-sm text-on-surface outline-none transition placeholder:text-on-surface-variant/60 focus:ring-2 focus:ring-primary-container/40"
        />
      </div>

      {/* Right: user + tenant + actions */}
      <div className="flex items-center gap-4">
        {/* Current user & tenant */}
        {user && (
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium text-on-surface">
                {user.name || user.email}
              </p>
              {tenantDomain && (
                <p className="text-[11px] text-on-surface-variant">
                  {tenantDomain}
                </p>
              )}
            </div>
            <div className="h-8 w-px bg-outline-variant" />
          </div>
        )}

        {/* Switch tenant */}
        <button
          onClick={switchTenant}
          className="inline-flex items-center gap-1.5 rounded-lg bg-surface-container-high px-3 py-1.5 text-xs font-semibold text-on-surface-variant transition hover:bg-surface-container-highest"
          title="Sign in with a different Microsoft 365 account"
        >
          <span className="material-symbols-outlined text-[16px]">
            swap_horiz
          </span>
          Switch Tenant
        </button>

        {/* Sign out */}
        <button
          onClick={logout}
          className="text-sm font-medium text-primary transition hover:text-primary/80"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
