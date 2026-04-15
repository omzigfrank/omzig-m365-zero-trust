/**
 * Impact preview service -- Phase 7 Plan 03.
 *
 * Computes a server-side impact estimate for a RISKY remediation at wizard-open
 * time. Uses the tenant's most-recent cached AuditFacts for 80% of values plus
 * 1-3 targeted Graph reads for fields that aren't in facts (guest count,
 * risky users, oauth2 permission grants, etc.). Research §4.1 latency budget
 * is ~2-3s total per wizard open.
 *
 * Per-control handlers:
 *   - MS.AAD.3.7v1 / NIST.ZTA.T4.2v1 (require-compliant-device):
 *        Reads facts.devices.nonCompliantDevices; issues GET /deviceManagement
 *        /managedDevices?$filter=complianceState eq 'noncompliant'&$select=userPrincipalName
 *        to count unique UPNs on noncompliant devices.
 *   - MS.AAD.3.1v1 (require-phishing-resistant-mfa):
 *        Approximates unregistered users as facts.mfa.totalUsers - facts.mfa.registeredUsers.
 *        Always marked confidence='estimated' because AuditFacts does not distinguish
 *        phishing-resistant methods from any-method registration.
 *   - MS.AAD.8.2v1 (block-guest-access):
 *        Issues GET /users?$filter=userType eq 'Guest'&$count=true&$top=1
 *        to count existing guest users.
 *   - MS.AAD.5.2v1 (disable-user-consent-all):
 *        Issues GET /oauth2PermissionGrants?$filter=consentType eq 'Principal'
 *        &$count=true&$top=1 to count user-consented delegated grants.
 *   - NIST.ZTA.T4.1v1 (sign-in-risk-policy):
 *        Issues GET /identityProtection/riskyUsers?$count=true&$top=1.
 */

import type { Client } from '@microsoft/microsoft-graph-client';
import type { AuditFacts } from '@omzig/audit';

/** Age-based confidence: facts < 6 hours old → 'high', else 'estimated'. */
const FACTS_STALENESS_MS = 6 * 60 * 60 * 1000;

export interface RemediationImpactPreview {
  affectedUserCount: number;
  totalUserCount: number;
  conflictingPolicies: Array<{ id: string; displayName: string }>;
  warnings: string[];
  confidence: 'high' | 'estimated';
  /** Human-readable one-liner for the wizard header. */
  summary: string;
}

export interface ComputeImpactPreviewOpts {
  findingId: string;
  controlId: string;
  graphClient: Client;
  facts: AuditFacts;
  /** How old is the facts snapshot in milliseconds. */
  factsAgeMs: number;
}

/**
 * Compute the impact preview for a RISKY remediation.
 *
 * Returns quickly (target <3s) even when the targeted Graph reads fail —
 * impacts degrade to facts-only values with confidence='estimated'.
 */
export async function computeImpactPreview(
  opts: ComputeImpactPreviewOpts,
): Promise<RemediationImpactPreview> {
  const { controlId, graphClient, facts, factsAgeMs } = opts;

  // totalUserCount comes from the MFA reports endpoint enumeration of all
  // users — this is the closest value to a global tenant user count available
  // in AuditFacts without re-reading Graph.
  const totalUserCount = facts.mfa?.totalUsers ?? 0;

  const freshFacts = factsAgeMs < FACTS_STALENESS_MS;
  let confidence: 'high' | 'estimated' = freshFacts ? 'high' : 'estimated';

  let affectedUserCount = 0;
  const warnings: string[] = [];
  let summary = `Impact preview for ${controlId}`;

  // Conflicting CA policies: scan facts.conditionalAccess.policies for any
  // enabled policy that overlaps the grant control we are about to add.
  // Plan 07-03: a simple overlap heuristic — any enabled policy with
  // includeUsers=['All'] is flagged as potentially conflicting.
  const conflictingPolicies = detectConflictingCaPolicies(facts, controlId);

  switch (controlId) {
    case 'MS.AAD.3.7v1':
    case 'NIST.ZTA.T4.2v1': {
      // require-compliant-device
      const nonCompliantFromFacts =
        facts.devices?.nonCompliantDevices ?? 0;
      let unique = nonCompliantFromFacts;
      try {
        const res = (await graphClient
          .api('/deviceManagement/managedDevices')
          .filter("complianceState eq 'noncompliant'")
          .select('userPrincipalName')
          .count(true)
          .get()) as { value?: Array<{ userPrincipalName?: string | null }> };
        const upns = new Set<string>();
        for (const d of res?.value ?? []) {
          if (d.userPrincipalName) upns.add(d.userPrincipalName.toLowerCase());
        }
        unique = upns.size;
      } catch {
        // Fall back to the facts value.
        confidence = 'estimated';
      }
      affectedUserCount = unique;
      if (unique > 0) {
        warnings.push(
          `${unique} users are signed in from non-compliant devices and will lose access if you enforce this policy.`,
        );
      }
      summary = `Requiring compliant devices will affect approximately ${unique} of ${totalUserCount} users.`;
      break;
    }
    case 'MS.AAD.3.1v1': {
      // require-phishing-resistant-mfa.
      // AuditFacts does not distinguish phishing-resistant method registration
      // from any-method registration — this estimate is always 'estimated'
      // regardless of fact freshness.
      confidence = 'estimated';
      const unregistered = Math.max(
        0,
        (facts.mfa?.totalUsers ?? 0) - (facts.mfa?.registeredUsers ?? 0),
      );
      affectedUserCount = unregistered;
      warnings.push(
        `Approximately ${unregistered} users do not have a phishing-resistant method registered and may be blocked at sign-in.`,
      );
      warnings.push(
        'Confidence is estimated because AuditFacts does not distinguish phishing-resistant method types from general MFA registration.',
      );
      summary = `Requiring phishing-resistant MFA may affect approximately ${unregistered} of ${totalUserCount} users.`;
      break;
    }
    case 'MS.AAD.8.2v1': {
      // block-guest-access (restrict invites).
      let guestCount = 0;
      try {
        const res = (await graphClient
          .api('/users')
          .filter("userType eq 'Guest'")
          .count(true)
          .top(1)
          .header('ConsistencyLevel', 'eventual')
          .get()) as { '@odata.count'?: number };
        guestCount = res?.['@odata.count'] ?? 0;
      } catch {
        confidence = 'estimated';
      }
      affectedUserCount = guestCount;
      if (guestCount > 0) {
        warnings.push(
          `${guestCount} guest users currently have active access. Restricting guest invites will prevent non-admin users from creating new guest accounts.`,
        );
      }
      summary = `Restricting guest invites affects non-admin invitation workflows. Current guest count: ${guestCount}.`;
      break;
    }
    case 'MS.AAD.5.2v1': {
      // disable-user-consent-all
      // facts.appRegistrations.totalApps counts ALL app registrations in the
      // tenant, not admin-consented specifically. We issue a targeted read
      // of /oauth2PermissionGrants for a more accurate count of user-consent
      // delegated grants that will be revoked.
      let userConsentGrantCount = facts.appRegistrations?.totalApps ?? 0;
      try {
        const res = (await graphClient
          .api('/oauth2PermissionGrants')
          .filter("consentType eq 'Principal'")
          .count(true)
          .top(1)
          .header('ConsistencyLevel', 'eventual')
          .get()) as { '@odata.count'?: number };
        userConsentGrantCount = res?.['@odata.count'] ?? userConsentGrantCount;
      } catch {
        confidence = 'estimated';
      }
      // affectedUserCount is not users here; it's a proxy for the number of
      // app-user pairs that will require admin consent to continue.
      affectedUserCount = userConsentGrantCount;
      if (userConsentGrantCount > 0) {
        warnings.push(
          `${userConsentGrantCount} user-consented app permission grants exist. They will need admin consent to continue functioning.`,
        );
      }
      summary = `Disabling user consent affects ${userConsentGrantCount} existing user-consent grants.`;
      break;
    }
    case 'NIST.ZTA.T4.1v1': {
      // sign-in-risk-policy
      let riskyUserCount = 0;
      try {
        const res = (await graphClient
          .api('/identityProtection/riskyUsers')
          .count(true)
          .top(1)
          .header('ConsistencyLevel', 'eventual')
          .get()) as { '@odata.count'?: number };
        riskyUserCount = res?.['@odata.count'] ?? 0;
      } catch {
        confidence = 'estimated';
        warnings.push(
          'Identity Protection riskyUsers endpoint unavailable — requires Entra ID P2 licensing.',
        );
      }
      affectedUserCount = riskyUserCount;
      if (riskyUserCount > 0) {
        warnings.push(
          `${riskyUserCount} users are currently flagged as risky by Identity Protection and will be challenged by this policy.`,
        );
      }
      summary = `Sign-in risk CA policy will challenge ${riskyUserCount} currently risky users.`;
      break;
    }
    default: {
      // Unknown control — return empty preview.
      warnings.push(
        `No impact preview handler registered for ${controlId}. Proceed with caution and review the remediation steps manually.`,
      );
      summary = `No impact preview available for ${controlId}.`;
      confidence = 'estimated';
    }
  }

  // If facts themselves are stale, downgrade confidence regardless of Graph call success.
  if (!freshFacts && confidence === 'high') {
    confidence = 'estimated';
  }

  return {
    affectedUserCount,
    totalUserCount,
    conflictingPolicies,
    warnings,
    confidence,
    summary,
  };
}

/**
 * Heuristic: return enabled CA policies that include 'All' users and would
 * overlap with a new all-user grant-control policy. This is intentionally a
 * soft check; the wizard just flags them for user review.
 */
function detectConflictingCaPolicies(
  facts: AuditFacts,
  controlId: string,
): Array<{ id: string; displayName: string }> {
  const caFacts = facts.conditionalAccess;
  if (!caFacts || !caFacts.available || !caFacts.policies) return [];

  const isCaPolicy =
    controlId === 'MS.AAD.3.7v1' ||
    controlId === 'MS.AAD.3.1v1' ||
    controlId === 'NIST.ZTA.T4.2v1' ||
    controlId === 'NIST.ZTA.T4.1v1';
  if (!isCaPolicy) return [];

  const conflicts: Array<{ id: string; displayName: string }> = [];
  for (const p of caFacts.policies) {
    if (p.state !== 'enabled') continue;
    const users = p.conditions?.users;
    if (!users) continue;
    const targetsAllUsers = users.includeUsers?.includes('All') === true;
    if (targetsAllUsers) {
      conflicts.push({ id: p.id, displayName: p.displayName });
    }
  }
  return conflicts;
}
