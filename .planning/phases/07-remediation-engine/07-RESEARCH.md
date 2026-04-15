# Phase 7: Remediation Engine — Research

**Researched:** 2026-04-14
**Domain:** Microsoft Graph API write operations, MSAL incremental consent, async job orchestration
**Confidence:** HIGH for Graph API endpoints (verified against Microsoft Learn current docs); MEDIUM for MSAL incremental consent edge cases; HIGH for throttling limits.

---

## Context Refinements

After reviewing live Microsoft Learn docs against `07-CONTEXT.md`, the following refinements / clarifications apply. **None invalidate the locked decisions.**

1. **CA policy state field — confirmed.** `enabledForReportingButNotEnforced` is the literal string used in v1.0 Graph (see [conditionalAccessPolicy resource](https://learn.microsoft.com/en-us/graph/api/resources/conditionalaccesspolicy?view=graph-rest-1.0)). The Report-Only → Enforce flow in CONTEXT is implementable as a single `PATCH /identity/conditionalAccess/policies/{id}` body of `{ "state": "enabled" }`. [VERIFIED]
2. **Write throttling is severe and write-specific.** Identity write operations have a documented per-app+tenant cap of **3,000 requests / 2 min 30 sec** and a **per-tenant cap of 18,000 / 5 min** ([throttling-limits](https://learn.microsoft.com/en-us/graph/throttling-limits)). The existing `rate-limiter.ts` (designed for read counts of 10,000) is the **wrong shape** for writes — see Section 3 below. [VERIFIED]
3. **Authentication methods policy is global, not per-method.** There is no `POST /authenticationMethodConfigurations/sms` — only `PATCH /policies/authenticationMethodsPolicy/authenticationMethodConfigurations/{id}` against the singleton. This affects how SAFE/RISKY classification distinguishes "disable SMS" (global side-effect) from "create CA policy" (additive). [VERIFIED]
4. **MSAL `acquireTokenSilent` is the correct entry point** for incremental scope detection — when scopes are missing, it throws `InteractionRequiredAuthError` and the catch handler escalates to `acquireTokenPopup`. There is no separate "check consent" API. [VERIFIED]
5. **Incremental consent must be POPUP, not redirect**, for our use case. A redirect mid-wizard discards the wizard state and the user has to re-navigate. See Section 2. [CITED: MS Learn]

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| REMED-01 | Classify each finding as SAFE/RISKY | Section 6 (write-scope bundles inform classification rationale) |
| REMED-02 | One-click auto-remediate SAFE findings | Sections 1, 2 (Graph endpoints + token acquisition) |
| REMED-03 | Impact preview for RISKY findings | Section 4 (data sources for previews) |
| REMED-04 | Report-Only → Enforce for risky CA changes | Section 5 (deep dive on the state transition) |
| REMED-05 | Audit trail with before/after, timestamp, approver | Section 1 (response shapes — id field for snapshot) |
| REMED-06 | Rollback any remediation | Section 7 (rollback edge cases + drift) |
| REMED-07 | Validate prerequisites before applying | Section 4 (existing AuditFacts + targeted Graph reads) |
| REMED-08 | Min-privilege, JIT write scopes | Sections 2, 6 (incremental consent + bundle strategy) |

---

## 1. Microsoft Graph API Write Operations Reference

All endpoints below are **delegated** (user-context, since incremental consent flows are user-driven). All v1.0 unless noted. Each table row was verified against Microsoft Learn between Mar–Dec 2025. [VERIFIED via Microsoft Learn]

### 1.1 Conditional Access Policies

| Field | Value |
|-------|-------|
| **Verb + URL** | `POST /identity/conditionalAccess/policies` (create), `PATCH /identity/conditionalAccess/policies/{id}` (update), `DELETE /identity/conditionalAccess/policies/{id}` |
| **Delegated scope** | `Policy.ReadWrite.ConditionalAccess` (least privileged) |
| **Required directory role** | Conditional Access Administrator (or Security Administrator) |
| **Key body fields** | `displayName`, `state` (`enabled` \| `disabled` \| `enabledForReportingButNotEnforced`), `conditions` (users/applications/locations/clientAppTypes), `grantControls` (operator + builtInControls), `sessionControls` |
| **Response** | `201 Created` with full `conditionalAccessPolicy` body. **Store `id` (GUID)** for rollback handle. |
| **Rollback** | For new policies → `DELETE /identity/conditionalAccess/policies/{id}`. For updates → `PATCH` the entire `beforeSnapshot` body back. |
| **PITFALLs** | (a) `state` must be one of three literal strings — typos are silently rejected. (b) Excluded users/groups must exist before referenced — break-glass guard rail in REMED-07 catches this. (c) The `templateId` field is read-only and doesn't survive PATCH. (d) Empty `excludeUsers` array is fine; omitting it from a PATCH preserves prior value. |

```typescript
// packages/audit/src/remediation/executors/ca-policy-executor.ts
import { Client } from '@microsoft/microsoft-graph-client';

export async function createCAPolicy(
  client: Client,
  body: ConditionalAccessPolicyBody,
): Promise<{ id: string; created: ConditionalAccessPolicy }> {
  const created = await client.api('/identity/conditionalAccess/policies').post(body);
  return { id: created.id, created };
}

export async function patchCAPolicyState(
  client: Client,
  id: string,
  state: 'enabled' | 'disabled' | 'enabledForReportingButNotEnforced',
): Promise<void> {
  await client.api(`/identity/conditionalAccess/policies/${id}`).patch({ state });
}
```

Source: [Create conditionalAccessPolicy](https://learn.microsoft.com/en-us/graph/api/conditionalaccessroot-post-policies?view=graph-rest-1.0)

### 1.2 Authentication Methods Policy

| Field | Value |
|-------|-------|
| **Verb + URL** | `PATCH /policies/authenticationMethodsPolicy` (top-level), or `PATCH /policies/authenticationMethodsPolicy/authenticationMethodConfigurations/{id}` for a specific method (where `{id}` ∈ `Sms`, `Voice`, `Email`, `MicrosoftAuthenticator`, `Fido2`, `WindowsHelloForBusiness`, `TemporaryAccessPass`, `X509Certificate`, `SoftwareOath`) |
| **Delegated scope** | `Policy.ReadWrite.AuthenticationMethod` |
| **Required directory role** | Authentication Policy Administrator |
| **Key body fields** | For per-method: `state` (`enabled` \| `disabled`), `includeTargets[]`, `excludeTargets[]`. For top-level: `registrationEnforcement` campaign config. |
| **Response** | `200 OK` (PATCH does not return a body envelope in all cases — read back via GET to capture afterSnapshot). |
| **Rollback** | Re-PATCH with `beforeSnapshot`. The singleton has no `id` to delete — there is no DELETE op. |
| **PITFALLs** | (a) **Singleton resource** — there is no POST/DELETE; rollback is always PATCH. (b) Disabling SMS while no other strong method is registered locks users out — REMED-07 prerequisite check is mandatory. (c) `policyVersion` field bumps on every change — useful for optimistic concurrency. (d) Per-method PATCH is partial; top-level PATCH replaces nested objects. |

```typescript
export async function disableSmsAuthMethod(client: Client): Promise<void> {
  await client.api('/policies/authenticationMethodsPolicy/authenticationMethodConfigurations/Sms')
    .patch({ state: 'disabled' });
}
```

Source: [Update authenticationMethodsPolicy](https://learn.microsoft.com/en-us/graph/api/authenticationmethodspolicy-update?view=graph-rest-1.0)

### 1.3 Authorization Policy (User Consent / App Settings)

| Field | Value |
|-------|-------|
| **Verb + URL** | `PATCH /policies/authorizationPolicy` (singleton) |
| **Delegated scope** | `Policy.ReadWrite.Authorization` |
| **Required directory role** | Privileged Role Administrator |
| **Key body fields** | `defaultUserRolePermissions.permissionGrantPoliciesAssigned[]` (string IDs like `ManagePermissionGrantsForSelf.microsoft-user-default-low`), `allowedToCreateApps`, `allowedToCreateSecurityGroups`, `guestUserRoleId` |
| **Response** | `204 No Content` (read back via GET to confirm). |
| **Rollback** | PATCH with `beforeSnapshot`. |
| **PITFALLs** | (a) Setting `permissionGrantPoliciesAssigned` to `[]` blocks ALL user consent — RISKY classification mandatory. (b) `guestUserRoleId` accepts only specific known role GUIDs (Restricted Guest, Guest, User). |

```typescript
export async function disableUserConsentToApps(client: Client): Promise<void> {
  await client.api('/policies/authorizationPolicy').patch({
    defaultUserRolePermissions: { permissionGrantPoliciesAssigned: [] },
  });
}
```

### 1.4 Admin Consent Request Policy

| Field | Value |
|-------|-------|
| **Verb + URL** | `PUT /policies/adminConsentRequestPolicy` (singleton, PUT not PATCH — full replacement) |
| **Delegated scope** | `Policy.ReadWrite.Authorization` |
| **Key body fields** | `isEnabled` (bool), `notifyReviewers`, `remindersEnabled`, `requestDurationInDays`, `reviewers[]` (queryRoot per reviewer) |
| **Rollback** | PUT prior body. |
| **PITFALLs** | PUT means partial bodies are destructive — always send the full `beforeSnapshot` even on rollback. |

### 1.5 Security Defaults

| Field | Value |
|-------|-------|
| **Verb + URL** | `PATCH /policies/identitySecurityDefaultsEnforcementPolicy` (singleton) |
| **Delegated scope** | `Policy.ReadWrite.SecurityDefaults` |
| **Key body fields** | `isEnabled` (bool only) |
| **Rollback** | PATCH with prior `isEnabled` value. |
| **PITFALLs** | (a) Mutually exclusive with custom CA policies — Graph returns 400 if any CA policy is enabled. (b) Enabling Security Defaults flips MFA/legacy-block on for ALL users immediately — SAFE only on tenants with zero existing CA policies. |

### 1.6 Directory Roles (Admin Role Assignments)

| Field | Value |
|-------|-------|
| **Verb + URL** | `POST /roleManagement/directory/roleAssignments` (create), `DELETE /roleManagement/directory/roleAssignments/{id}` |
| **Delegated scope** | `RoleManagement.ReadWrite.Directory` |
| **Required directory role** | Privileged Role Administrator |
| **Key body fields** | `principalId` (user/group GUID), `roleDefinitionId` (built-in or custom role GUID), `directoryScopeId` (`/` for tenant-wide) |
| **Response** | `201 Created` with `id` (assignment GUID) — store this for rollback DELETE. |
| **Rollback** | `DELETE /roleManagement/directory/roleAssignments/{id}`. For deletes (removing an assignment) → POST to recreate using the snapshot. |
| **PITFALLs** | (a) Cannot remove the last Global Administrator — Graph returns 403. (b) Role assignments are eventually consistent — afterSnapshot read should retry with 2-3 second backoff. |

### 1.7 Domain (Password Validity Period)

| Field | Value |
|-------|-------|
| **Verb + URL** | `PATCH /domains/{id}` |
| **Delegated scope** | `Domain.ReadWrite.All` |
| **Key body fields** | `passwordValidityPeriodInDays` (int — 2147483647 = "never expire", modern best practice) |
| **PITFALLs** | Tenant-level password policy still applies on top of domain-level — confirm via `/policies/passwordPolicies` for full picture. |

### 1.8 Guest Access Settings (User Settings)

Guest access is **not a single resource** — it lives in three places: `authorizationPolicy.guestUserRoleId` (above), `/policies/externalIdentitiesPolicy` (allow B2B sign-ups), and `/teamwork/teamsAppSettings` (Teams guest access). For Phase 7 v1, scope to `authorizationPolicy.guestUserRoleId` and document the others as "see admin portal" pass-throughs in the registry.

---

## 2. MSAL Incremental Consent Flow (`@azure/msal-browser`)

### 2.1 The pattern

MSAL.js does NOT expose a "check if scope is consented" API. Instead, the **silent-then-popup** pattern naturally implements lazy incremental consent:

1. Call `acquireTokenSilent({ scopes: writeScopes, account })`.
2. If MSAL has already cached a token covering those scopes, it returns immediately (silent path).
3. If not, MSAL throws `InteractionRequiredAuthError` (or `BrowserAuthError` with code `consent_required`).
4. Catch → call `acquireTokenPopup({ scopes: writeScopes, account })`.
5. User sees the consent screen; on success, MSAL caches the new token and the broader scope grant against the account.
6. Subsequent `acquireTokenSilent` calls with the same scopes succeed silently. [VERIFIED: Microsoft Learn — scenario-spa-acquire-token]

### 2.2 Popup vs. Redirect — popup wins

**Use `acquireTokenPopup`.** Reasoning:
- `acquireTokenRedirect` causes a full-page navigation to login.microsoftonline.com and back. The wizard state (selected finding, impact preview, "Deploy in Report-Only mode" button hover) is **destroyed**.
- Recovery requires `handleRedirectPromise()` on app boot + a stored "where to resume" hint in sessionStorage. Implementable but high-bug-density.
- Popup preserves the SPA state. The only downside is popup blockers — which are not an issue when the popup is triggered directly by a user click event (browsers allow popups in user gestures). [VERIFIED]

### 2.3 Storing the resulting token

**Two layers of storage** are needed:

| Layer | Where | Lifetime | Purpose |
|-------|-------|----------|---------|
| Browser MSAL cache | `localStorage` via `cacheLocation: 'localStorage'` | Until logout | Lets the same user remediate again without re-prompting in the same browser session |
| Server (Key Vault envelope encryption) | `keyvault.ts` via new `storeRemediationToken(tenantId, scopeBundle, refreshToken)` | Long-lived | Lets the **background worker** call Graph on behalf of the user when the wizard kicks off async work. Refresh token rotated per Phase 1 envelope encryption pattern. |

**Critical:** the worker calls happen async after the user closes the browser tab. The browser-cached access token is useless to the worker. We MUST POST the refresh token to the backend after a successful `acquireTokenPopup` and store it server-side. The server then exchanges refresh→access on each worker invocation via MSAL Confidential Client Application.

### 2.4 Handling revoked consent between sessions

- Worker call → Graph returns 401 with `WWW-Authenticate: Bearer error="invalid_token"`.
- Worker marks `remediationJobs.status = 'failed'` with `errorCode = 'consent_revoked'`.
- Frontend detects this on the next finding interaction → triggers fresh `acquireTokenPopup` → re-stores token → user re-attempts.
- We do NOT proactively check consent status — there's no efficient API for this and the failure path is well-defined.

### 2.5 Bundling related scopes

Request **bundles by control family** (Option B in the topic 6 question — see Section 6 for the recommendation rationale). E.g., when the user clicks "Remediate" on any CA policy finding, the popup requests both `Policy.ReadWrite.ConditionalAccess` + `Policy.Read.All` together (the second is needed for prerequisite reads). Bundling 2-3 related scopes in a single popup is **idiomatic and expected** by users — they think "let the tool fix CA policies" not "grant 1 scope".

### 2.6 Code snippet

```typescript
// apps/web/src/services/remediation-consent.ts
import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser';

const SCOPE_BUNDLES = {
  conditionalAccess: ['Policy.ReadWrite.ConditionalAccess', 'Policy.Read.All'],
  authMethods:       ['Policy.ReadWrite.AuthenticationMethod'],
  authPolicy:        ['Policy.ReadWrite.Authorization'],
  roles:             ['RoleManagement.ReadWrite.Directory'],
  securityDefaults:  ['Policy.ReadWrite.SecurityDefaults'],
} as const;

export async function ensureRemediationConsent(
  msal: PublicClientApplication,
  bundle: keyof typeof SCOPE_BUNDLES,
): Promise<{ accessToken: string; refreshTokenForServer: string | null }> {
  const account = msal.getAllAccounts()[0];
  const scopes = SCOPE_BUNDLES[bundle];
  try {
    const result = await msal.acquireTokenSilent({ scopes, account });
    return { accessToken: result.accessToken, refreshTokenForServer: null };
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      const result = await msal.acquireTokenPopup({ scopes, account });
      // POST result to backend to envelope-encrypt and store in Key Vault
      return { accessToken: result.accessToken, refreshTokenForServer: extractRefreshHint(result) };
    }
    throw err;
  }
}
```

Note: `@azure/msal-browser` does NOT directly expose refresh tokens to the SPA (security-by-design). The server-side path is to use **MSAL Node Confidential Client** with the **on-behalf-of (OBO) flow**: the SPA sends its access token to the backend, the backend exchanges it for a long-lived refresh+access token pair scoped to the same user/scopes, and stores those server-side. This is the pattern Phase 4 already established for tenant onboarding — extend `oauth-consent.ts` accordingly.

---

## 3. Graph API Write Throttling Limits

### 3.1 Verified limits (Identity & Access service)

| Bucket | Reads | Writes |
|--------|-------|--------|
| **Per app + tenant** | 3,500–8,000 ResourceUnits / 10s (size-tiered) | **3,000 requests / 2 min 30 sec** |
| **Per application** (across all tenants) | 150,000 RU / 20s | **35,000 requests / 5 min** |
| **Per tenant** (across all apps) | N/A | **18,000 requests / 5 min** |

Source: [throttling-limits — Azure AD/Identity service](https://learn.microsoft.com/en-us/graph/throttling-limits) [VERIFIED]

### 3.2 What this means for Phase 7

- A single remediation = 1–4 write calls (read prereqs + create + read-back). Per tenant we'd burn ~4 of the 3,000-per-150s budget. **Throttling is unlikely** for single-tenant manual remediation.
- The risk surface is the **per-application** cap (35K/5min across all tenants). With 500 MSP tenants each doing 5 remediations/day, that's ~2,500 writes/day — well under budget.
- **CA policies are NOT specially throttled** — they fall under the same Identity service bucket. (The "CA policies are heavily throttled" folklore comes from a deprecated 2019 limit that no longer applies per current docs.) [VERIFIED]

### 3.3 Existing rate-limiter.ts assessment

`packages/audit/src/pipeline/rate-limiter.ts` is built around **request-count caps with 1-second delays**. It does NOT:
- Read the `Retry-After` header on 429 responses
- Distinguish read vs write buckets
- Track per-tenant vs per-app windows
- Implement exponential backoff

**Recommendation: extend, don't replace.** Phase 7 should add a sibling `WriteRateLimiter` class in the same file that:
1. On 429, reads `Retry-After` and sleeps that many seconds (clamped to max 60s).
2. Tracks a sliding window of write counts per (tenant, scope-bundle).
3. Pre-throttles when within 90% of the 3,000/150s bucket.
4. Falls back to exponential backoff if `Retry-After` is missing.

The existing reader limiter stays untouched — Phase 2 audit pipeline keeps using it.

```typescript
// packages/audit/src/pipeline/write-rate-limiter.ts (new)
export class WriteRateLimiter {
  private windowStart = Date.now();
  private writesInWindow = 0;
  private readonly WINDOW_MS = 150_000;          // 2:30
  private readonly MAX_WRITES = 3_000;
  private readonly THROTTLE_AT = 2_700;          // 90%

  async beforeWrite(): Promise<void> {
    if (Date.now() - this.windowStart >= this.WINDOW_MS) {
      this.windowStart = Date.now();
      this.writesInWindow = 0;
    }
    if (this.writesInWindow >= this.THROTTLE_AT) {
      const wait = this.WINDOW_MS - (Date.now() - this.windowStart);
      await new Promise(r => setTimeout(r, wait));
    }
    this.writesInWindow++;
  }

  async handle429(retryAfterSec?: string): Promise<void> {
    const sec = Math.min(parseInt(retryAfterSec ?? '10', 10), 60);
    await new Promise(r => setTimeout(r, sec * 1000));
  }
}
```

---

## 4. Impact Preview Data Sources

For RISKY remediations (REMED-03), the wizard shows lines like *"47 users on non-compliant devices will be blocked."* Sources:

| Preview Question | Source | Cost |
|-----------------|--------|------|
| Total user count | `AuditFacts.userCount` (Phase 2 collected) | Free / cached |
| MFA registration coverage | `AuditFacts.mfaRegisteredCount` / `AuditFacts.userCount` | Free / cached |
| Compliant device count | `AuditFacts.compliantDeviceCount` | Free / cached |
| Number of users on non-compliant devices | **NEW Graph call:** `GET /deviceManagement/managedDevices?$filter=complianceState eq 'noncompliant'&$select=userPrincipalName&$count=true` | 1 read |
| Recently signed-in users (last 30d) for affected scope | `GET /reports/getOffice365ActiveUserDetail(period='D30')` | 1 read |
| Apps with admin consent grants (for "block user consent") | `AuditFacts.adminConsentedAppCount` | Free / cached |
| Existing CA policies that would conflict | `AuditFacts.conditionalAccessPolicies[]` | Free / cached |

### 4.1 Recommendation: server-side at wizard-open time

Compute impact preview **server-side, fresh, at wizard-open time**. Reasons:
1. **Stale facts are dangerous** — a finding might be 6 hours old, and 6 hours is enough time for the user count to shift. Wrong impact preview = legal/contractual liability for an MSP.
2. **The preview is a one-shot click** — round-trip latency of 500ms-2s is acceptable for a wizard step the user explicitly opted into.
3. **Server has the fresh delegated token** anyway since the user just consented in the popup.
4. **Cached AuditFacts cover 80% of the data** — only the "drilling down" calls (e.g., `$filter=...&$count=true`) hit Graph fresh.

Implementation: add a route `POST /api/remediations/:findingId/preview` that:
1. Reads cached facts from the tenant DB.
2. Issues 1-3 targeted Graph reads for the dynamic fields.
3. Returns a `RemediationImpactPreview` object: `{ affectedUserCount, totalUserCount, conflictingPolicies[], warnings[], confidence: 'high' | 'estimated' }`.

```typescript
// apps/api/src/routes/remediations/preview.ts
export async function computeImpactPreview(
  findingId: string,
  graphClient: Client,
  facts: AuditFacts,
): Promise<RemediationImpactPreview> {
  const finding = await getFinding(findingId);

  if (finding.controlId === 'CA-REQUIRE-COMPLIANT-DEVICE') {
    const nonCompliant = await graphClient
      .api('/deviceManagement/managedDevices')
      .filter("complianceState eq 'noncompliant'")
      .count(true)
      .select('userPrincipalName')
      .get();

    return {
      affectedUserCount: new Set(nonCompliant.value.map((d: any) => d.userPrincipalName)).size,
      totalUserCount: facts.userCount,
      warnings: nonCompliant['@odata.count'] === 0
        ? ['All devices compliant — safe to enforce.']
        : [`${nonCompliant['@odata.count']} non-compliant devices detected. Affected users will lose access.`],
      confidence: 'high',
    };
  }
  // ... per-control-id handlers
}
```

---

## 5. Conditional Access Report-Only Mode Deep-Dive

### 5.1 Confirmed semantics

- The literal `state` value is **`enabledForReportingButNotEnforced`** (camel case, no hyphens). [VERIFIED]
- A policy in this state evaluates against every sign-in but **never blocks or grants** — instead, the result is logged in the `signIns` audit stream with a `conditionalAccessStatus` of `reportOnlyFailure` / `reportOnlySuccess` / `reportOnlyInterrupted` / `reportOnlyNotApplied`. [CITED]
- Transition to enforced is a **single PATCH**: `PATCH /identity/conditionalAccess/policies/{id}` body `{ "state": "enabled" }`. The policy ID does NOT change, so the `remediationJobs` row stores the same `targetResourceId` throughout. [VERIFIED]

### 5.2 Monitoring Report-Only impact via Graph

Query the sign-in logs filtered by the policy ID:

```http
GET /auditLogs/signIns?$filter=conditionalAccessPolicies/any(p: p/id eq '{policyId}' and p/result eq 'reportOnlySuccess' or p/result eq 'reportOnlyFailure')&$top=100
```

Required scope: `AuditLog.Read.All`. Scope is included in our existing read-only audit token (Phase 4) — no new consent needed for monitoring.

### 5.3 Best-practice waiting period

Microsoft's official guidance: **monitor Report-Only for at least 24-48 hours during normal business operation**, ideally a full week to catch weekly batch jobs. ([Microsoft Learn — Report-only mode](https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-conditional-access-report-only)) For Phase 7 v1, default the wizard's "next step ready" message to "Wait at least 24 hours, then return here to enforce" but allow the user to click Enforce sooner with a confirmation modal.

### 5.4 Gotchas when flipping Report-Only → Enabled

- **Existing exclusions stay applied.** No surprise re-targeting.
- **Sessions are re-evaluated on next token refresh, not immediately.** Users with active sign-ins stay signed in for up to 1 hour (default access token lifetime). This is actually a feature — gives a soft rollout window.
- **PATCH state-only is sufficient.** Do NOT re-send the entire policy body (risks accidentally clobbering fields the user changed in the portal).
- **`modifiedDateTime` updates** — capture it in the new afterSnapshot for audit trail accuracy.

---

## 6. Write-Scope Bundling — Recommendation

| Option | Description | Bundles needed |
|--------|-------------|----------------|
| A | 1 scope per remediation | ~12+ |
| **B** | **Group by control family** | **5** |
| C | 2 mega-bundles ("identity writes" / "security writes") | 2 |

**Recommendation: Option B (5 bundles by control family).**

| Bundle | Scopes | Triggers | Rationale |
|--------|--------|----------|-----------|
| `conditionalAccess` | `Policy.ReadWrite.ConditionalAccess`, `Policy.Read.All` | All CA policy create/update/delete remediations | Single most common remediation family |
| `authMethods` | `Policy.ReadWrite.AuthenticationMethod` | Disable SMS, enable FIDO2, configure Authenticator | Distinct concept users will recognize |
| `authPolicy` | `Policy.ReadWrite.Authorization` | User consent settings, admin consent request flow, guest user role | Both touch `/policies/authorizationPolicy` |
| `roles` | `RoleManagement.ReadWrite.Directory` | Add/remove admin role assignments | Highest-blast-radius bundle — needs its own consent prompt |
| `securityDefaults` | `Policy.ReadWrite.SecurityDefaults` | Toggle Security Defaults | Mutually exclusive with CA, justifies own bundle |

**Reasoning:**
- Option A (per-remediation): too many popups → consent fatigue → users blanket-approve everything.
- Option C (2 mega-bundles): asks for far more than the user actually needs at first — violates REMED-08 minimum-privilege intent.
- **Option B matches the user's mental model** ("I want to fix CA stuff", "I want to fix MFA stuff") and minimizes popups while staying min-privilege.

`tenantRemediationConsents` schema (control plane):

```typescript
{
  id: uuid (PK),
  tenantId: uuid (FK),
  scopeBundle: 'conditionalAccess' | 'authMethods' | 'authPolicy' | 'roles' | 'securityDefaults',
  consentedAt: datetime,
  consentedByUserId: uuid,
  refreshTokenSecretName: string,  // Key Vault reference
  revokedAt: datetime | null,
  lastUsedAt: datetime | null,
}
```

Unique constraint on `(tenantId, scopeBundle)` where `revokedAt is null`.

---

## 7. Rollback Edge Cases

### 7.1 Schema drift in beforeSnapshot

**Problem:** A snapshot taken in 2026-04 contains `conditions.users.includeUsers[]` but the Graph schema in 2026-10 has renamed it.

**Reality check:** Graph v1.0 follows strict semver — breaking field renames are extremely rare and announced 12+ months in advance. The risk is real but small.

**Recommendation:** On rollback failure due to 400 Bad Request, capture the Graph error body, mark the row `status = 'rollback_failed'`, and surface the error to the user with a "manual rollback required" link to the admin portal. Don't try to be clever about schema migration.

### 7.2 Drift between snapshot and current state

**Problem:** Admin manually edits the policy in Entra portal between remediation and rollback. Rollback would silently overwrite their manual change.

**Recommendation: compute a drift score.** Before rollback:
1. GET the current state of the resource.
2. Diff against `afterSnapshot` (what we wrote during remediation).
3. If the diff is non-empty → require explicit user confirmation: *"This resource has been modified since the remediation. Rolling back will discard those changes. Continue?"*
4. Diff implementation: shallow JSON compare on writable fields only (skip `modifiedDateTime`, `createdDateTime`, `policyVersion`).

This is **REMED-06 quality of life** but worth the effort — silent overwrites of admin work are the #1 trust-killer for MSP tools.

### 7.3 Partial rollback failure

**Problem:** Rollback issues 3 PATCH calls; the 2nd one fails.

**Recommendation: rollback is NOT idempotent and should fail-fast.**
- Mark `status = 'rollback_partial'` with a `rollbackError` field describing which step failed.
- Do NOT retry automatically.
- Surface to UI with "rollback partially completed — review manually" + a JSON diff of what was/wasn't restored.
- Reasoning: idempotent retries assume operations commute, but Graph PATCHes on `authorizationPolicy` and CA policies do not commute (e.g., setting state before conditions vs. after has different runtime effect).

### 7.4 DELETE-then-recreate rollback

For remediations that DELETE a resource, rollback is POST. The POST will return a **new ID** different from the original. The `remediationJobs.targetResourceId` field should be updated to the new ID after a successful recreate-rollback. Document this as expected behavior — downstream audit references will need to follow.

---

## 8. Background Worker Process Model

### 8.1 In-process is fine for v1 — recommendation: keep it

CONTEXT decided in-process setInterval. After review, **this is correct for v1** but with one addition (heartbeat — see below).

| Concern | Verdict |
|---------|---------|
| Crash mid-remediation loses in-flight work | **Accepted risk for v1.** Graph operations are mostly idempotent (PATCH with snapshot is safe to replay). User clicks Remediate again → executor detects existing object via prerequisite check → either skips or completes. |
| Multi-instance API → duplicate workers picking same job | **Mitigate with row-level lock.** When worker picks a `pending` job, it issues `UPDATE remediationJobs SET status='running', workerId=@self WHERE id=@id AND status='pending'` and checks rowcount == 1 before proceeding. |
| Graceful shutdown (SIGTERM) | Track in-flight job IDs in a module-level Set. On shutdown signal, stop the poll, await all in-flight promises with a 30-second cap, then exit. Phase 6 scheduler doesn't currently do this — Phase 7 should add it for both. |
| Hard crash → orphan jobs | **Add `heartbeatAt` column.** Worker updates this every 30s while running. A separate sweeper pass at poll start finds rows where `status='running' AND heartbeatAt < now() - 5 minutes` and resets them to `pending` with an incremented `attemptCount`. After 3 failed attempts → `failed`. |

### 8.2 When to graduate to a queue

- **Trigger 1:** Multi-instance API behind a load balancer (we're single-instance today).
- **Trigger 2:** Per-tenant SLA where lost work is contractually material.
- **Trigger 3:** Worker count needs to exceed 5–10 (current cap is 2 concurrent).

When triggers fire → migrate to **Azure Storage Queues** (cheaper than Service Bus, with at-least-once delivery + visibility timeout matching our heartbeat pattern). Migration surface: replace the `pollPendingJobs()` function in `remediation-worker.ts`. Everything else stays the same.

### 8.3 Recommended `remediationJobs` table additions

```sql
heartbeat_at        DATETIME2 NULL,
worker_id           VARCHAR(64) NULL,        -- pid + hostname for debugging
attempt_count       INT NOT NULL DEFAULT 0,
last_attempt_error  NVARCHAR(MAX) NULL,
```

Indexes:
- `(status, scheduled_at)` for the poll query
- `(status, heartbeat_at)` for the zombie sweeper
- `(tenant_id, finding_id)` for UI lookups

---

## Sources

### Primary (HIGH confidence — verified Microsoft Learn)
- [Create conditionalAccessPolicy](https://learn.microsoft.com/en-us/graph/api/conditionalaccessroot-post-policies?view=graph-rest-1.0)
- [conditionalAccessPolicy resource type](https://learn.microsoft.com/en-us/graph/api/resources/conditionalaccesspolicy?view=graph-rest-1.0)
- [Update authenticationMethodsPolicy](https://learn.microsoft.com/en-us/graph/api/authenticationmethodspolicy-update?view=graph-rest-1.0)
- [Microsoft Graph throttling overview](https://learn.microsoft.com/en-us/graph/throttling)
- [Microsoft Graph throttling limits — Identity service](https://learn.microsoft.com/en-us/graph/throttling-limits)
- [SPA acquire token (MSAL.js)](https://learn.microsoft.com/en-us/entra/identity-platform/scenario-spa-acquire-token)

### Secondary (verified pattern from internal Phase 1/4/6 code)
- `apps/api/src/services/scheduler.ts` — worker pattern reference
- `apps/api/src/services/keyvault.ts` — envelope encryption pattern
- `packages/audit/src/pipeline/rate-limiter.ts` — existing read limiter to extend

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | MSAL.js does not directly expose refresh tokens to SPAs (must use OBO flow server-side) | 2.3 | Forces server-side OBO setup; mitigation is to use existing Phase 4 oauth-consent.ts pattern |
| A2 | Microsoft's published 24-48hr Report-Only monitoring guidance reflects actual runtime needs | 5.3 | Affects default UI copy only; user can override |
| A3 | Phase 6 scheduler graceful-shutdown gap will be addressed in Phase 7 alongside the worker | 8.1 | Could be split into a separate cleanup task if scope creep concerns arise |
| A4 | `policyVersion` on authenticationMethodsPolicy can be used for optimistic concurrency | 1.2 | If incorrect, executors fall back to last-write-wins (acceptable for v1) |

---

## Confidence Breakdown

| Area | Level | Reason |
|------|-------|--------|
| Graph endpoints (Section 1) | HIGH | All verified against current Microsoft Learn docs as of 2025-12 |
| MSAL incremental consent (Section 2) | HIGH for happy-path, MEDIUM for edge cases | Pattern is standard; OBO server-side handoff is established but project-specific |
| Throttling limits (Section 3) | HIGH | Direct from throttling-limits doc, current as of 2025-08 |
| Impact preview architecture (Section 4) | HIGH | Pure design recommendation backed by latency math |
| Report-Only mode (Section 5) | HIGH | All field values verified |
| Scope bundles (Section 6) | MEDIUM | Recommendation; trade-off space is real but Option B is the consensus pattern across MS docs |
| Rollback edge cases (Section 7) | MEDIUM | Drift detection is judgment call; recommendation is conservative |
| Worker process model (Section 8) | HIGH | Mirrors verified Phase 6 pattern |

**Research date:** 2026-04-14
**Valid until:** 2026-07-14 (90 days — Graph v1.0 is stable but throttling limits change quarterly)
