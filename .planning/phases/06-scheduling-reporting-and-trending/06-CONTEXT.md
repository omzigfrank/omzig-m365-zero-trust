# Phase 6: Scheduling, Reporting and Trending - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Add automated scan scheduling (daily/weekly per tenant), PDF compliance reports (executive summary + full report), historical compliance trend charts, and enhanced CSV export. No remediation execution (Phase 7), no drift detection (Phase 8), no new evaluators or controls. Scheduling triggers the existing audit pipeline — no changes to the collect-evaluate-maturity flow.

</domain>

<decisions>
## Implementation Decisions

### Scheduled Scan Configuration (TENANT-05, TENANT-06)
- **UI location**: Tenant Settings tab on `/tenants/:id` page. Currently shows static tenant info (M365 Tenant ID, Connection Method, Created At) with a "coming in future phases" placeholder. Add a "Scan Schedule" section with a dropdown (Disabled/Daily/Weekly) and a save button.
- **Backend approach**: DB-driven polling from Hono API using `setInterval` (60-second check interval). On startup, the API process starts a scheduler loop that queries all tenants with active schedules, checks if any are due, and triggers `runAuditPipeline` for those that are. No external scheduler (no Azure Functions timer triggers, no cron jobs).
- **Concurrency control**: Maximum 3 concurrent audit scans running at any time. 5-minute stagger between scan starts to avoid Graph API throttling. If more tenants are due, they queue and execute as slots free up.
- **Frequency options**: Three states via dropdown — `disabled` (default for existing tenants), `daily` (runs once per 24 hours), `weekly` (runs once per 7 days). Next run time computed from `lastAuditAt` + interval.
- **Notifications**: Silent — no email, no toast, no push. Scheduled scan completion updates the tenant's `lastAuditAt` and `lastAuditScore` in the control-plane DB. Dashboard reflects new data on next page load. The action queue picks up any new critical findings automatically.
- **Schema additions**: Add `scheduleFrequency` (varchar, nullable, values: 'daily'/'weekly'/null) and `scheduleNextRunAt` (datetime2, nullable) columns to the `tenants` table in control-plane schema.

### PDF Report Design (DASH-03)
- **Report types**: Two types available via a dropdown on the export button area (replacing the current disabled PDF stub):
  1. **Executive Summary** (2-3 pages): Overall score, framework score cards, top 5 critical findings, ZTA maturity level. Designed for client executives — plain language, minimal technical detail.
  2. **Full Compliance Report** (8-10 pages): Everything in executive summary plus all findings grouped by framework, per-framework score breakdowns, ZTA maturity radar chart, remediation recommendations for failed controls.
- **Report type selection**: Dropdown menu on the PDF button in ExportButtons. User clicks PDF, sees "Executive Summary" and "Full Compliance Report" options, clicks one to generate and download.
- **Chart rendering in PDF**: Server-side SVG rendering. The API generates SVG strings for 3 chart types:
  1. ZTA radar chart (simplified SVG polygon — no Recharts dependency on server)
  2. Framework score bar chart (horizontal bars with percentage labels)
  3. Trend line chart (if enough audit history exists, minimum 3 data points)
  SVGs are embedded directly in the PDF document.
- **Branding**: Neutral — Omzig logo at top of each page, MSP organization name from control-plane `organizations.name`. No custom color themes, no MSP logo upload (deferred to v2 REPORT-01). Clean, professional styling with gray/blue color scheme matching the web dashboard.
- **PDF generation**: Server-side via API endpoint. Frontend requests PDF, API compiles data + renders SVG charts + generates PDF binary, returns as `Content-Type: application/pdf` with `Content-Disposition: attachment`. Library choice is Claude's discretion (pdfkit, @react-pdf/renderer, or jsPDF on server).
- **API endpoint**: `GET /api/tenants/:tenantId/audits/:auditId/report?type=executive|full` — requires authentication, returns PDF binary.

### Historical Trending Charts (DASH-08, DASH-09)
- **Chart type**: Recharts `LineChart` with 5 lines — Overall score + 4 per-framework scores (CISA SCuBA, NIST 800-207, NIST 800-53, CSF 2.0). Each line has a distinct color. Legend below chart allows toggling individual lines on/off. Data points shown as dots on each line.
- **Placement**: Audit History tab on tenant detail page (`/tenants/:id`). Replaces the current stub placeholder ("Audit history will show past audit runs..."). Chart at top, time range selector buttons below chart, audit run list table below that.
- **Time range selector**: Horizontal button group — 30d / 90d / 6m / 1y / All. Defaults to 90d. Filters the chart and the audit run list below it.
- **Minimum data threshold**: Require 3+ completed audit runs to show the trend chart. Below that, show a message: "Complete 3 or more audits to see compliance trends" with the audit run list table still visible. Chart appears automatically once threshold is met.
- **Data granularity**: One point per completed audit run. X-axis shows date+time of each audit. No daily aggregation — if 3 audits happen in one day, 3 points appear. This preserves full accuracy for MSPs tracking before/after remediation changes.
- **Data source**: New API endpoint `GET /api/tenants/:tenantId/audits/history` returns an array of `{ auditId, completedAt, overallScore, frameworkScores: { AAD, ZTA, '80053', CSF } }` computed from existing `auditRuns` + `auditFindings` tables. No new DB tables needed — scores are computed from persisted findings per audit run.
- **Audit run list**: Table below the chart showing all audit runs in the selected time range: Date, Status (badge), Duration, Checks (passed/total), Overall Score. Clicking a row navigates to the full audit detail (existing route).

### CSV Export Enhancement (DASH-04)
- **Column set**: Full finding record with ~20 columns: Audit ID, Audit Date, Tenant Name, Control ID, Product, Description, Requirement Level, Severity, Status (rating), Message, Action, Setting Name, Current Value, Expected Value, NIST 800-53, NIST CSF, ZTA Tenet, Required Permission. One row per finding.
- **Export locations**: Two locations:
  1. **Tenant detail** (existing ExportButtons): Exports findings for that tenant's current/selected audit.
  2. **Multi-tenant dashboard** (`/tenants` page): New export button that generates a combined CSV across all tenants. Adds Tenant Name and Tenant ID as the first two columns.
- **Filter behavior**: CSV always respects current active filters. If the user has filtered to "Critical severity, Fail status only", the CSV contains only those filtered results. To export everything, clear filters first.
- **File naming**: `findings-{ISO-timestamp}.csv` format (e.g., `findings-2026-03-12T15-30-00.csv`). Simple, no special characters from tenant names.

### Claude's Discretion
- PDF generation library choice (pdfkit, @react-pdf/renderer, jsPDF, or other)
- SVG chart rendering implementation details (manual SVG string building vs library)
- Scheduler loop implementation details (error handling, restart behavior, logging)
- Schedule settings UI component design (form layout, validation, save feedback)
- Trend chart colors for each framework line
- Audit history API response shape and caching strategy
- Whether to add a "last scheduled run" indicator to the tenant card on dashboard
- PDF page layout, margins, font sizes, spacing
- Multi-tenant CSV export button placement on dashboard page
- How the PDF dropdown attaches to the existing ExportButtons component

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- **ExportButtons** (`apps/web/src/components/audit/ExportButtons.tsx`): 66 lines. JSON + CSV export working, PDF button disabled with "Coming soon" title. CSV currently exports 5 columns (Status, Control, Product, Finding, Action). Enhance CSV to ~20 columns, enable PDF with dropdown.
- **Tenant Detail Page** (`apps/web/src/app/tenants/[id]/page.tsx`): 382 lines. 4 tabs (Overview, Findings, History, Settings). History tab has stub placeholder + single-row table from current audit. Settings tab has static info + "coming in future phases" placeholder. Both need enhancement.
- **Audit Routes** (`apps/api/src/routes/audits.ts`): 289 lines. POST trigger (202 fire-and-forget), GET list, GET detail with findings + maturity + frameworkScores. Extend with history endpoint and report endpoint.
- **Audit Runner** (`packages/audit/src/pipeline/audit-runner.ts`): 208 lines. Full pipeline: COLLECT → EVALUATE → MATURITY → UPDATE → CLEANUP. Scheduler calls this same function — no pipeline changes needed.
- **Tenant Schema** (`packages/db/src/control-plane/schema.ts`): `tenants` table has `lastAuditAt`, `lastAuditScore`, `criticalFindingsCount`. Add `scheduleFrequency` and `scheduleNextRunAt`.
- **Tenant DB Schema** (`packages/db/src/tenant/schema.ts`): `auditRuns` (id, tenantId, status, startedAt, completedAt, totalChecks, passedChecks, failedChecks, errorChecks), `auditFindings` (19 columns with all framework mappings), `maturityScores` (per-tenet scores). All historical data needed for trending is already persisted.
- **App.ts** (`apps/api/src/app.ts`): Route registration pattern — public routes before auth middleware, protected routes after. New schedule and report routes go in protected section.
- **ZtaMaturityRadar** (`apps/web/src/components/audit/ZtaMaturityRadar.tsx`): Recharts RadarChart. Confirms Recharts is available as dependency. Trend chart uses Recharts LineChart from same library.
- **Maturity Calculator** (`packages/audit/src/pipeline/maturity-calculator.ts`): Severity weights (Critical=4, High=3, Medium=2, Low=1). Reuse weight logic for framework score computation in trending API.
- **ScoreOverview** (`apps/web/src/components/audit/ScoreOverview.tsx`): 4 framework score cards. PDF executive summary mirrors this layout.
- **FrameworkBreakdown** (`apps/web/src/components/audit/FrameworkBreakdown.tsx`): Groups findings by family/function with progress bars. PDF full report includes similar breakdown.
- **useTenants hook** (`apps/web/src/hooks/useTenants.ts`): Fetches tenant list. Multi-tenant CSV export can use same data source.

### Established Patterns
- Hono API with separated route files registered in app.ts
- Drizzle ORM with mssqlTable for control-plane and tenant schemas
- Next.js pages with AuthGuard wrapper and useAuth hook
- Vitest + React Testing Library for frontend tests
- Client-side state management with React hooks (no Redux/Zustand)
- Fire-and-forget async pattern for audit pipeline (202 response + background work)
- Lucide icons for UI elements

### Integration Points
- Settings tab on tenant detail page: add schedule configuration UI
- History tab on tenant detail page: replace stub with trend chart + audit run list
- ExportButtons component: enhance CSV columns, add PDF dropdown
- Tenant detail page `/tenants/[id]`: add multi-tenant CSV export on dashboard page
- Control-plane schema: add `scheduleFrequency` and `scheduleNextRunAt` to tenants table
- API routes: add `GET /api/tenants/:tenantId/audits/history` for trend data
- API routes: add `GET /api/tenants/:tenantId/audits/:auditId/report` for PDF generation
- API routes: add `PATCH /api/tenants/:tenantId/schedule` for schedule configuration
- API startup: add scheduler loop (setInterval) that checks for due scans
- No new packages needed for frontend (Recharts already available)
- New server-side package needed for PDF generation (Claude's choice)

</code_context>

<specifics>
## Specific Ideas

- DB-driven scheduler inside the Hono process keeps the stack simple — no Azure Functions dependency, no external scheduler to configure. The 60-second poll interval is lightweight and the max-3-concurrent + 5-minute-stagger prevents Graph API throttling.
- Two PDF report types via dropdown gives MSPs exactly what they need: executive summary for client meetings, full report for internal compliance reviews. Server-side SVG avoids the headless browser complexity of rendering Recharts on the server.
- Trend chart in the Audit History tab fills a visible gap (the stub placeholder). With 5 color-coded lines and a time range selector, MSPs can see at a glance whether compliance is improving or degrading across frameworks.
- Enhanced CSV with ~20 columns + filter-aware export lets MSPs do pivot table analysis in Excel. Multi-tenant export from the dashboard is the cross-tenant analysis feature MSPs need for portfolio reviews.
- The minimum-3-audits threshold for trend charts prevents misleading single-point lines. The message encourages MSPs to run more audits, driving engagement.

</specifics>

<deferred>
## Deferred Ideas

- **Branded/white-label PDF reports** (v2 REPORT-01): MSP logo upload, custom color themes, white-label branding. Requires file upload infrastructure and per-org branding configuration.
- **Email delivery of reports**: Auto-email PDF reports on schedule. Requires email service integration (SendGrid, Azure Communication Services).
- **Scheduled scan notifications**: Email or webhook alerts when a scheduled scan completes or fails. May be added in Phase 8 alongside drift detection notifications.

</deferred>

---

*Phase: 06-scheduling-reporting-and-trending*
*Context gathered: 2026-03-12*
