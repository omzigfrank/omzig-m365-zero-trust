"use client";

import { useAuth } from "@/hooks/useAuth";

export function Header() {
  const { user, logout, switchTenant } = useAuth();

  const tenantDomain = user?.email?.split("@")[1] ?? "";

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-gray-200 bg-white px-10 py-4">
      {/* Search */}
      <div className="relative">
        <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-gray-400">
          search
        </span>
        <input
          type="text"
          placeholder="Search..."
          className="w-80 rounded border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-omzig-400 focus:ring-2 focus:ring-omzig-400/20"
        />
      </div>

      {/* Right: user + tenant + actions */}
      <div className="flex items-center gap-4">
        {/* Current user & tenant */}
        {user && (
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium text-gray-800">
                {user.name || user.email}
              </p>
              {tenantDomain && (
                <p className="text-[11px] text-gray-500">
                  {tenantDomain}
                </p>
              )}
            </div>
            <div className="h-8 w-px bg-gray-200" />
          </div>
        )}

        {/* Switch tenant */}
        <button
          onClick={switchTenant}
          className="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50"
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
          className="text-sm font-medium text-omzig-400 transition hover:text-omzig-500"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
