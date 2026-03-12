# Phase 6: Scheduling, Reporting and Trending - Research

**Researched:** 2026-03-12
**Domain:** In-process job scheduling, server-side PDF generation, chart rendering, historical data aggregation
**Confidence:** HIGH

## Summary

Phase 6 adds four capabilities to the existing audit platform: (1) DB-driven scan scheduling with concurrency control, (2) server-side PDF compliance report generation with embedded SVG charts, (3) historical compliance trend charts using Recharts LineChart, and (4) enhanced CSV export with filter-aware column expansion and multi-tenant aggregation.

The existing codebase provides strong foundations: Recharts 3.8.0 is already installed and used for the ZTA radar chart, the audit pipeline (`runAuditPipeline`) is a clean async function callable from any context, the `auditRuns` and `auditFindings` tables already persist all historical data needed for trending, and the control-plane `tenants` table already has `lastAuditAt`/`lastAuditScore` fields. The primary new dependency is PDFKit for server-side PDF generation in the API package. The scheduler is implemented as a simple `setInterval` loop inside the Hono process -- no external dependencies needed.

**Primary recommendation:** Use PDFKit (0.17.x) with svg-to-pdfkit for server-side PDF generation. Build the scheduler as a standalone module started from index.ts alongside the Hono server. Use Recharts LineChart for trend visualization. Generate SVG chart strings server-side using manual SVG string building (no DOM dependency).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Scheduler approach**: DB-driven polling from Hono API using `setInterval` (60-second check interval). No external scheduler (no Azure Functions timer triggers, no cron jobs).
- **Concurrency control**: Maximum 3 concurrent audit scans running at any time. 5-minute stagger between scan starts.
- **Frequency options**: Three states via dropdown -- `disabled` (default), `daily`, `weekly`. Next run time computed from `lastAuditAt` + interval.
- **Notifications**: Silent -- no email, no toast, no push. Scheduled scan completion updates `lastAuditAt` and `lastAuditScore`.
- **Schema additions**: Add `scheduleFrequency` (varchar, nullable) and `scheduleNextRunAt` (datetime2, nullable) to `tenants` table.
- **PDF report types**: Two types -- Executive Summary (2-3 pages) and Full Compliance Report (8-10 pages).
- **PDF dropdown**: Dropdown menu on the PDF button in ExportButtons. User clicks PDF, sees two options.
- **Chart rendering in PDF**: Server-side SVG rendering. API generates SVG strings for 3 chart types (ZTA radar, framework bar chart, trend line chart). SVGs embedded directly in PDF.
- **Branding**: Neutral -- Omzig logo, MSP org name. No custom themes or logo upload.
- **PDF generation**: Server-side via API endpoint `GET /api/tenants/:tenantId/audits/:auditId/report?type=executive|full`.
- **Trend chart**: Recharts `LineChart` with 5 lines (Overall + 4 frameworks). Audit History tab on tenant detail page.
- **Time range selector**: 30d / 90d / 6m / 1y / All. Defaults to 90d.
- **Minimum data threshold**: 3+ completed audits to show trend chart.
- **Data granularity**: One point per completed audit run. No aggregation.
- **Data source**: New API endpoint `GET /api/tenants/:tenantId/audits/history`.
- **CSV enhancement**: ~20 columns per finding. Two export locations (tenant detail + multi-tenant dashboard). Filter-aware export.
- **File naming**: `findings-{ISO-timestamp}.csv` format.
- **Schedule API**: `PATCH /api/tenants/:tenantId/schedule` for schedule configuration.

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

### Deferred Ideas (OUT OF SCOPE)
- Branded/white-label PDF reports (v2 REPORT-01): MSP logo upload, custom color themes
- Email delivery of reports: auto-email PDF reports on schedule
- Scheduled scan notifications: email or webhook alerts on scan completion/failure
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TENANT-05 | MSP can configure scheduled audit scans per tenant (daily/weekly frequency) | Scheduler module with DB-driven polling, PATCH endpoint for schedule config, Settings tab UI with dropdown |
| TENANT-06 | Scheduled scans run automatically via stagger logic to avoid throttling | setInterval loop with max-3-concurrent slots, 5-minute stagger, queue overflow handling |
| DASH-03 | User can export compliance report as PDF for client-facing documentation | PDFKit server-side generation, SVG chart embedding, two report types via dropdown |
| DASH-04 | User can export detailed findings as CSV for data analysis | Enhanced ~20-column CSV, filter-aware export, multi-tenant CSV from dashboard |
| DASH-08 | Dashboard shows historical compliance score trends over time per tenant | History API endpoint computing scores from existing auditRuns + auditFindings tables |
| DASH-09 | Score trending chart shows compliance improvement/regression across scan history | Recharts LineChart with 5 lines, time range selector, 3-audit minimum threshold |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pdfkit | 0.17.x | Server-side PDF generation | Node.js-native, streaming, no DOM dependency, mature (10+ years) |
| @types/pdfkit | 0.17.x | TypeScript definitions for PDFKit | DefinitelyTyped maintained |
| svg-to-pdfkit | 0.1.8 | Embed SVG strings into PDFKit documents | Only library for SVG-in-PDFKit, 100+ npm dependents |
| recharts | 3.8.0 | Trend line chart (already installed) | Already in project, used for ZTA radar chart |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | 3.23.x | Validate schedule PATCH body, report query params | Already in API package, established validation pattern |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| PDFKit | jsPDF (server-side) | jsPDF is browser-first, lacks Node.js streaming, no native SVG support. Already in web package but not designed for server use. |
| PDFKit | @react-pdf/renderer | Requires React rendering on server, heavier dependency, server-side React SSR complexity |
| svg-to-pdfkit | Manual PDFKit drawing | More code, error-prone for charts, no SVG path parsing |
| Manual SVG strings | d3-node | Adds D3 as server dependency, overkill for 3 simple chart types |

**Installation:**
```bash
cd apps/api && pnpm add pdfkit svg-to-pdfkit && pnpm add -D @types/pdfkit
```

Note: `recharts` is already installed in `@omzig/web`. No new frontend dependencies needed.

## Architecture Patterns

### Recommended Project Structure
```
apps/api/src/
  routes/
    audits.ts                   # Extend with history + report endpoints
    schedule.ts                 # NEW: PATCH schedule config
  services/
    scheduler.ts                # NEW: setInterval loop, concurrency control
    pdf-report.ts               # NEW: PDF generation (executive + full)
    svg-charts.ts               # NEW: Server-side SVG string builders
  __tests__/
    scheduler.test.ts           # NEW
    pdf-report.test.ts          # NEW
    svg-charts.test.ts          # NEW
    audit-history.test.ts       # NEW

apps/web/src/
  components/
    audit/
      ExportButtons.tsx         # MODIFY: add PDF dropdown, enhance CSV
      TrendChart.tsx            # NEW: Recharts LineChart for trends
      AuditHistoryList.tsx      # NEW: table of audit runs
      TimeRangeSelector.tsx     # NEW: 30d/90d/6m/1y/All buttons
    tenants/
      ScheduleSettings.tsx      # NEW: schedule config form
      MultiTenantExport.tsx     # NEW: CSV export button on dashboard
  hooks/
    useAuditHistory.ts          # NEW: fetch /audits/history
  app/tenants/[id]/page.tsx     # MODIFY: History tab + Settings tab

packages/db/src/
  control-plane/
    schema.ts                   # MODIFY: add scheduleFrequency, scheduleNextRunAt to tenants
    migrations/
      0006_add_schedule_columns.sql  # NEW: ALTER TABLE migration
```

### Pattern 1: DB-Driven Scheduler Loop
**What:** A standalone module that runs a `setInterval` timer on API startup. Every 60 seconds, it queries the control-plane DB for tenants where `scheduleNextRunAt <= NOW()` and `scheduleFrequency IS NOT NULL`. It maintains an in-memory concurrency counter (max 3), and staggers scan starts by 5 minutes.
**When to use:** For in-process scheduling without external dependencies.
**Example:**
```typescript
// apps/api/src/services/scheduler.ts

interface SchedulerState {
  running: number;
  queue: Array<{ tenantId: string; databaseName: string; tokenSecretName: string }>;
  timer: ReturnType<typeof setInterval> | null;
}

const state: SchedulerState = { running: 0, queue: [], timer: null };
const MAX_CONCURRENT = 3;
const STAGGER_MS = 5 * 60 * 1000; // 5 minutes
const POLL_INTERVAL_MS = 60 * 1000; // 60 seconds

export function startScheduler(): void {
  state.timer = setInterval(pollForDueScans, POLL_INTERVAL_MS);
  console.log('[scheduler] Started with 60s poll interval, max 3 concurrent');
}

export function stopScheduler(): void {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
}

async function pollForDueScans(): Promise<void> {
  try {
    const db = await getControlPlaneDb();
    const now = new Date();
    const dueTenants = await db.select().from(tenants)
      .where(and(
        isNotNull(tenants.scheduleFrequency),
        lte(tenants.scheduleNextRunAt, now),
        eq(tenants.isDeleted, false),
        eq(tenants.status, 'active'),
      ));

    for (const tenant of dueTenants) {
      if (state.running < MAX_CONCURRENT) {
        executeScan(tenant);
      } else {
        state.queue.push(tenant);
      }
    }
  } catch (err) {
    console.error('[scheduler] Poll error:', err);
    // Swallow -- next poll will retry
  }
}

async function executeScan(tenant: TenantRow): Promise<void> {
  state.running++;
  try {
    // Compute next run time BEFORE executing (prevents re-pickup on next poll)
    const nextRun = computeNextRun(tenant.scheduleFrequency, new Date());
    await db.update(tenants).set({ scheduleNextRunAt: nextRun }).where(eq(tenants.id, tenant.id));

    await runAuditPipeline({ ... });
  } finally {
    state.running--;
    // Drain queue with stagger
    if (state.queue.length > 0) {
      setTimeout(() => {
        const next = state.queue.shift();
        if (next) executeScan(next);
      }, STAGGER_MS);
    }
  }
}
```

### Pattern 2: Server-Side SVG Chart Generation
**What:** Pure functions that return SVG strings for embedding in PDFs. No DOM, no Recharts on server. Simple geometric calculations for radar polygons, horizontal bars, and line charts.
**When to use:** For embedding visual charts in PDFKit-generated PDFs.
**Example:**
```typescript
// apps/api/src/services/svg-charts.ts

export function renderRadarSvg(
  tenets: Array<{ tenet: string; weightedPassRate: number }>,
  width: number,
  height: number
): string {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(cx, cy) - 20;
  const n = tenets.length;

  // Generate polygon points
  const points = tenets.map((t, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const r = (t.weightedPassRate / 100) * radius;
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  }).join(' ');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <!-- Grid circles -->
    ${[25, 50, 75, 100].map(pct => {
      const r = (pct / 100) * radius;
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="1"/>`;
    }).join('\n')}
    <!-- Data polygon -->
    <polygon points="${points}" fill="#3b82f6" fill-opacity="0.3" stroke="#3b82f6" stroke-width="2"/>
    <!-- Labels -->
    ${tenets.map((t, i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      const lx = cx + (radius + 15) * Math.cos(angle);
      const ly = cy + (radius + 15) * Math.sin(angle);
      return `<text x="${lx}" y="${ly}" text-anchor="middle" font-size="10">${t.tenet}</text>`;
    }).join('\n')}
  </svg>`;
}
```

### Pattern 3: PDF Report Generation with PDFKit
**What:** A service that constructs multi-page PDF documents with text, tables, and embedded SVG charts using PDFKit's streaming API.
**When to use:** For the `GET /report?type=executive|full` endpoint.
**Example:**
```typescript
// apps/api/src/services/pdf-report.ts
import PDFDocument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';

export function generateExecutiveReport(data: ReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(20).text('Compliance Assessment Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).fillColor('#666').text(`Generated: ${new Date().toLocaleDateString()}`);
    doc.text(`Tenant: ${data.tenantName}`);
    doc.text(`Organization: ${data.orgName}`);

    // Overall score
    doc.moveDown(2);
    doc.fontSize(14).fillColor('#000').text('Overall Compliance Score');
    doc.fontSize(36).text(`${data.overallScore}%`, { align: 'center' });

    // Framework scores -- embed SVG bar chart
    const barSvg = renderFrameworkBarSvg(data.frameworkScores, 500, 200);
    SVGtoPDF(doc, barSvg, 50, doc.y, { width: 500 });

    doc.end();
  });
}
```

### Pattern 4: Trend Data API with Score Computation
**What:** An API endpoint that queries all completed audit runs for a tenant, computes per-framework scores from findings, and returns a time-series array.
**When to use:** For the audit history endpoint consumed by the trend chart.
**Example:**
```typescript
// In audit routes
auditRoutes.get('/tenants/:tenantId/audits/history', async (c) => {
  const tenantDb = c.get('tenantDb');

  const runs = await tenantDb.select().from(auditRuns)
    .where(eq(auditRuns.status, 'completed'))
    .orderBy(desc(auditRuns.completedAt));

  // For each run, compute framework scores from findings
  const history = await Promise.all(runs.map(async (run) => {
    const findings = await tenantDb.select({
      product: auditFindings.product,
      rating: auditFindings.rating,
    }).from(auditFindings).where(eq(auditFindings.auditRunId, run.id));

    const scores = computeFrameworkScores(findings);
    const overallApplicable = Object.values(scores).reduce((s, f) => s + f.pass + f.fail, 0);
    const overallPass = Object.values(scores).reduce((s, f) => s + f.pass, 0);
    const overallScore = overallApplicable > 0 ? Math.round((overallPass / overallApplicable) * 100) : 0;

    return {
      auditId: run.id,
      completedAt: run.completedAt,
      startedAt: run.startedAt,
      status: run.status,
      duration: run.completedAt && run.startedAt
        ? new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()
        : null,
      totalChecks: run.totalChecks,
      passedChecks: run.passedChecks,
      failedChecks: run.failedChecks,
      overallScore,
      frameworkScores: {
        AAD: scores['AAD']?.score ?? 0,
        ZTA: scores['ZTA']?.score ?? 0,
        '80053': scores['80053']?.score ?? 0,
        CSF: scores['CSF']?.score ?? 0,
      },
    };
  }));

  return c.json({ data: history, meta: { ... } }, 200);
});
```

### Anti-Patterns to Avoid
- **Rendering Recharts on the server:** Recharts requires a DOM and React rendering environment. Server-side chart rendering must use pure SVG string generation, not Recharts components.
- **Opening a tenant DB per audit run in the scheduler:** The scheduler handles multiple tenants. Each `runAuditPipeline` call opens its own DB connection per PITFALL 4. The scheduler must NOT pre-open connections.
- **Polling without next-run update before execution:** If `scheduleNextRunAt` is not updated before the scan starts, the next 60-second poll will re-pick the same tenant. Always update `scheduleNextRunAt` BEFORE launching the pipeline.
- **Loading all findings for all audit runs at once:** The history endpoint should use efficient per-run queries or a single JOIN query, not N+1 fetches in a loop. Consider a SQL VIEW or aggregation query for performance.
- **Blocking the event loop with PDF generation:** PDFKit is streaming and non-blocking, but SVG parsing in svg-to-pdfkit can be CPU-intensive for complex charts. Keep SVGs simple (polygons, rects, lines, text).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF document creation | Custom PDF binary writer | PDFKit | PDF spec is 750+ pages. PDFKit handles fonts, images, pages, streaming. |
| SVG-to-PDF conversion | Manual path-to-PDFKit translation | svg-to-pdfkit | SVG path commands (M, L, C, Q, A, Z) are complex. Library handles coordinate transforms, clipping, gradients. |
| CSV escaping | Regex-based quoting | Proper CSV with field quoting | CSV has edge cases: commas in fields, quotes in fields, newlines in fields. Use a consistent quote-everything approach. |
| Cron expression parsing | Custom date math | `computeNextRun()` helper (simple daily/weekly only) | With only 2 frequencies (daily/weekly), a simple helper function is appropriate. No cron library needed. |

**Key insight:** The scheduler is simple enough to hand-roll (only 2 frequencies, in-process, no persistence beyond DB columns). The PDF generation is NOT -- use PDFKit. The SVG charts are simple enough to hand-build as strings (3 chart types with basic geometry), avoiding a server-side charting library dependency.

## Common Pitfalls

### Pitfall 1: Scheduler Re-Picks Tenants on Every Poll
**What goes wrong:** If `scheduleNextRunAt` is not updated before the scan starts, the 60-second poll picks up the same tenant again, launching duplicate scans.
**Why it happens:** The scan may take 30+ seconds. The next poll fires before it completes.
**How to avoid:** Update `scheduleNextRunAt` to the NEXT scheduled time BEFORE launching `runAuditPipeline`. Use an optimistic update pattern.
**Warning signs:** Duplicate audit runs for the same tenant within minutes of each other.

### Pitfall 2: Scheduler Silently Dies After Unhandled Rejection
**What goes wrong:** An unhandled promise rejection in `pollForDueScans` kills the setInterval callback, and the scheduler stops polling.
**Why it happens:** Node.js setInterval doesn't catch async errors. If the callback throws, the interval keeps firing but the async operation is dead.
**How to avoid:** Wrap the entire poll function in try/catch. Never let an error propagate out of the interval callback. Log errors and continue.
**Warning signs:** Scheduled scans stop running but no error is visible. Add a heartbeat log every N polls.

### Pitfall 3: Stale Token in Scheduled Scans
**What goes wrong:** The scheduler uses the tenant's stored access token, which may have expired since the tenant was onboarded.
**Why it happens:** OAuth tokens expire (typically 1 hour). The scheduler runs hours/days later.
**How to avoid:** The scheduler must refresh the token using the stored refresh token or client credentials before launching the pipeline. The existing `TokenManager` in the audit pipeline handles token refresh -- ensure it has a valid refresh mechanism for scheduled runs.
**Warning signs:** All scheduled scans fail with 401 errors.

### Pitfall 4: N+1 Query in History Endpoint
**What goes wrong:** Fetching framework scores for each audit run issues a separate `SELECT * FROM auditFindings WHERE auditRunId = ?` per run. With 50 audit runs, that's 50 queries.
**Why it happens:** The naive implementation loops over runs and queries findings per run.
**How to avoid:** Option A: Fetch all findings for all runs in one query using `WHERE auditRunId IN (...)`, then group in-memory. Option B: Pre-compute and cache framework scores in the `auditRuns` row at completion time (requires schema addition). Option C: Use SQL GROUP BY to aggregate at the database level.
**Warning signs:** History endpoint takes 5+ seconds for tenants with many audit runs.

### Pitfall 5: PDFKit Buffer Accumulation
**What goes wrong:** Large PDFs (full report with many findings) accumulate in memory as Buffer chunks before sending the response.
**Why it happens:** The pattern of collecting chunks in an array and concatenating requires the full PDF to be in memory.
**How to avoid:** For the full report (8-10 pages), the buffer size is manageable (~500KB-2MB). If it grows beyond that, pipe the PDFKit stream directly to the response. Hono supports streaming responses.
**Warning signs:** Memory spikes when multiple users request full reports simultaneously.

### Pitfall 6: SVG String Injection in PDF
**What goes wrong:** If tenant names or finding text is injected into SVG strings without escaping, it can break SVG parsing in svg-to-pdfkit.
**Why it happens:** Tenant names may contain `<`, `>`, `&`, or `"` characters.
**How to avoid:** Always XML-escape text content before embedding in SVG strings. Use a simple escape helper: `& -> &amp;`, `< -> &lt;`, `> -> &gt;`, `" -> &quot;`.
**Warning signs:** PDF generation fails with "Invalid SVG" errors for certain tenants.

### Pitfall 7: CSV Column Order Inconsistency
**What goes wrong:** The ~20 column CSV has headers in one order and data values in a different order, producing misaligned data.
**Why it happens:** Using object keys which may not preserve insertion order, or separate header/data arrays that get out of sync.
**How to avoid:** Define a single array of column definitions `{ header: string, accessor: (f: Finding) => string }` and use it for both header row and data rows.
**Warning signs:** Column data appears under wrong headers in Excel.

## Code Examples

### Database Migration for Schedule Columns
```sql
-- Migration 0006: Add schedule columns to tenants table
-- Phase 6: Scheduling, Reporting and Trending

ALTER TABLE [tenants] ADD [schedule_frequency] VARCHAR(10) NULL;
ALTER TABLE [tenants] ADD [schedule_next_run_at] DATETIME2 NULL;
```

### Drizzle Schema Addition
```typescript
// In packages/db/src/control-plane/schema.ts, add to tenants table:
scheduleFrequency: varchar('schedule_frequency', { length: 10 }),
scheduleNextRunAt: datetime2('schedule_next_run_at'),
```

### Next Run Time Computation
```typescript
export function computeNextRun(
  frequency: 'daily' | 'weekly',
  fromDate: Date,
): Date {
  const next = new Date(fromDate);
  if (frequency === 'daily') {
    next.setDate(next.getDate() + 1);
  } else {
    next.setDate(next.getDate() + 7);
  }
  return next;
}
```

### Enhanced CSV Column Definitions
```typescript
const CSV_COLUMNS = [
  { header: 'Audit ID', accessor: (f: any, run: any) => run.id },
  { header: 'Audit Date', accessor: (f: any, run: any) => run.completedAt },
  { header: 'Tenant Name', accessor: (f: any, run: any, t: any) => t?.displayName ?? '' },
  { header: 'Control ID', accessor: (f: any) => f.controlId },
  { header: 'Product', accessor: (f: any) => f.product },
  { header: 'Description', accessor: (f: any) => f.description },
  { header: 'Requirement Level', accessor: (f: any) => f.requirementLevel },
  { header: 'Severity', accessor: (f: any) => f.severity },
  { header: 'Status', accessor: (f: any) => f.rating },
  { header: 'Message', accessor: (f: any) => f.message },
  { header: 'Action', accessor: (f: any) => f.action ?? '' },
  { header: 'Setting Name', accessor: (f: any) => f.settingName ?? '' },
  { header: 'Current Value', accessor: (f: any) => f.currentValue ?? '' },
  { header: 'Expected Value', accessor: (f: any) => f.expectedValue ?? '' },
  { header: 'NIST 800-53', accessor: (f: any) => f.nist80053 ?? '' },
  { header: 'NIST CSF', accessor: (f: any) => f.nistCsf ?? '' },
  { header: 'ZTA Tenet', accessor: (f: any) => f.nist800207Tenet ?? '' },
  { header: 'Required Permission', accessor: (f: any) => f.requiredPermission ?? '' },
];
```

### Trend Chart Line Colors
```typescript
// Recommended color palette for 5 trend lines (distinct, colorblind-friendly)
const TREND_COLORS = {
  Overall: '#1e40af',    // Blue-800 (bold, primary)
  AAD: '#059669',        // Emerald-600
  ZTA: '#d97706',        // Amber-600
  '80053': '#7c3aed',   // Violet-600
  CSF: '#dc2626',        // Red-600
};
```

### Recharts LineChart for Trends
```tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface TrendPoint {
  completedAt: string;
  overallScore: number;
  frameworkScores: Record<string, number>;
}

export function TrendChart({ data }: { data: TrendPoint[] }) {
  const chartData = data.map(d => ({
    date: new Date(d.completedAt).toLocaleDateString(),
    Overall: d.overallScore,
    'CISA SCuBA': d.frameworkScores.AAD ?? 0,
    'NIST 800-207': d.frameworkScores.ZTA ?? 0,
    'NIST 800-53': d.frameworkScores['80053'] ?? 0,
    'NIST CSF 2.0': d.frameworkScores.CSF ?? 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={350}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="Overall" stroke="#1e40af" strokeWidth={2} dot />
        <Line type="monotone" dataKey="CISA SCuBA" stroke="#059669" dot />
        <Line type="monotone" dataKey="NIST 800-207" stroke="#d97706" dot />
        <Line type="monotone" dataKey="NIST 800-53" stroke="#7c3aed" dot />
        <Line type="monotone" dataKey="NIST CSF 2.0" stroke="#dc2626" dot />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

### PDF Dropdown on ExportButtons
```tsx
// Pattern for dropdown attached to PDF button
import { useState, useRef, useEffect } from 'react';
import { FileText, ChevronDown } from 'lucide-react';

function PdfDropdown({ onSelect }: { onSelect: (type: 'executive' | 'full') => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Click-outside to close (matches project pattern from MultiSelectDropdown)
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-1.5 ...">
        <FileText className="h-4 w-4" />
        PDF
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 rounded-lg border bg-white shadow-lg z-10">
          <button onClick={() => { onSelect('executive'); setOpen(false); }} className="...">
            Executive Summary
          </button>
          <button onClick={() => { onSelect('full'); setOpen(false); }} className="...">
            Full Compliance Report
          </button>
        </div>
      )}
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Puppeteer/headless Chrome for PDF | PDFKit / native PDF libraries | 2023+ | No browser dependency, lighter memory footprint, faster generation |
| D3 on server for charts | SVG string templates | N/A | No DOM dependency, simpler deployment |
| External cron services | In-process scheduling | Architecture decision | Simpler deployment, fewer moving parts |
| jsPDF on server | PDFKit on server | Best practice | PDFKit is Node.js-native; jsPDF is browser-first |

**Deprecated/outdated:**
- `svg-to-pdfkit` last published 6 years ago but still works with current PDFKit. No maintained alternative exists. The SVG spec subset it supports (basic shapes, paths, text) is sufficient for chart rendering.

## Open Questions

1. **Token refresh for scheduled scans**
   - What we know: The audit pipeline uses an `accessToken` parameter. Manual audits get a fresh token from the frontend OAuth flow.
   - What's unclear: How will the scheduler obtain a valid Graph API token for each tenant hours/days after the initial onboarding? The `tokenSecretName` in Key Vault stores the original token.
   - Recommendation: The scheduler should use client credentials flow or a stored refresh token to obtain a fresh access token before each scheduled scan. This is already a concern for the existing architecture (not new to Phase 6). For Phase 6 planning, assume the token retrieval mechanism exists or will be stubbed, and document it as a prerequisite that may need a small infrastructure task.

2. **History endpoint performance at scale**
   - What we know: Each history request requires computing framework scores from findings per audit run.
   - What's unclear: With 100+ audit runs and 100+ findings per run, the N queries could be slow.
   - Recommendation: Use a batch query approach (fetch all findings for all runs in one query with `WHERE auditRunId IN (...)` then group in-memory). Alternatively, persist computed scores in `auditRuns` at audit completion time (schema addition: `framework_scores_json` column). The batch approach is sufficient for v1.

3. **svg-to-pdfkit age and maintenance**
   - What we know: Last npm publish was ~6 years ago. Still works with PDFKit 0.17.x per GitHub issues.
   - What's unclear: Whether it handles all SVG features used in the charts.
   - Recommendation: Keep SVG charts deliberately simple (basic shapes, paths, text, no gradients or filters). Test the specific SVG output with svg-to-pdfkit early in implementation.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.x |
| Config file (API) | `apps/api/vitest.config.ts` |
| Config file (Web) | `apps/web/vitest.config.ts` |
| Quick run command | `cd apps/api && pnpm test` |
| Full suite command | `pnpm -r test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TENANT-05 | PATCH /schedule validates input and updates tenants table | unit | `cd apps/api && pnpm vitest run src/__tests__/schedule-routes.test.ts -x` | Wave 0 |
| TENANT-06 | Scheduler polls DB, respects max-3 concurrency, computes next run | unit | `cd apps/api && pnpm vitest run src/__tests__/scheduler.test.ts -x` | Wave 0 |
| DASH-03 | PDF report endpoint returns valid PDF binary for both types | unit | `cd apps/api && pnpm vitest run src/__tests__/pdf-report.test.ts -x` | Wave 0 |
| DASH-04 | Enhanced CSV exports ~20 columns, respects active filters | unit (web) | `cd apps/web && pnpm vitest run src/__tests__/ExportButtons.test.tsx -x` | Wave 0 |
| DASH-08 | History API returns correct scores computed from findings | unit | `cd apps/api && pnpm vitest run src/__tests__/audit-history.test.ts -x` | Wave 0 |
| DASH-09 | TrendChart renders with 5 lines, handles <3 audit threshold | unit (web) | `cd apps/web && pnpm vitest run src/__tests__/TrendChart.test.tsx -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd apps/api && pnpm test` or `cd apps/web && pnpm test` (whichever is relevant)
- **Per wave merge:** `pnpm -r test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/api/src/__tests__/scheduler.test.ts` -- covers TENANT-05, TENANT-06
- [ ] `apps/api/src/__tests__/pdf-report.test.ts` -- covers DASH-03
- [ ] `apps/api/src/__tests__/svg-charts.test.ts` -- covers SVG generation for PDF
- [ ] `apps/api/src/__tests__/audit-history.test.ts` -- covers DASH-08
- [ ] `apps/web/src/__tests__/TrendChart.test.tsx` -- covers DASH-09
- [ ] `apps/web/src/__tests__/ExportButtons.test.tsx` -- already exists? No, current ExportButtons has no test. Covers DASH-04.
- [ ] PDFKit install: `cd apps/api && pnpm add pdfkit svg-to-pdfkit && pnpm add -D @types/pdfkit`

## Sources

### Primary (HIGH confidence)
- **Project codebase** -- direct inspection of `apps/api/src/routes/audits.ts`, `packages/db/src/control-plane/schema.ts`, `packages/db/src/tenant/schema.ts`, `apps/web/src/components/audit/ExportButtons.tsx`, `apps/web/src/app/tenants/[id]/page.tsx`, `packages/audit/src/pipeline/audit-runner.ts`, `packages/audit/src/pipeline/maturity-calculator.ts`
- **Recharts 3.8.0** -- installed, verified in `apps/web/package.json`, LineChart and RadarChart components confirmed working
- **Drizzle ORM (beta)** -- project pattern for mssqlTable schema definitions and migration SQL files

### Secondary (MEDIUM confidence)
- [PDFKit npm](https://www.npmjs.com/package/pdfkit) -- v0.17.2 latest, Node.js streaming PDF generation
- [svg-to-pdfkit npm](https://www.npmjs.com/package/svg-to-pdfkit) -- v0.1.8, SVG embedding in PDFKit documents
- [@types/pdfkit npm](https://www.npmjs.com/package/@types/pdfkit) -- v0.17.5, TypeScript type definitions
- [PDFKit official docs](https://pdfkit.org/) -- API reference for text, images, vector graphics
- [TypeScript PDF Libraries comparison (BSWEN)](https://docs.bswen.com/blog/2026-02-21-typescript-pdf-libraries-comparison/) -- Confirmed PDFKit is best for server-side Node.js
- [Top JS PDF libraries (Nutrient)](https://www.nutrient.io/blog/top-js-pdf-libraries/) -- Confirmed jsPDF is browser-first

### Tertiary (LOW confidence)
- [svg-to-pdfkit GitHub](https://github.com/alafr/SVG-to-PDFKit) -- Last commit unclear, but still functional per npm download stats and no breaking PDFKit changes

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- PDFKit is the established Node.js PDF library, Recharts already in project, no exotic dependencies
- Architecture: HIGH -- Patterns follow established project conventions (Hono routes, Drizzle schema, React hooks, setInterval is straightforward)
- Pitfalls: HIGH -- Common patterns well-documented, codebase-specific risks identified from direct code inspection
- SVG rendering: MEDIUM -- Manual SVG string generation is straightforward for simple charts but untested with svg-to-pdfkit for these specific chart shapes
- Scheduler: HIGH -- Simple in-process timer with DB polling is a well-understood pattern; the 3 concurrency slots and stagger logic are easy to implement

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable domain, no fast-moving dependencies)
