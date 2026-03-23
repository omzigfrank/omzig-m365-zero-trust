"use client";

import "./globals.css";
import { MsalProvider } from "@azure/msal-react";
import { msalInstance } from "@/lib/msal";
import { useEffect, useState } from "react";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    msalInstance
      .initialize()
      .then(() => msalInstance.handleRedirectPromise())
      .then((response) => {
        if (response?.account) {
          msalInstance.setActiveAccount(response.account);
          console.log(
            "[MSAL] Login successful:",
            response.account.username,
          );
        }
        setReady(true);
      })
      .catch((err) => {
        console.error("[MSAL] Redirect handling failed:", err);
        setInitError(
          err instanceof Error ? err.message : "Authentication failed",
        );
        setReady(true);
      });
  }, []);

  if (!ready) {
    return (
      <html lang="en">
        <body className="bg-gray-50">
          <div className="flex h-screen items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
              <p className="text-sm text-gray-500">
                Loading Omzig Security...
              </p>
            </div>
          </div>
        </body>
      </html>
    );
  }

  return (
    <html lang="en">
      <head>
        <title>Omzig Security Audit</title>
        <meta
          name="description"
          content="M365 Zero Trust auditing platform for MSPs"
        />
      </head>
      <body className="bg-gray-50 text-gray-900 antialiased">
        <MsalProvider instance={msalInstance}>
          {initError && (
            <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-700">
              Auth error: {initError}
            </div>
          )}
          {children}
        </MsalProvider>
      </body>
    </html>
  );
}
