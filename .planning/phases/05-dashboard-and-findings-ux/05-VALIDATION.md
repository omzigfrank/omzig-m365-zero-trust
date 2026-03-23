---
phase: 5
slug: dashboard-and-findings-ux
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 2.0 + @testing-library/react 14.3 + jsdom 24.1 |
| **Config file** | `apps/web/vitest.config.ts`, `apps/api/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @omzig/web test && pnpm --filter @omzig/api test` |
| **Full suite command** | `pnpm -r test` |
| **Estimated runtime** | ~25 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @omzig/web test && pnpm --filter @omzig/api test`
- **After every plan wave:** Run `pnpm -r test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 25 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | DASH-05, DASH-06, DASH-07 | unit | `pnpm --filter @omzig/audit vitest run src/remediation/__tests__/remediation-registry.test.ts -x` | W0 | pending |
| 05-02-01 | 02 | 2 | DASH-01 | unit | `pnpm --filter @omzig/web vitest run src/__tests__/GroupedFindings.test.tsx -x` | W0 | pending |
| 05-02-02 | 02 | 2 | DASH-02 | unit | `pnpm --filter @omzig/web vitest run src/__tests__/FilterBar.test.tsx -x` | W0 | pending |
| 05-02-03 | 02 | 2 | DASH-05, DASH-06, DASH-07 | unit | `pnpm --filter @omzig/web vitest run src/__tests__/FindingDetail.test.tsx -x` | W0 | pending |
| 05-03-01 | 03 | 3 | DASH-10 | unit | `pnpm --filter @omzig/web vitest run src/__tests__/ActionQueue.test.tsx -x` | W0 | pending |
| 05-03-02 | 03 | 3 | DASH-10 | unit | `pnpm --filter @omzig/api vitest run src/__tests__/action-queue.test.ts -x` | W0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `packages/audit/src/remediation/__tests__/remediation-registry.test.ts` — stubs for DASH-05 (all 101 controls have remediation entries, structure validation)
- [ ] `apps/web/src/__tests__/GroupedFindings.test.tsx` — stubs for DASH-01 (accordion expand/collapse, drawer opens on click)
- [ ] `apps/web/src/__tests__/FilterBar.test.tsx` — stubs for DASH-02 (multi-select filters, active badge counts, clear all)
- [ ] `apps/web/src/__tests__/FindingDetail.test.tsx` — stubs for DASH-05, DASH-06, DASH-07 (remediation steps, portal links, PowerShell display)
- [ ] `apps/web/src/__tests__/PowerShellBlock.test.tsx` — stubs for DASH-07 (syntax highlighting, copy button)
- [ ] `apps/web/src/__tests__/ActionQueue.test.tsx` — stubs for DASH-10 (queue items, dismiss, empty state)
- [ ] `apps/api/src/__tests__/action-queue.test.ts` — stubs for DASH-10 (GET/POST action queue API routes)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Drawer slide-over animation smoothness | DASH-01 | CSS transition visual quality | Open drawer, verify smooth 200ms slide-in from right |
| PowerShell syntax highlighting visual correctness | DASH-07 | Color rendering in browser | View PowerShell block, verify keyword coloring matches expected pattern |
| Admin portal link opens correct Microsoft page | DASH-06 | Requires real Entra admin center session | Click portal link in drawer, verify correct admin page loads in new tab |
| Action queue dismiss persists across page reload | DASH-10 | Full stack persistence flow | Dismiss an item, refresh page, verify item remains dismissed |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 25s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
