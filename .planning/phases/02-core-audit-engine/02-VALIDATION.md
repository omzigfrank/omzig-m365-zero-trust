---
phase: 2
slug: core-audit-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 2 -- Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x |
| **Config files** | packages/audit/vitest.config.ts, apps/api/vitest.config.ts, apps/web/vitest.config.ts |
| **Quick run command (audit)** | `pnpm --filter @omzig/audit test` |
| **Quick run command (api)** | `pnpm --filter api test` |
| **Quick run command (web)** | `pnpm --filter web test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run the relevant package test (`pnpm --filter @omzig/audit test` or `pnpm --filter api test` or `pnpm --filter web test`)
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | FRAME-01, AUDIT-04 | unit | `pnpm --filter @omzig/audit test -- --run control-registry.test.ts` | -- Wave 0 | pending |
| 02-01-02a | 01 | 1 | AUDIT-04 | unit | `pnpm --filter @omzig/audit test -- --run fact-collector.test.ts` | -- Wave 0 | pending |
| 02-01-02b | 01 | 1 | AUDIT-04 | unit | `pnpm --filter @omzig/audit test -- --run fact-collector.test.ts` | -- Wave 0 | pending |
| 02-02-01 | 02 | 1 | AUDIT-01, AUDIT-05 | unit | `pnpm --filter api test -- --run signalr.test.ts` | -- Wave 0 | pending |
| 02-02-02 | 02 | 1 | AUDIT-01, AUDIT-05 | unit | `pnpm --filter api test -- --run audit-routes.test.ts` | -- Wave 0 | pending |
| 02-03-01 | 03 | 2 | AUDIT-02, AUDIT-03, AUDIT-06 | unit | `pnpm --filter @omzig/audit test -- --run evaluators.test.ts` | -- Wave 0 | pending |
| 02-03-02 | 03 | 2 | AUDIT-01, AUTH-06 | unit | `pnpm --filter @omzig/audit test -- --run audit-runner.test.ts` | -- Wave 0 | pending |
| 02-03-03 | 03 | 2 | AUDIT-01 | unit | `pnpm --filter web test -- --run useAudit.test.ts` | -- Wave 0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `packages/audit/src/__tests__/control-registry.test.ts` -- CISA control registry tests (stub, created by 02-01 T1)
- [ ] `packages/audit/src/__tests__/fact-collector.test.ts` -- Graph API fact collection tests (stub, created by 02-01 T2b)
- [ ] `packages/audit/src/__tests__/fixtures/graph-responses.ts` -- Mock Graph API responses (created by 02-01 T1)
- [ ] `apps/api/src/__tests__/signalr.test.ts` -- SignalR service tests (stub, created by 02-02 T1)
- [ ] `apps/api/src/__tests__/audit-routes.test.ts` -- Audit API endpoint tests (stub, created by 02-02 T2)
- [ ] `packages/audit/src/__tests__/evaluators.test.ts` -- Evaluator pass/fail logic tests (stub, created by 02-03 T1)
- [ ] `packages/audit/src/__tests__/audit-runner.test.ts` -- Audit pipeline tests (stub, created by 02-03 T2)
- [ ] `apps/web/src/hooks/__tests__/useAudit.test.ts` -- useAudit hook behavioral tests (stub, created by 02-03 T3)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SignalR real-time progress during audit | AUDIT-01 | Requires deployed SignalR instance and WebSocket connection | Deploy to Azure, trigger audit, verify progress updates appear in browser console |
| Graph API calls against real M365 tenant | AUDIT-02 | Requires live M365 tenant with permissions granted | Connect test tenant, run audit, verify 29 controls produce results |

*These behaviors verified during integration testing on Azure, not in CI.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
