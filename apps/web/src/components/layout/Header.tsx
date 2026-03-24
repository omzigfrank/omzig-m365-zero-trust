"use client";

import { useAuth } from "@/hooks/useAuth";

interface HeaderProps {
  onMenuToggle?: () => void;
}

export function Header({ onMenuToggle }: HeaderProps) {
  const { user, logout, switchTenant } = useAuth();

  const tenantDomain = user?.email?.split("@")[1] ?? "";

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-4 md:px-10">
      <div className="flex items-center gap-2">
        {/* Hamburger (mobile only) */}
        {onMenuToggle && (
          <button
            onClick={onMenuToggle}
            className="mr-2 text-gray-600 md:hidden"
          >
            <span className="material-symbols-outlined text-[24px]">menu</span>
          </button>
        )}

        {/* Search */}
        <div className="relative">
          <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-gray-400">
            search
          </span>
          <input
            type="text"
            placeholder="Search..."
            className="w-full rounded border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-omzig-400 focus:ring-2 focus:ring-omzig-400/20 sm:w-60 md:w-80"
          />
        </div>
      </div>

      {/* Right: user + tenant + actions */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Current user & tenant */}
        {user && (
          <div className="hidden items-center gap-3 sm:flex">
            <div className="text-right">
              <p className="text-sm font-medium text-gray-800">
                {user.name || user.email}
              </p>
              {tenantDomain && (
                <p className="hidden text-[11px] text-gray-500 md:block">
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
          className="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-2 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 sm:px-3"
          title="Sign in with a different Microsoft 365 account"
        >
          <span className="material-symbols-outlined text-[16px]">
            swap_horiz
          </span>
          <span className="hidden sm:inline">Switch Tenant</span>
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
