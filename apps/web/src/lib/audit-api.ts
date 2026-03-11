import type { AuditEnvelope, AuditFramework } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "https://func-omzig-zerotrust.azurewebsites.net/api";

export async function runAudit(
  accessToken: string,
  framework: AuditFramework
): Promise<AuditEnvelope> {
  const response = await fetch(`${API_BASE}/run-audit`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ framework }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Audit failed (${response.status}): ${errorText}`);
  }

  return response.json();
}
