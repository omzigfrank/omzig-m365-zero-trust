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
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
        </head>
        <body className="bg-gray-50">
          <div className="flex h-screen items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-omzig-400 border-t-transparent" />
              <p className="text-sm text-gray-500">Loading...</p>
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
        <meta name="description" content="CISA SCuBA and NIST Zero Trust security audit for Microsoft 365" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      </head>
      <body>
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
