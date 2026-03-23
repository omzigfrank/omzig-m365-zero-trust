---
phase: 6
slug: scheduling-reporting-and-trending
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 2.0 + @testing-library/react 14.3 + jsdom 24.1 |
| **Config file** | `apps/api/vitest.config.ts`, `apps/web/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @omzig/api test && pnpm --filter @omzig/web test` |
| **Full suite command** | `pnpm -r test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @omzig/api test` or `pnpm --filter @omzig/web test` (whichever is relevant)
- **After every plan wave:** Run `pnpm -r test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | TENANT-05, TENANT-06 | unit | `pnpm --filter @omzig/api vitest run src/__tests__/scheduler.test.ts -x` | W0 | pending |
| 06-01-02 | 01 | 1 | TENANT-05 | unit | `pnpm --filter @omzig/api vitest run src/__tests__/schedule-routes.test.ts -x` | W0 | pending |
| 06-02-01 | 02 | 2 | DASH-03 | unit | `pnpm --filter @omzig/api vitest run src/__tests__/pdf-report.test.ts -x` | W0 | pending |
| 06-02-02 | 02 | 2 | DASH-03 | unit | `pnpm --filter @omzig/api vitest run src/__tests__/svg-charts.test.ts -x` | W0 | pending |
| 06-02-03 | 02 | 2 | DASH-04 | unit | `pnpm --filter @omzig/web vitest run src/__tests__/ExportButtons.test.tsx -x` | W0 | pending |
| 06-03-01 | 03 | 2 | DASH-08 | unit | `pnpm --filter @omzig/api vitest run src/__tests__/audit-history.test.ts -x` | W0 | pending |
| 06-03-02 | 03 | 2 | DASH-09 | unit | `pnpm --filter @omzig/web vitest run src/__tests__/TrendChart.test.tsx -x` | W0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `apps/api/src/__tests__/scheduler.test.ts` — stubs for TENANT-05, TENANT-06 (scheduler polling, concurrency, stagger)
- [ ] `apps/api/src/__tests__/schedule-routes.test.ts` — stubs for TENANT-05 (PATCH schedule route validation)
- [ ] `apps/api/src/__tests__/pdf-report.test.ts` — stubs for DASH-03 (PDF endpoint returns binary, both report types)
- [ ] `apps/api/src/__tests__/svg-charts.test.ts` — stubs for DASH-03 (SVG generation for radar, bars, trend)
- [ ] `apps/web/src/__tests__/ExportButtons.test.tsx` — stubs for DASH-04 (enhanced CSV columns, filter-aware export)
- [ ] `apps/api/src/__tests__/audit-history.test.ts` — stubs for DASH-08 (history API returns scores per audit run)
- [ ] `apps/web/src/__tests__/TrendChart.test.tsx` — stubs for DASH-09 (LineChart renders, <3 audit threshold message)
- [ ] PDFKit install: `cd apps/api && pnpm add pdfkit svg-to-pdfkit && pnpm add -D @types/pdfkit`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| PDF visual layout (margins, fonts, charts) | DASH-03 | PDF rendering quality requires visual inspection | Generate both report types, open in viewer, verify layout matches design |
| Trend chart visual correctness (5 lines, colors, legend) | DASH-09 | Chart rendering in browser | Navigate to Audit History tab with 3+ audits, verify 5 lines with correct colors |
| Scheduled scan actually triggers at configured time | TENANT-06 | Timing-dependent behavior | Configure daily scan, wait for next trigger window, verify audit run created |
| CSV opens correctly in Excel with ~20 columns | DASH-04 | Excel rendering compatibility | Export CSV, open in Excel, verify all columns parse correctly |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
