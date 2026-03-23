"use client";

import { useAuth } from "@/hooks/useAuth";
import { useApi } from "@/hooks/useApi";
import type { UserProfile, EffectiveRole } from "@omzig/shared";
import Link from "next/link";
import Image from "next/image";

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
        <Image
          src="/omzig-logo.svg"
          alt="Omzig"
          width={100}
          height={26}
          priority
        />
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">
            {user?.email}
          </span>
          <button
            onClick={logout}
            className="rounded px-3 py-1.5 text-sm font-medium text-omzig-400 transition hover:text-omzig-500"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-8 py-16">
        <div className="rounded bg-white p-8 shadow-card">
          {profileLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-omzig-400 border-t-transparent" />
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-gray-800">
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
                  className="inline-flex items-center gap-2 rounded bg-omzig-400 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-omzig-500"
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
    Owner: "bg-omzig-400/10 text-omzig-400",
    Admin: "bg-blue-100 text-blue-700",
    Analyst: "bg-green-100 text-green-700",
    "Read-only": "bg-gray-100 text-gray-600",
  };

  const colorClass =
    colorMap[role] || "bg-gray-100 text-gray-600";

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
    <div className="min-h-screen bg-white">
      <header className="flex items-center justify-between px-8 py-6">
        <Image
          src="/omzig-logo.svg"
          alt="Omzig"
          width={120}
          height={30}
          priority
        />
        <button
          onClick={onLogin}
          className="rounded bg-omzig-400 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-omzig-500"
        >
          Sign in with Microsoft
        </button>
      </header>

      <main className="mx-auto max-w-5xl px-8 py-20 text-center">
        <h1 className="text-5xl font-bold leading-tight text-gray-800">
          Microsoft 365 Security Audit
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-500">
          Evaluate your tenant against CISA SCuBA and NIST Zero Trust
          frameworks. Get actionable results in minutes.
        </p>

        <button
          onClick={onLogin}
          className="mt-10 inline-flex items-center gap-2 rounded bg-omzig-400 px-8 py-4 text-lg font-semibold text-white shadow-card transition hover:bg-omzig-500 hover:shadow-lift"
        >
          <span className="material-symbols-outlined text-[20px]">
            security
          </span>
          Start Free Audit
        </button>

        <div className="mt-20 grid gap-8 md:grid-cols-3">
          <FeatureCard
            icon="verified_user"
            title="128 CISA Controls"
            description="Full CISA SCuBA baseline coverage across 7 M365 products including Entra ID, Exchange, Defender, and SharePoint."
          />
          <FeatureCard
            icon="analytics"
            title="31 NIST ZTA Checks"
            description="All 7 tenets of NIST SP 800-207 Zero Trust Architecture evaluated with real Graph API data."
          />
          <FeatureCard
            icon="description"
            title="Export Reports"
            description="Download branded PDF reports, Excel scorecards, or raw JSON for your compliance documentation."
          />
        </div>
      </main>

      <footer className="py-8 text-center text-sm text-gray-400">
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
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded border border-gray-200 bg-white p-6 text-left shadow-card">
      <div className="mb-4">
        <span className="material-symbols-outlined text-[32px] text-omzig-400">
          {icon}
        </span>
      </div>
      <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
      <p className="mt-2 text-sm text-gray-500">{description}</p>
    </div>
  );
}
