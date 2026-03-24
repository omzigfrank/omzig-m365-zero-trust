"use client";

import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import type { Role, Permission } from "@omzig/shared";
import { ROLE_HIERARCHY, hasPermission } from "@omzig/shared";

interface AuthGuardProps {
  children: React.ReactNode;
  /** Minimum required role (checks hierarchy level) */
  requiredRole?: Role;
  /** Required permission (checks via hasPermission from @omzig/shared) */
  requiredPermission?: Permission;
}

export function AuthGuard({
  children,
  requiredRole,
  requiredPermission,
}: AuthGuardProps) {
  const { isAuthenticated, isLoading, highestRole } = useAuth();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-omzig-400 border-t-transparent" />
      </div>
    );
  }

  // Check role requirement (hierarchy-based)
  if (requiredRole) {
    const requiredLevel = ROLE_HIERARCHY[requiredRole];
    const userLevel = ROLE_HIERARCHY[highestRole];
    if (userLevel < requiredLevel) {
      return (
        <div className="flex h-screen">
          {sidebarOpen && (
            <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setSidebarOpen(false)} />
          )}
          <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
          <div className="flex flex-1 flex-col overflow-hidden md:ml-64">
            <Header onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
            <main className="flex flex-1 items-center justify-center bg-gray-50 p-4 md:p-8">
              <InsufficientPermissions
                message={`This page requires the ${requiredRole} role or higher.`}
              />
            </main>
          </div>
        </div>
      );
    }
  }

  // Check permission requirement
  if (requiredPermission) {
    if (!hasPermission(highestRole, requiredPermission)) {
      return (
        <div className="flex h-screen">
          {sidebarOpen && (
            <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setSidebarOpen(false)} />
          )}
          <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
          <div className="flex flex-1 flex-col overflow-hidden md:ml-64">
            <Header onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
            <main className="flex flex-1 items-center justify-center bg-gray-50 p-4 md:p-8">
              <InsufficientPermissions
                message={`You do not have the "${requiredPermission}" permission.`}
              />
            </main>
          </div>
        </div>
      );
    }
  }

  return (
    <div className="flex h-screen">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col md:ml-64">
        <Header onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 overflow-y-auto bg-gray-50 p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function InsufficientPermissions({ message }: { message: string }) {
  return (
    <div className="flex max-w-md flex-col items-center text-center">
      <span className="material-symbols-outlined text-[48px] text-amber-500">
        shield
      </span>
      <h2 className="mt-4 text-xl font-semibold text-gray-800">
        Insufficient Permissions
      </h2>
      <p className="mt-2 text-sm text-gray-600">{message}</p>
      <p className="mt-1 text-sm text-gray-500">
        Contact your administrator if you believe this is an error.
      </p>
    </div>
  );
}
