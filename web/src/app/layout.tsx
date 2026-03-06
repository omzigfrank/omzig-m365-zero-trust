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
    msalInstance.initialize().then(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <html lang="en">
        <body>
          <div className="flex h-screen items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
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
          content="CISA SCuBA and NIST Zero Trust security audit for Microsoft 365"
        />
      </head>
      <body>
        <MsalProvider instance={msalInstance}>{children}</MsalProvider>
      </body>
    </html>
  );
}
