---
phase: 06-scheduling-reporting-and-trending
plan: 02
subsystem: reporting
tags: [reporting, pdf, csv, charts, svg, api, history, multi-tenant]
requires:
  - Plan 06-01 schedule columns and scheduler service
  - @omzig/db auditRuns, auditFindings, maturityScores, tenants schemas
  - existing auth / MFA / withTenantDb middleware chain
provides:
  - server-side PDF compliance report generation (executive + full)
  - server-side SVG chart rendering (radar, framework bars, trend line)
  - single-audit CSV export with ~20 columns
  - multi-tenant combined CSV export across an org
  - audit history API with per-framework scores computed from findings
affects:
  - apps/api/src/routes/audits.ts (new endpoints, route ordering)
  - apps/api/package.json (pdfkit + svg-to-pdfkit)
tech-stack:
  added:
    - pdfkit (PDF generation)
    - svg-to-pdfkit (embed SVG charts inside PDF documents)
    - "@types/pdfkit"
  patterns:
    - "Pure-string SVG templating (no DOM dependency) so charts can be
       generated server-side and embedded in PDFs or streamed as HTML"
    - "Consistent CSV quoting (ALL fields wrapped in double quotes, internal
       quotes doubled) to avoid RFC-4180 edge cases with commas/newlines"
    - "Batched findings fetch via drizzle inArray() to avoid N+1 when
       computing per-run framework scores across an org's audit history"
    - "PDF Buffer collection pattern: doc.on('data') -> chunks[],
       resolve on doc.on('end')"
key-files:
  created:
    - apps/api/src/services/svg-charts.ts
    - apps/api/src/services/csv-export.ts
    - apps/api/src/services/pdf-report.ts
    - apps/api/src/__tests__/svg-charts.test.ts
    - apps/api/src/__tests__/csv-export.test.ts
    - apps/api/src/__tests__/pdf-report.test.ts
    - apps/api/src/__tests__/audit-history.test.ts
  modified:
    - apps/api/src/routes/audits.ts
    - apps/api/package.json
    - pnpm-lock.yaml
decisions:
  - "Use pdfkit + svg-to-pdfkit rather than a headless browser for PDF
    generation — much lighter runtime footprint, no Chromium dependency,
    and all charts are already rendered as pure SVG strings"
  - "All CSV fields are unconditionally quoted rather than quoting only
    when required — simpler code path and eliminates edge cases with
    leading/trailing whitespace, embedded newlines, and commas"
  - "Batch findings and maturity via drizzle inArray() for history API
    instead of one query per run (PITFALL 4 — N+1 avoidance)"
  - "Routes with literal path segments (/tenants/export/csv,
    /tenants/:tenantId/audits/history, .../report, .../export/csv)
    registered BEFORE /tenants/:tenantId/audits/:auditId so the literal
    segments match ahead of the parameter captures"
  - "Multi-tenant CSV endpoint opens each tenant DB on-demand and closes
    in a try/finally — avoids holding N connections open while streaming
    and matches the existing withTenantDb middleware pattern"
  - "On CSV header-only path (org has no audited tenants), still return
    200 with valid CSV containing the full column list rather than 204
    or an error — lets downstream tools load the file without special
    casing"
requirements:
  - DASH-03
  - DASH-04
  - DASH-08
metrics:
  duration: ~25 minutes
  completed: 2026-04-14
  tasks_completed: 2
  files_changed: 9
  tests_added: 47
  tests_passing: 191
---

# Phase 6 Plan 02: Backend Reporting Services Summary

Add backend services and API endpoints for PDF compliance reports, SVG
chart rendering, enhanced CSV export, multi-tenant CSV export, and audit
history with per-framework scores. All work is backend-only; the frontend
consumers land in Plan 06-03.

## What was built

### SVG chart service (`apps/api/src/services/svg-charts.ts`)

- `escapeXml(text)` — null-safe XML escaping for `&`, `<`, `>`, `"`.
  Applied to every text value inserted into an SVG template so user data
  can never break the document structure.
- `renderRadarSvg(tenets, w, h)` — spider chart with grid circles at
  25/50/75/100%, axis lines, blue-filled polygon showing weighted pass
  rate per ZTA tenet, and radial tenet labels.
- `renderFrameworkBarSvg(scores, w, h)` — horizontal bar chart. Fixed
  color palette: AAD=#059669, ZTA=#d97706, 80053=#7c3aed, CSF=#dc2626,
  Overall=#1e40af.
- `renderTrendLineSvg(data, w, h)` — 5 polylines (Overall + 4 frameworks)
  over time, with Y-axis grid at 0/25/50/75/100, X-axis date labels, and
  a simple in-chart legend.
- All three functions handle empty input by returning a valid SVG with a
  centered "no data" message instead of throwing.

### CSV export service (`apps/api/src/services/csv-export.ts`)

- `CSV_COLUMNS` — ordered array of 19 column descriptors:
  `Tenant Name, Tenant ID, Audit ID, Audit Date, Control ID, Product,
   Description, Requirement Level, Severity, Status, Message, Action,
   Setting Name, Current Value, Expected Value, NIST 800-53, NIST CSF,
   ZTA Tenet, Required Permission`.
- `generateFindingsCsv(findings, run?, tenant?)` — when `tenant` is
  `null`/`undefined`, omits the Tenant Name and Tenant ID columns; when
  provided, places them as the first two columns. Every field is quoted
  and internal double quotes are doubled.
- `generateMultiTenantCsv(tenantFindings[])` — always includes Tenant
  Name + Tenant ID. Input is sorted alphabetically (case-insensitive) by
  tenant display name before rows are emitted.

### PDF report service (`apps/api/src/services/pdf-report.ts`)

- `generateExecutiveReport(data)` — 2-3 pages:
  1. Branded header, title, tenant name, audit date, large overall
     score, framework bar chart (embedded SVG).
  2. Top 5 critical/high-severity failing findings (sorted by severity
     rank) with control id, severity, and message; ZTA maturity summary.
  3. (Conditional) Radar chart SVG if maturity data is present.
- `generateFullReport(data)` — executive content plus one page per
  framework (AAD, ZTA, 80053, CSF) with all findings rendered as
  controlId / severity / rating / message / action blocks, with
  auto-pagination when the cursor exceeds the bottom margin; trend-line
  chart page at the end when `trendData.length >= 3`.
- Both return a Node `Buffer` collected via the standard PDFKit stream
  pattern (`doc.on('data') -> chunks[]`, resolve on `end`).
- `embedSvg()` wraps `SVGtoPDF` with a try/catch that falls back to a
  "chart unavailable" placeholder rectangle so a single bad SVG can
  never corrupt the rest of the document.

### New API endpoints (`apps/api/src/routes/audits.ts`)

1. `GET /api/tenants/export/csv` — combined multi-tenant CSV. Resolves
   the caller's orgId, queries control-plane for active non-deleted
   tenants with a non-null databaseName, then opens each tenant DB in a
   try/finally, fetches the most-recent completed run + its findings,
   and calls `generateMultiTenantCsv`. Returns `text/csv` with a
   timestamped filename. Header-only CSV when the org has no audited
   tenants.
2. `GET /api/tenants/:tenantId/audits/history` — registered BEFORE
   `.../audits/:auditId` so the literal `history` segment matches ahead
   of the parameter capture. Fetches all completed runs, then makes
   **one** batched `inArray()` query for findings across all run ids
   and **one** for maturityScores — avoids N+1. Groups in memory,
   computes `overallScore = totalPass / (totalPass + totalFail) * 100`
   and per-framework scores from product/rating pairs. Response shape:
   `{ auditId, status, startedAt, completedAt, duration, totalChecks,
      passedChecks, failedChecks, overallScore, frameworkScores,
      maturityLevels }`.
3. `GET /api/tenants/:tenantId/audits/:auditId/report?type=executive|full`
   — validates `type` (400 on invalid), loads run + findings + maturity
   from the tenant DB, looks up tenant display name from control-plane
   (best-effort), computes framework/overall scores, calls the matching
   PDF generator, returns `application/pdf` with an
   `attachment; filename=compliance-report-{type}-{date}.pdf`
   Content-Disposition.
4. `GET /api/tenants/:tenantId/audits/:auditId/export/csv` — loads run
   + findings, looks up tenant display name, calls
   `generateFindingsCsv(findings, run, { id, displayName })`, returns
   `text/csv` with a timestamped filename.

## Test results

### New tests added

- `apps/api/src/__tests__/svg-charts.test.ts` — **20 tests** (escapeXml,
  radar, framework bar, trend line — structure, color palette, XML
  escaping, empty state)
- `apps/api/src/__tests__/csv-export.test.ts` — **15 tests** (CSV_COLUMNS
  shape, tenant column presence/absence, quoting, internal double
  quotes, commas in values, null fields, empty input, multi-tenant
  combining + sorting)
- `apps/api/src/__tests__/pdf-report.test.ts` — **8 tests** (both report
  types return valid `%PDF` Buffers; report endpoint returns
  `application/pdf`, 400 on invalid type, 404 on missing audit;
  single-tenant CSV endpoint returns `text/csv` with `"Tenant Name"`
  column and 404 on missing audit)
- `apps/api/src/__tests__/audit-history.test.ts` — **4 tests** (history
  returns computed overallScore and per-framework scores; empty audit
  list returns empty array; multi-tenant CSV endpoint returns `text/csv`
  combining findings across all active tenants; header-only CSV when
  org has no tenants with completed audits)

### Suite results

- `pnpm --filter @omzig/api test` — **191/191 passing** (19 files,
  +47 new tests, no regressions; previous baseline after Plan 06-01
  was 144 tests)

## Commits

| Hash      | Message                                           |
| --------- | ------------------------------------------------- |
| `35842a5` | feat(06-02): SVG chart and CSV export services    |
| `a8eea44` | feat(06-02): PDF reports, history API, CSV export endpoints |

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 3 – Blocking] Mock state bleed between tests**

- **Found during:** Task 2 (first `pnpm vitest` run of the new route
  tests)
- **Issue:** The Task 2 test files used `vi.clearAllMocks()` in
  `beforeEach`, which clears call history but **not** mock
  implementations. When a test set up `mockWhere.mockResolvedValueOnce`
  queues and the production handler's actual number of `.where()` calls
  didn't match exactly, the leftover once-queue bled into subsequent
  tests and caused cascading failures (5 test failures, all with mock
  chain mismatch errors).
- **Fix:** Switched the `beforeEach` hooks to explicit
  `mockReset()` calls on every mock function. This clears both call
  history AND implementations, isolating each test's mock setup
  completely. Also adjusted the history happy-path test to use
  `mockWhere.mockReturnValueOnce({ orderBy: mockOrderBy })` for the
  first call (the runs query that terminates at `.orderBy`), so the
  subsequent `mockResolvedValueOnce(findings)` and
  `mockResolvedValueOnce([])` cleanly fed the 2nd and 3rd `.where()`
  calls.
- **Files modified:** `apps/api/src/__tests__/pdf-report.test.ts`,
  `apps/api/src/__tests__/audit-history.test.ts`
- **Commit:** `a8eea44` (same commit as the handler that exposed the
  issue)

### No architectural changes

All other work followed the plan exactly. No Rule 4 escalations.

## Auth gates / human verification

None encountered. All work completed autonomously.

## Known stubs

None introduced by this plan.

Existing stubs carried over from Plan 06-01:

- `getSchedulerAccessToken()` still returns a placeholder token — tracked
  in `deferred-items.md`, will be resolved by a follow-up Key Vault plan.

## Deferred Issues

None introduced by this plan. The existing deferred items from Plan 06-01
remain open (see `.planning/phases/06-scheduling-reporting-and-trending/deferred-items.md`).

## Self-Check: PASSED

Verified files exist:

- FOUND: `apps/api/src/services/svg-charts.ts`
- FOUND: `apps/api/src/services/csv-export.ts`
- FOUND: `apps/api/src/services/pdf-report.ts`
- FOUND: `apps/api/src/__tests__/svg-charts.test.ts`
- FOUND: `apps/api/src/__tests__/csv-export.test.ts`
- FOUND: `apps/api/src/__tests__/pdf-report.test.ts`
- FOUND: `apps/api/src/__tests__/audit-history.test.ts`
- FOUND: `apps/api/src/routes/audits.ts` (modified)
- FOUND: `apps/api/package.json` (pdfkit + svg-to-pdfkit added)

Verified commits:

- FOUND: `35842a5` — feat(06-02): SVG chart and CSV export services
- FOUND: `a8eea44` — feat(06-02): PDF reports, history API, CSV export endpoints

Verified tests:

- 20/20 svg-charts.test.ts passing
- 15/15 csv-export.test.ts passing
- 8/8 pdf-report.test.ts passing
- 4/4 audit-history.test.ts passing
- 191/191 full @omzig/api suite passing (144 baseline + 47 new)
