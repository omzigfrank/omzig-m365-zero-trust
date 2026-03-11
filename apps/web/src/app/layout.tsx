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
              <p className="text-sm text-gray-500">Loading Omzig Security...</p>
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
        <MsalProvider instance={msalInstance}>{children}</MsalProvider>
      </body>
    </html>
  );
}
