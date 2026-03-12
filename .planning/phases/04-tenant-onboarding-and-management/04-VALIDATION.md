---
phase: 4
slug: tenant-onboarding-and-management
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^2.0.0 |
| **Config file** | `apps/api/vitest.config.ts`, `apps/web/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @omzig/api test && pnpm --filter @omzig/web test` |
| **Full suite command** | `pnpm -r test` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @omzig/api test && pnpm --filter @omzig/web test`
- **After every plan wave:** Run `pnpm -r test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | TENANT-01 | unit | `pnpm --filter @omzig/api vitest run src/__tests__/oauth-consent.test.ts -x` | W0 | pending |
| 04-01-02 | 01 | 1 | TENANT-02, TENANT-08 | unit | `pnpm --filter @omzig/api vitest run src/__tests__/gdap-verification.test.ts src/__tests__/tenant-provisioning.test.ts -x` | W0 | pending |
| 04-02-01 | 02 | 2 | TENANT-03, TENANT-07 | unit | `pnpm --filter @omzig/api vitest run src/__tests__/tenant-routes.test.ts -x` | W0 | pending |
| 04-03-01 | 03 | 3 | TENANT-03 | unit | `pnpm --filter @omzig/web vitest run src/__tests__/TenantDashboard.test.tsx -x` | W0 | pending |
| 04-03-02 | 03 | 3 | TENANT-04 | unit | `pnpm --filter @omzig/web vitest run src/__tests__/TenantDetail.test.tsx -x` | W0 | pending |
| 04-04-01 | 04 | 3 | TENANT-01, TENANT-02, TENANT-08 | unit | `pnpm --filter @omzig/web vitest run src/__tests__/OnboardingWizard.test.tsx -x` | W0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `apps/api/src/__tests__/oauth-consent.test.ts` — stubs for TENANT-01 (consent URL, callback, token exchange)
- [ ] `apps/api/src/__tests__/gdap-verification.test.ts` — stubs for TENANT-02 (relationship lookup, status check)
- [ ] `apps/api/src/__tests__/tenant-routes.test.ts` — stubs for TENANT-03, TENANT-07 (CRUD, list with scores, soft delete, wizard-state CRUD)
- [ ] `apps/api/src/__tests__/tenant-provisioning.test.ts` — stubs for TENANT-01, TENANT-08 (DB creation, migration, token storage)
- [ ] `apps/web/src/__tests__/TenantDashboard.test.tsx` — stubs for TENANT-03 (card grid, table toggle, health dots)
- [ ] `apps/web/src/__tests__/TenantDetail.test.tsx` — stubs for TENANT-04 (tenant context, audit component reuse)
- [ ] `apps/web/src/__tests__/OnboardingWizard.test.tsx` — stubs for TENANT-01, TENANT-02, TENANT-08 (wizard steps, DB persistence via wizard-state API)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| OAuth consent redirect to Microsoft login | TENANT-01 | Requires real Entra ID app registration and browser interaction | Navigate to /tenants/new, select OAuth, verify redirect URL format, complete consent in test tenant |
| GDAP relationship verification against real Partner Center | TENANT-02 | Requires active GDAP relationship | Enter known relationship ID, verify tenant ID auto-detection and role display |
| Wizard step navigation and progress display | TENANT-01 | Visual correctness of wizard UX flow | Walk through all 5 wizard steps, verify step indicators and transitions |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
