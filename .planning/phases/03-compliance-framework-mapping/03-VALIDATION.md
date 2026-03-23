---
phase: 3
slug: compliance-framework-mapping
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^2.0.0 |
| **Config file** | `packages/audit/vitest.config.ts` |
| **Quick run command** | `cd packages/audit && pnpm test` |
| **Full suite command** | `pnpm -r test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd packages/audit && pnpm test`
- **After every plan wave:** Run `pnpm -r test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | FRAME-02 | unit | `cd packages/audit && pnpm vitest run src/__tests__/zta-evaluators.test.ts -x` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | FRAME-03 | unit | `cd packages/audit && pnpm vitest run src/__tests__/nist-80053-evaluators.test.ts -x` | ❌ W0 | ⬜ pending |
| 03-01-03 | 01 | 1 | FRAME-04 | unit | `cd packages/audit && pnpm vitest run src/__tests__/csf-evaluators.test.ts -x` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 2 | FRAME-05 | unit | `cd packages/audit && pnpm vitest run src/__tests__/score-computation.test.ts -x` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 2 | FRAME-06 | unit | `cd packages/audit && pnpm vitest run src/__tests__/maturity-calculator.test.ts -x` | ❌ W0 | ⬜ pending |
| 03-03-01 | 03 | 2 | FRAME-07 | unit | `cd apps/web && pnpm vitest run src/__tests__/ZtaMaturityRadar.test.tsx -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/audit/src/__tests__/zta-evaluators.test.ts` — stubs for FRAME-02
- [ ] `packages/audit/src/__tests__/nist-80053-evaluators.test.ts` — stubs for FRAME-03
- [ ] `packages/audit/src/__tests__/csf-evaluators.test.ts` — stubs for FRAME-04
- [ ] `packages/audit/src/__tests__/score-computation.test.ts` — stubs for FRAME-05
- [ ] `packages/audit/src/__tests__/maturity-calculator.test.ts` — stubs for FRAME-06
- [ ] `apps/web/src/__tests__/ZtaMaturityRadar.test.tsx` — stubs for FRAME-07 (requires recharts test setup)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Radar chart visual rendering | FRAME-07 | Visual correctness of chart layout and overlay | Open audit results page, verify 7-axis radar with solid/dotted layers |
| Cross-framework badge display | FRAME-03, FRAME-04 | Visual correctness of inline badges | View finding detail, verify badges show 800-53/CSF/ZTA cross-refs |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
