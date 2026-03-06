"use client";

import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { Shield, CheckCircle, BarChart3, FileText } from "lucide-react";

export default function LandingPage() {
  const { isAuthenticated, login } = useAuth();
  const router = useRouter();

  if (isAuthenticated) {
    router.push("/dashboard");
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-omzig-900 via-omzig-800 to-blue-900">
      <header className="flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-blue-400" />
          <span className="text-xl font-bold text-white">Omzig Security</span>
        </div>
        <button
          onClick={login}
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
          frameworks. Get actionable results in minutes — no installs required.
        </p>

        <button
          onClick={login}
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
