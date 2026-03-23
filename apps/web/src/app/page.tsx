"use client";

import { useAuth } from "@/hooks/useAuth";
import { useApi } from "@/hooks/useApi";
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
 */
function AuthenticatedLanding() {
  const { user, highestRole, logout } = useAuth();
  const { data: profile, isLoading: profileLoading } = useApi<
    UserProfile & { effectiveRole?: EffectiveRole }
  >("/api/auth/me");

  const displayName = profile?.displayName || user?.name || "User";
  const displayRole = profile?.baseRole || highestRole;

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="flex items-center justify-between border-b border-outline-variant/30 bg-white px-8 py-4">
        <div className="flex items-center gap-3">
          <span className="text-lg font-black tracking-widest text-on-surface">
            OMZIG
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-on-surface-variant">
            {user?.email}
          </span>
          <button
            onClick={logout}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-teal-600 transition hover:text-teal-500"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-8 py-16">
        <div className="rounded-xl border border-outline-variant/30 bg-white p-8 shadow-lift">
          {profileLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary-container border-t-transparent" />
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-on-surface">
                Welcome, {displayName}
              </h1>
              <p className="mt-1 text-sm text-on-surface-variant">
                {profile?.email || user?.email}
              </p>

              <div className="mt-4 flex items-center gap-3">
                <RoleBadge role={displayRole} />
                {profile?.orgName && (
                  <span className="rounded-full bg-surface-container-high px-3 py-1 text-xs font-medium text-on-surface-variant">
                    {profile.orgName}
                  </span>
                )}
              </div>

              <div className="mt-8">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 rounded-lg bg-[#00A3A3] px-6 py-2.5 text-sm font-medium text-white transition hover:bg-[#008f8f]"
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
    Owner: "bg-teal-100 text-teal-700",
    Admin: "bg-primary-container/15 text-primary",
    Analyst: "bg-green-100 text-green-700",
    "Read-only": "bg-surface-container-high text-on-surface-variant",
  };

  const colorClass =
    colorMap[role] || "bg-surface-container-high text-on-surface-variant";

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
    <div className="min-h-screen bg-gradient-to-br from-[#001A33] via-omzig-800 to-[#001A33]">
      <header className="flex items-center justify-between px-8 py-6">
        <span className="text-xl font-black tracking-widest text-white">
          OMZIG
        </span>
        <button
          onClick={onLogin}
          className="rounded-lg bg-[#00A3A3] px-6 py-2.5 text-sm font-medium text-white transition hover:bg-[#008f8f]"
        >
          Sign in with Microsoft
        </button>
      </header>

      <main className="mx-auto max-w-5xl px-8 py-20 text-center">
        <h1 className="text-5xl font-bold leading-tight text-white">
          Microsoft 365 Security Audit
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-teal-200/80">
          Evaluate your tenant against CISA SCuBA and NIST Zero Trust
          frameworks. Get actionable results in minutes.
        </p>

        <button
          onClick={onLogin}
          className="mt-10 inline-flex items-center gap-2 rounded-xl bg-[#00A3A3] px-8 py-4 text-lg font-semibold text-white shadow-lg transition hover:bg-[#008f8f] hover:shadow-xl"
        >
          <span className="material-symbols-outlined text-[20px]">
            security
          </span>
          Start Free Audit
        </button>

        <div className="mt-20 grid gap-8 md:grid-cols-3">
          <FeatureCard
            icon="verified_user"
            iconColor="text-[#5dd9d8]"
            title="128 CISA Controls"
            description="Full CISA SCuBA baseline coverage across 7 M365 products including Entra ID, Exchange, Defender, and SharePoint."
          />
          <FeatureCard
            icon="analytics"
            iconColor="text-[#00A3A3]"
            title="31 NIST ZTA Checks"
            description="All 7 tenets of NIST SP 800-207 Zero Trust Architecture evaluated with real Graph API data."
          />
          <FeatureCard
            icon="description"
            iconColor="text-teal-300"
            title="Export Reports"
            description="Download branded PDF reports, Excel scorecards, or raw JSON for your compliance documentation."
          />
        </div>
      </main>

      <footer className="py-8 text-center text-sm text-teal-300/60">
        Read-only access only. Your data never leaves your browser session.
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  iconColor,
  title,
  description,
}: {
  icon: string;
  iconColor: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-left backdrop-blur">
      <div className="mb-4">
        <span className={`material-symbols-outlined text-[32px] ${iconColor}`}>
          {icon}
        </span>
      </div>
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm text-teal-200/70">{description}</p>
    </div>
  );
}
