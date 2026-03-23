---
phase: 1
slug: foundation-and-authentication
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `pnpm --filter api test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter api test`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | INFRA-07 | smoke | `pnpm build` | — Wave 0 | ⬜ pending |
| 01-01-02 | 01 | 1 | INFRA-01 | smoke | `pnpm --filter web build` | — Wave 0 | ⬜ pending |
| 01-02-01 | 02 | 1 | INFRA-02 | smoke | `pnpm --filter api test -- --run health.test.ts` | — Wave 0 | ⬜ pending |
| 01-02-02 | 02 | 1 | AUTH-01 | unit | `pnpm --filter api test -- --run auth.test.ts` | — Wave 0 | ⬜ pending |
| 01-02-03 | 02 | 1 | AUTH-02 | unit | `pnpm --filter api test -- --run mfa.test.ts` | — Wave 0 | ⬜ pending |
| 01-02-04 | 02 | 1 | AUTH-03 | unit | `pnpm --filter api test -- --run rbac.test.ts` | — Wave 0 | ⬜ pending |
| 01-03-01 | 03 | 2 | INFRA-04 | integration | `pnpm --filter db test -- --run tenant-isolation.test.ts` | — Wave 0 | ⬜ pending |
| 01-03-02 | 03 | 2 | AUTH-04 | integration | `pnpm --filter api test -- --run keyvault.test.ts` | — Wave 0 | ⬜ pending |
| 01-03-03 | 03 | 2 | AUTH-05 | integration | Manual verification in deployed environment | N/A | ⬜ pending |
| 01-03-04 | 03 | 2 | AUTH-07 | integration | Manual verification via Bicep deployment | N/A | ⬜ pending |
| 01-03-05 | 03 | 2 | INFRA-05 | integration | Manual verification via Bicep deployment | N/A | ⬜ pending |
| 01-03-06 | 03 | 2 | INFRA-06 | integration | `pnpm --filter api test -- --run keyvault.test.ts` | — Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/api/vitest.config.ts` — Vitest configuration for API
- [ ] `packages/db/vitest.config.ts` — Vitest configuration for DB package
- [ ] `apps/api/src/__tests__/auth.test.ts` — JWT validation tests (stub)
- [ ] `apps/api/src/__tests__/mfa.test.ts` — MFA claim validation tests (stub)
- [ ] `apps/api/src/__tests__/rbac.test.ts` — RBAC middleware tests (stub)
- [ ] `apps/api/src/__tests__/health.test.ts` — Health endpoint tests (stub)
- [ ] `apps/api/src/__tests__/keyvault.test.ts` — Key Vault integration tests (stub)
- [ ] `packages/db/src/__tests__/tenant-isolation.test.ts` — Tenant DB isolation tests (stub)
- [ ] Framework install: `pnpm add -D vitest` (in api and db packages)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Managed identity authenticates to Key Vault and SQL | AUTH-05 | Requires deployed Azure environment with system-assigned identity | Deploy to Azure, verify Container Apps can access Key Vault and SQL without credentials in env vars |
| SQL accessible only via private endpoint | AUTH-07 | Requires Azure networking configuration | Deploy Bicep, verify SQL firewall blocks public access, verify Container Apps VNet can connect |
| SignalR serverless mode configured | INFRA-05 | Requires deployed Azure resources | Deploy Bicep, verify SignalR resource exists in serverless mode |

*These behaviors verified during integration testing on Azure, not in CI.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
