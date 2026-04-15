---
phase: 06-scheduling-reporting-and-trending
plan: 03
subsystem: frontend-reporting
tags: [frontend, reports, export, pdf, csv, trending, recharts, history]
requires:
  - Plan 06-02 backend endpoints (/report, /export/csv, /audits/history)
  - @omzig/web Recharts 3.8 dependency (already installed)
  - useAuth + apiClient MSAL bearer token flow
provides:
  - PDF dropdown (executive / full) wired to backend report endpoint
  - 17-column CSV export with filter-awareness
  - multi-tenant CSV download button on /tenants dashboard
  - 5-line compliance trend chart (Overall + 4 frameworks)
  - time range selector (30d/90d/6m/1y/All) driving chart + history
  - full History tab overhaul replacing the stub placeholder
  - restored apps/web/src/app/tenants/page.tsx (previously deleted
    during the SWA static export work; now re-enabled now that
    backend endpoints are live)
affects:
  - apps/web/src/components/audit/ExportButtons.tsx
  - apps/web/src/app/tenants/[id]/TenantDetailClient.tsx
  - apps/web/src/app/tenants/page.tsx (restored)
tech-stack:
  added: []
  patterns:
    - "Click-outside dropdown via useRef + document mousedown listener"
    - "Intercept global Blob constructor in tests to inspect CSV payload
      (jsdom Blob has no .text() method)"
    - "Framework color palette constants shared between backend SVG
      renderer and frontend Recharts LineChart for visual consistency"
    - "Time-range cutoff helper returns null for 'all' so the same
      filter function handles the unbounded case"
key-files:
  created:
    - apps/web/src/components/audit/TrendChart.tsx
    - apps/web/src/components/audit/AuditHistoryList.tsx
    - apps/web/src/components/audit/TimeRangeSelector.tsx
    - apps/web/src/components/tenants/MultiTenantExport.tsx
    - apps/web/src/hooks/useAuditHistory.ts
    - apps/web/src/app/tenants/page.tsx
    - apps/web/src/__tests__/ExportButtons.test.tsx
    - apps/web/src/__tests__/MultiTenantExport.test.tsx
    - apps/web/src/__tests__/TrendChart.test.tsx
  modified:
    - apps/web/src/components/audit/ExportButtons.tsx
    - apps/web/src/app/tenants/[id]/TenantDetailClient.tsx
decisions:
  - "Make tenantId optional on ExportButtons so the existing tenant-less
    /audit page (client-side audit flow) still renders without PDF
    support. PDF button is disabled with a tooltip when tenantId is
    absent rather than hidden, to make the limitation visible."
  - "Restore apps/web/src/app/tenants/page.tsx inside this plan even
    though it is not listed in files_modified. The plan says to
    'modify' it and expects MultiTenantExport to be wired in; the file
    was deleted in commit 9113c59 during an earlier SWA static-export
    cleanup and Plan 06-01 only restored the [id]/page.tsx shell.
    Restoring it here also fixes the pre-existing TenantDashboard
    test (which was failing because the import target didn't exist)."
  - "Intercept the global Blob constructor in CSV tests rather than
    calling blob.text() — jsdom's Blob has no text() method. The
    override captures the parts array at construction time so tests
    can synchronously read the CSV payload."
  - "Share framework colors (Overall=#1e40af, AAD/SCuBA=#059669,
    ZTA/800-207=#d97706, 80053=#7c3aed, CSF=#dc2626) with the backend
    SVG trend renderer to keep the PDF and on-screen charts visually
    consistent."
  - "timeRangeCutoff() lives in TimeRangeSelector.tsx as a named
    export so callers filter history data with the same logic the
    button group represents. Returning null for 'all' lets the
    filter short-circuit without a special-case branch."
  - "AuditHistoryList row click navigates back to the tenant detail
    overview rather than deep-linking to a per-audit route — no such
    route exists yet and the overview tab already renders the latest
    audit result."
requirements:
  - DASH-04
  - DASH-08
  - DASH-09
metrics:
  duration: ~35 minutes
  completed: 2026-04-14
  tasks_completed: 2
  files_changed: 11
  tests_added: 20
  tests_passing: 119
---

# Phase 6 Plan 03: Frontend Reports, Trending, and Export Summary

Complete the user-facing reporting, export, and trending surfaces that
consume the backend services landed in Plan 06-02. Export buttons get a
PDF dropdown with executive/full reports and a ~17-column filter-aware
CSV, the multi-tenant dashboard gains a combined CSV download, and the
tenant detail History tab is overhauled with a compliance trend chart,
a time range selector, and an audit run history list.

## What was built

### Enhanced ExportButtons (`apps/web/src/components/audit/ExportButtons.tsx`)

Full rewrite of the previous 3-button component:

- **JSON button** — unchanged, preserves the existing download logic.
- **CSV button** — now emits 17 columns matching the backend
  `csv-export.ts` schema: Audit ID, Audit Date, Control ID, Product,
  Description, Requirement Level, Severity, Status, Message, Action,
  Setting Name, Current Value, Expected Value, NIST 800-53, NIST CSF,
  ZTA Tenet, Required Permission. Every field is wrapped in double
  quotes and internal quotes doubled (RFC 4180). Respects the optional
  `activeFilters` prop so exported rows always match what the user
  sees. Filename pattern `findings-{iso-timestamp}.csv`.
- **PDF button** — now a dropdown trigger showing **Executive Summary**
  and **Full Compliance Report** choices. Each option fetches
  `/api/tenants/:tenantId/audits/:auditId/report?type=executive|full`
  with a Bearer token from `useAuth()`, converts the response body to
  a `Blob`, and triggers a download via an anchor element. Shows
  per-option "Generating..." loading state and a click-outside handler
  that closes the dropdown. When `tenantId` is absent (e.g. the
  tenant-less `/audit` page), the button is disabled with a tooltip.

### MultiTenantExport (`apps/web/src/components/tenants/MultiTenantExport.tsx`)

Standalone button placed in the /tenants dashboard header that
fetches `GET /api/tenants/export/csv` with a Bearer token and streams
the response into an `all-tenants-findings-{iso-timestamp}.csv`
download. Exposes inline loading and error states (auto-clears after
5 seconds) so the dashboard header stays clean.

### Tenants dashboard (`apps/web/src/app/tenants/page.tsx`) — restored

The tenant listing page had been deleted in commit `9113c59` during
the SWA static-export work. Plan 06-01 only restored the tenant
*detail* page (`[id]/page.tsx`). This plan restores the listing page
and wires the new `MultiTenantExport` button into the header row
alongside the existing grid/table view toggle. The restore also
fixes the pre-existing `TenantDashboard.test.tsx` regression.

### useAuditHistory hook (`apps/web/src/hooks/useAuditHistory.ts`)

Thin wrapper around `GET /api/tenants/:tenantId/audits/history` that
returns `{ data, loading, error, refetch }`. Normalizes the API's
`{ data: [...] }` envelope to a plain array. Re-fetches when
`tenantId` changes.

### TrendChart (`apps/web/src/components/audit/TrendChart.tsx`)

Recharts `LineChart` with 5 `Line` series inside a `ResponsiveContainer`
(350px tall). Data points are sorted chronologically before transform,
so the chart always reads left-to-right forward in time. Renders a
"Complete 3 or more audits to see compliance trends over time"
placeholder inside a dashed box when fewer than 3 points are present,
including a `(N of 3 completed audits)` counter. Framework colors
match the backend SVG renderer palette:

- Overall `#1e40af` (extra weight, 2.5px stroke)
- CISA SCuBA `#059669`
- NIST 800-207 `#d97706`
- NIST 800-53 `#7c3aed`
- NIST CSF 2.0 `#dc2626`

### AuditHistoryList (`apps/web/src/components/audit/AuditHistoryList.tsx`)

Table with Date, Status, Duration, Checks, Score columns:

- Date: localized date + time string.
- Status: colored badge (completed=green, failed=red, running=yellow).
- Duration: formatted as `Xm Ys` or `--` when null.
- Checks: `X/Y passed` form.
- Score: percentage colored green (≥70), yellow (40–69), red (<40).

Rows are sorted most-recent-first. Clicking a row navigates to the
tenant detail overview (no per-audit route exists yet). Empty state
shows "No audit runs in this time range." inside a dashed box.

### TimeRangeSelector (`apps/web/src/components/audit/TimeRangeSelector.tsx`)

5-button group (`30d`, `90d`, `6m`, `1y`, `All`) with a `timeRangeCutoff`
helper that converts a range code into a cutoff `Date` (or `null` for
`all`). Active button has a blue background; others are transparent
with a hover state. `aria-pressed` and `role="group"` attributes for
screen reader support. 90d is the default in the tenant detail page.

### History tab overhaul (`apps/web/src/app/tenants/[id]/TenantDetailClient.tsx`)

Replaces the single-row stub table with:

1. Header row containing a title + `TimeRangeSelector`.
2. Loading skeleton while `useAuditHistory` is in flight.
3. Error banner with retry button on failure.
4. `TrendChart` filtered by time range.
5. `AuditHistoryList` filtered by time range.

The filtered history is computed once via `timeRangeCutoff(timeRange)`
and reused for both components so the chart and the list always stay
in sync.

## Deviations from Plan

### [Rule 3 - Blocking] Restored apps/web/src/app/tenants/page.tsx

**Found during:** Task 1 (MultiTenantExport integration)

**Issue:** The plan's Task 1 action step 3 says to *modify*
`apps/web/src/app/tenants/page.tsx` and the `files_modified`
frontmatter lists it, but the file does not exist on disk. It was
deleted in commit `9113c59` ("Fix audit: run evaluators client-side
instead of calling backend API") and Plan 06-01 restored only the
`[id]/page.tsx` shell, not the listing page. `TenantDashboard.test.tsx`
imports `@/app/tenants/page`, so the absent file was producing a
pre-existing test-suite regression.

**Fix:** Restored the listing page from git history (commit `9113c59~1`)
and added the `MultiTenantExport` component in the header row between
the tenant count badge and the view toggle, guarded by the same
`!loading && !error && tenants.length > 0` condition used for the
`ActionQueue`. The restoration also returns `TenantDashboard.test.tsx`
to green (baseline improvement, not a regression).

**Files modified:** `apps/web/src/app/tenants/page.tsx`

**Commit:** `502c745`

---

Everything else was built as written in the plan. Time range selector
defaults to `90d` as the plan specifies; framework colors match the
specified hex codes exactly; trend threshold is 3 points; CSV field
quoting is RFC 4180 compliant; PDF dropdown opens/closes via the
click-outside pattern used elsewhere in the codebase.

## Tests

### New test files (20 tests added, all passing)

- `apps/web/src/__tests__/ExportButtons.test.tsx` — 8 tests:
  render all three buttons, PDF dropdown open/close flow, fetch URL
  shape for executive and full reports, click-outside close, CSV
  column count (≥15), activeFilters reducing the row count, filename
  pattern.
- `apps/web/src/__tests__/MultiTenantExport.test.tsx` — 5 tests:
  renders the export button, fetches `/api/tenants/export/csv` with
  Bearer auth, anchor download filename pattern, loading state during
  fetch, error state on non-OK response.
- `apps/web/src/__tests__/TrendChart.test.tsx` — 7 tests: threshold
  message for 0/1/2 points, LineChart rendering at 3 points, 5 Line
  components, exact color palette (`#1e40af` / `#059669` / `#d97706`
  / `#7c3aed` / `#dc2626`), chronological data sort.

### Full web suite delta

Baseline (before Plan 06-03):
```
Test Files  2 failed | 8 passed (10)
     Tests  2 failed | 75 passed (77)
```

After Plan 06-03:
```
Test Files  1 failed | 12 passed (13)
     Tests  2 failed | 119 passed (121)
```

- **+3 test files** (ExportButtons, MultiTenantExport, TrendChart).
- **+44 passing tests** (75 → 119).
- **One pre-existing failing file removed** from the failures list:
  `TenantDashboard.test.tsx` returned to green because the restored
  `apps/web/src/app/tenants/page.tsx` satisfies its import.
- **Remaining 2 failures** are both in `FindingDetail.test.tsx`
  (pre-existing Phase 5 assertion drift on registry remediation
  steps and admin portal URL) — untouched by this plan as explicitly
  directed.

### TypeScript compile

`pnpm tsc --noEmit` reports only the pre-existing
`src/__tests__/TenantDetail.test.tsx(73,64): error TS2556` originating
from Phase 4 plan 04-03 (commit `6b1f5f5`). All files created/modified
in this plan compile cleanly.

## Commits

- `502c745` — feat(06-03): enhance export buttons with PDF dropdown
  and multi-tenant CSV (5 files, 868 insertions, 40 deletions)
- `b50163f` — feat(06-03): add trend chart, audit history list, and
  History tab overhaul (6 files, 767 insertions, 48 deletions)

## Self-Check: PASSED

- [x] `apps/web/src/components/audit/ExportButtons.tsx` — FOUND
- [x] `apps/web/src/components/audit/TrendChart.tsx` — FOUND
- [x] `apps/web/src/components/audit/AuditHistoryList.tsx` — FOUND
- [x] `apps/web/src/components/audit/TimeRangeSelector.tsx` — FOUND
- [x] `apps/web/src/components/tenants/MultiTenantExport.tsx` — FOUND
- [x] `apps/web/src/hooks/useAuditHistory.ts` — FOUND
- [x] `apps/web/src/app/tenants/page.tsx` — FOUND (restored)
- [x] `apps/web/src/app/tenants/[id]/TenantDetailClient.tsx` — FOUND (modified)
- [x] `apps/web/src/__tests__/ExportButtons.test.tsx` — FOUND
- [x] `apps/web/src/__tests__/MultiTenantExport.test.tsx` — FOUND
- [x] `apps/web/src/__tests__/TrendChart.test.tsx` — FOUND
- [x] Commit `502c745` — FOUND
- [x] Commit `b50163f` — FOUND
