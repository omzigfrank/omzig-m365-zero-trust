# Phase 5: Dashboard and Findings UX - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Build interactive drill-down navigation, enhanced filtering, structured remediation guidance, and a cross-tenant action queue so MSPs can explore audit findings, understand what to fix, and prioritize across tenants. No scheduled scans (Phase 6), no auto-remediation execution (Phase 7), no drift detection (Phase 8). Remediation is guidance-only — step-by-step instructions, admin portal links, and PowerShell commands, not automated fixes.

</domain>

<decisions>
## Implementation Decisions

### Finding Detail & Drill-Down (DASH-01)
- **Hybrid navigation**: Grouped accordion for category drill-down (stays on same page) + slide-over drawer for finding detail (no page navigation)
- **Grouped accordion**: Top-level rows are categories (e.g., "Access Control (AC)"), click to expand showing individual findings within. Each group shows pass/fail summary count.
- **Slide-over drawer**: 400px right slide-over panel. Opens when clicking a finding row. Shows: status badge, severity, control ID, description, setting name, current vs expected value, remediation steps, admin portal link, PowerShell command (copy button), cross-framework badges. Scrollable if content overflows.
- **Grouping hierarchy with multiple frameworks**: Group by framework first, then categories within. When only 1 framework selected, skip framework level and go straight to categories.
- **View toggle**: Both grouped and flat views available via toggle button next to filter bar. Grouped is default. Flat view preserves existing AuditResults table behavior (simple table with all findings).
- **No new UI primitive exists**: Need to create a Drawer/SlideOver component in `apps/web/src/components/ui/`

### Remediation Guidance Content (DASH-05, DASH-06, DASH-07)
- **Static registry in code**: Create `packages/audit/src/remediation-registry.ts` mapping control IDs to structured remediation objects: `{ steps: string[], adminPortalUrl: string, powershell?: string, estimatedImpact?: string }`
- **Separate from evaluators**: Evaluators continue returning plain `action` text. The drawer looks up structured data by `controlId` from the registry at render time. The `action` field in auditFindings remains the plain-text fallback.
- **Full coverage**: All ~101 controls get remediation entries. Advisory controls (warn) show organizational guidance ("This is an organizational control. Verify with your security team."). Actionable controls get specific steps, portal links, and PowerShell where applicable.
- **PowerShell display**: Syntax-highlighted code block with basic keyword coloring via CSS classes (no heavy library like Prism/highlight.js). One-click copy button. Multi-line commands shown in full.
- **Admin portal links**: Direct deep links to relevant Entra admin portal pages (e.g., `https://entra.microsoft.com/#view/Microsoft_AAD_ConditionalAccess/...`)

### Filter & Search Enhancement (DASH-02)
- **Horizontal filter bar**: Single horizontal bar above findings list with: Framework (multi-select dropdown), Severity (multi-select: Critical/High/Medium/Low), Status (multi-select: Pass/Fail/Warn/NA), Workload (multi-select dropdown), text search. All inline.
- **Active filter badges**: Each dropdown shows count of active selections (e.g., "Severity (2)"). "Clear all" link appears when any filter is active.
- **Workload filter**: Added with "Entra ID" as the only option in v1 (pre-selected, non-removable). Makes UI ready for v2 workloads (Exchange, Teams, SharePoint) without functional complexity.
- **Evolves existing**: Current AuditResults has framework filter (FrameworkFilter component with checkboxes) and status filter (pill buttons). Transform these into the unified horizontal filter bar with dropdown pattern. Severity and Workload are new dimensions.
- **Multi-select dropdown component**: Need a reusable MultiSelectDropdown component in `apps/web/src/components/ui/` — used by Framework, Severity, Workload filters.

### Alert/Action Queue (DASH-10)
- **Dashboard section**: Dedicated collapsible panel on the `/tenants` page (multi-tenant dashboard), positioned above the tenant grid. Shows cross-tenant items sorted by severity then recency.
- **Two data sources in Phase 5**:
  1. **Critical findings**: Critical/High severity failures from latest audit per tenant. Grouped by tenant (e.g., "Contoso: 3 critical failures"). Click navigates to `/tenants/:id` findings tab.
  2. **Tenant status events**: needs_reauth (orange), stale audit >7 days (yellow). Click navigates to `/tenants/:id` settings tab or triggers re-audit.
- **Phase 8 extends**: Drift events will be added as a third source type (purple indicators).
- **Display**: Top 5 items by default, "View All" link for full list. Each item has dismiss/acknowledge action (marks as seen, stored per-user). Dismissed items don't reappear until next audit finds same issue.
- **Schema**: New `actionQueueItems` table in control-plane DB for dismiss state tracking. Items are computed from tenant audit data + tenant status, dismiss state overlaid.
- **Badge count**: Navigation shows unread action count badge (optional — Claude's discretion on placement)

### Claude's Discretion
- Exact Drawer/SlideOver component implementation (portal vs inline, animation approach)
- MultiSelectDropdown component internals (popper/floating-ui vs simple absolute positioning)
- PowerShell syntax highlighting CSS class names and keyword patterns
- Action queue item computation logic (SQL query vs in-memory aggregation)
- actionQueueItems table schema design (columns, indexes)
- Grouped accordion expand/collapse animation approach
- Filter state management (URL params vs component state)
- Remediation registry data for all 101 controls (steps, URLs, PowerShell commands)
- Whether to split remediation registry into per-framework files or single file
- GroupedFindingsView component structure and state management
- How the flat/grouped view toggle interacts with the filter bar

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- **AuditResults** (`apps/web/src/components/audit/AuditResults.tsx`): Flat table with framework filter (FrameworkFilter component), status filter (pill buttons), text search. 153 lines. Transform into enhanced version with grouped view toggle and expanded filters.
- **FrameworkFilter** (`apps/web/src/components/audit/FrameworkFilter.tsx`): Multi-select checkboxes for AAD/ZTA/80053/CSF. Currently standalone component — will be absorbed into unified filter bar.
- **FrameworkBreakdown** (`apps/web/src/components/audit/FrameworkBreakdown.tsx`): Groups findings by family (800-53) and function (CSF) with progress bars. Has `groupFindings()` helper, `FAMILY_NAMES` and `FUNCTION_NAMES` maps. Reuse grouping logic for the accordion view.
- **FindingBadges** (`apps/web/src/components/audit/FindingBadges.tsx`): Inline badges showing cross-framework mappings (nist80053, nistCsf, nist800207Tenet). Reuse in drawer.
- **Badge** (`apps/web/src/components/ui/Badge.tsx`): Pass/fail/warn/na status badge. Reuse in drawer and grouped view.
- **Card** (`apps/web/src/components/ui/Card.tsx`): Generic card wrapper. Reuse for action queue panel.
- **ExportButtons** (`apps/web/src/components/audit/ExportButtons.tsx`): JSON/CSV export. Already exists, no changes needed.
- **ScoreOverview** (`apps/web/src/components/audit/ScoreOverview.tsx`): 4 framework score cards. No changes needed.
- **ZtaMaturityRadar** (`apps/web/src/components/audit/ZtaMaturityRadar.tsx`): Recharts radar chart. No changes needed.
- **Control registry** (`packages/audit/src/registry/control-registry.ts`): `getAllControls()`, `getControlById()`, `getControlsByProduct()`. Source of truth for control metadata. Remediation registry lives alongside.
- **Control definitions** (`packages/audit/src/registry/entra-id-controls.ts`, etc.): 4 files defining all 101 controls with id, product, description, requirementLevel, severity, cross-framework mappings.
- **Tenant dashboard** (`apps/web/src/app/tenants/page.tsx`): Multi-tenant grid with card/table toggle. Action queue section goes above tenant grid.
- **Tenant detail** (`apps/web/src/app/tenants/[id]/page.tsx`): 4 tabs (Overview, Findings, History, Settings). Findings tab wraps AuditResults — enhanced version replaces it.
- **useTenants hook** (`apps/web/src/hooks/useTenants.ts`): Fetches tenant list with scores/health. Action queue data can piggyback or use separate endpoint.

### AuditFinding Type (complete fields)
```typescript
interface AuditFinding {
  id: string;
  controlId: string;     // e.g., 'MS.AAD.1.1v1'
  product: string;        // 'AAD', 'ZTA', '80053', 'CSF'
  description: string;
  requirementLevel: "SHALL" | "SHALL NOT" | "SHOULD" | "SHOULD NOT" | "MAY";
  severity: "Critical" | "High" | "Medium" | "Low";
  rating: "pass" | "fail" | "warn" | "na";
  message: string;
  action?: string;        // Plain-text remediation (fallback)
  settingName?: string;   // Not currently displayed in UI
  currentValue?: string;  // Not currently displayed in UI
  expectedValue?: string; // Not currently displayed in UI
  requiredPermission?: string;
  nist80053?: string;     // Cross-framework mapping
  nistCsf?: string;       // Cross-framework mapping
  nist800207Tenet?: string;
}
```

### Established Patterns
- Hono API with separated route files registered in app.ts
- Drizzle ORM with mssqlTable for control-plane and tenant schemas
- Next.js pages with AuthGuard wrapper and useAuth hook
- Vitest + React Testing Library for frontend tests
- `.npmrc public-hoist-pattern` for react/testing-library/recharts
- Client-side state management with React hooks (no Redux/Zustand)
- Lucide icons for UI elements (Search, Filter already used)

### Integration Points
- AuditResults component: transform into enhanced version with grouped/flat toggle
- FrameworkFilter component: absorb into unified horizontal filter bar
- Tenant detail page Findings tab: renders enhanced AuditResults
- Tenant dashboard `/tenants`: add ActionQueue section above grid
- Control registry: add sibling remediation-registry.ts file
- Control-plane schema: add actionQueueDismissals table for per-user dismiss state
- No new API routes needed for findings (data already comes via audit detail endpoint)
- New API endpoint needed for action queue data (aggregate critical findings across tenants)
- New API endpoint needed for dismiss/acknowledge actions
- UI components needed: Drawer/SlideOver, MultiSelectDropdown, GroupedFindingsView, ActionQueue, FindingDetail

</code_context>

<specifics>
## Specific Ideas

- Grouped accordion with slide-over drawer gives MSPs the density they need (scan 100+ controls quickly) with the depth they need (full remediation detail without losing context of the list).
- Static remediation registry is versionable, testable, and reviewable in code review. Control authors can update remediation steps alongside evaluator changes.
- PowerShell commands with copy button are the highest-value feature for MSPs who fix things daily — copy, paste into terminal, done.
- Action queue populated by critical findings + tenant status gives immediate value even before drift detection exists. MSPs see "which tenants need attention right now" without clicking into each one.
- Dismiss/acknowledge on queue items prevents alert fatigue for known-but-not-yet-fixed issues (e.g., "we know Contoso's legacy auth is blocked by the client, dismissing until next quarter review").

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 05-dashboard-and-findings-ux*
*Context gathered: 2026-03-12*
