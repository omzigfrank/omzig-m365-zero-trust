"use client";

import { useAuth } from "@/hooks/useAuth";
import { useApi } from "@/hooks/useApi";
import { Shield, CheckCircle, BarChart3, FileText } from "lucide-react";
import type { UserProfile, EffectiveRole } from "@omzig/shared";
import Link from "next/link";

export default function LandingPage() {
  const { isAuthenticated, isLoading, login } = useAuth();

  if (isLoading) {
    return null;
  }

  if (isAuthenticated) {
    return <AuthenticatedLanding />;
  }

  return <UnauthenticatedLanding onLogin={login} />;
}

/**
 * Authenticated landing: fetch profile from API and display user info with role badge.
 * Minimal dashboard landing -- full dashboard UX comes in Phase 5.
 */
function AuthenticatedLanding() {
  const { user, highestRole, logout } = useAuth();
  const { data: profile, isLoading: profileLoading } = useApi<
    UserProfile & { effectiveRole?: EffectiveRole }
  >("/api/auth/me");

  const displayName = profile?.displayName || user?.name || "User";
  const displayRole = profile?.baseRole || highestRole;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-8 py-4">
        <div className="flex items-center gap-3">
          <Shield className="h-7 w-7 text-blue-600" />
          <span className="text-lg font-bold text-gray-900">
            Omzig Security
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{user?.email}</span>
          <button
            onClick={logout}
            className="rounded-lg px-3 py-1.5 text-sm text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-8 py-16">
        <div className="rounded-xl border border-gray-200 bg-white p-8">
          {profileLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-gray-900">
                Welcome, {displayName}
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                {profile?.email || user?.email}
              </p>

              <div className="mt-4 flex items-center gap-3">
                <RoleBadge role={displayRole} />
                {profile?.orgName && (
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                    {profile.orgName}
                  </span>
                )}
              </div>

              <div className="mt-8">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500"
                >
                  Go to Dashboard
                </Link>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const colorMap: Record<string, string> = {
    Owner: "bg-purple-100 text-purple-700",
    Admin: "bg-blue-100 text-blue-700",
    Analyst: "bg-green-100 text-green-700",
    "Read-only": "bg-gray-100 text-gray-600",
  };

  const colorClass = colorMap[role] || "bg-gray-100 text-gray-600";

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${colorClass}`}
    >
      {role}
    </span>
  );
}

function UnauthenticatedLanding({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-omzig-900 via-omzig-800 to-blue-900">
      <header className="flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-blue-400" />
          <span className="text-xl font-bold text-white">Omzig Security</span>
        </div>
        <button
          onClick={onLogin}
          className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500"
        >
          Sign in with Microsoft
        </button>
      </header>

      <main className="mx-auto max-w-5xl px-8 py-20 text-center">
        <h1 className="text-5xl font-bold leading-tight text-white">
          Microsoft 365 Security Audit
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-blue-200">
          Evaluate your tenant against CISA SCuBA and NIST Zero Trust
          frameworks. Get actionable results in minutes.
        </p>

        <button
          onClick={onLogin}
          className="mt-10 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-4 text-lg font-semibold text-white shadow-lg transition hover:bg-blue-500 hover:shadow-xl"
        >
          <Shield className="h-5 w-5" />
          Start Free Audit
        </button>

        <div className="mt-20 grid gap-8 md:grid-cols-3">
          <FeatureCard
            icon={<CheckCircle className="h-8 w-8 text-green-400" />}
            title="128 CISA Controls"
            description="Full CISA SCuBA baseline coverage across 7 M365 products including Entra ID, Exchange, Defender, and SharePoint."
          />
          <FeatureCard
            icon={<BarChart3 className="h-8 w-8 text-blue-400" />}
            title="31 NIST ZTA Checks"
            description="All 7 tenets of NIST SP 800-207 Zero Trust Architecture evaluated with real Graph API data."
          />
          <FeatureCard
            icon={<FileText className="h-8 w-8 text-purple-400" />}
            title="Export Reports"
            description="Download branded PDF reports, Excel scorecards, or raw JSON for your compliance documentation."
          />
        </div>
      </main>

      <footer className="py-8 text-center text-sm text-blue-300">
        Read-only access only. Your data never leaves your browser session.
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-left backdrop-blur">
      <div className="mb-4">{icon}</div>
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm text-blue-200">{description}</p>
    </div>
  );
}
