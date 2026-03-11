---
phase: 2
slug: core-audit-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x |
| **Config file** | apps/api/vitest.config.ts (existing) |
| **Quick run command** | `pnpm --filter api test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter api test`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | AUDIT-04 | unit | `pnpm --filter api test -- --run fact-collector.test.ts` | — Wave 0 | ⬜ pending |
| 02-01-02 | 01 | 1 | FRAME-01 | unit | `pnpm --filter api test -- --run control-registry.test.ts` | — Wave 0 | ⬜ pending |
| 02-02-01 | 02 | 1 | AUDIT-02, AUDIT-03 | unit | `pnpm --filter api test -- --run evaluators.test.ts` | — Wave 0 | ⬜ pending |
| 02-02-02 | 02 | 1 | AUDIT-05 | unit | `pnpm --filter db test -- --run audit-schema.test.ts` | — Wave 0 | ⬜ pending |
| 02-03-01 | 03 | 2 | AUDIT-01, AUDIT-06 | integration | `pnpm --filter api test -- --run audit-routes.test.ts` | — Wave 0 | ⬜ pending |
| 02-03-02 | 03 | 2 | AUTH-06 | unit | `pnpm --filter api test -- --run graph-client.test.ts` | — Wave 0 | ⬜ pending |
| 02-03-03 | 03 | 2 | AUDIT-01 | integration | Manual verification — trigger audit via API | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/api/src/__tests__/fact-collector.test.ts` — Graph API fact collection tests (stub)
- [ ] `apps/api/src/__tests__/control-registry.test.ts` — CISA control registry tests (stub)
- [ ] `apps/api/src/__tests__/evaluators.test.ts` — Evaluator pass/fail logic tests (stub)
- [ ] `apps/api/src/__tests__/audit-routes.test.ts` — Audit API endpoint tests (stub)
- [ ] `apps/api/src/__tests__/graph-client.test.ts` — Graph SDK client tests (stub)
- [ ] `packages/db/src/__tests__/audit-schema.test.ts` — Audit schema/migration tests (stub)
- [ ] Framework install: `pnpm add -D @microsoft/microsoft-graph-types` (in api package)

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
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
