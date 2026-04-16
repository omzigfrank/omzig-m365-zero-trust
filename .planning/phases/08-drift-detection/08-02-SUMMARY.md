---
phase: 08-drift-detection
plan: 02
subsystem: drift-detection-frontend
tags: [drift, frontend, signalr, react, action-queue]
dependency_graph:
  requires: [phase-08-01-drift-backend]
  provides: [drift-ui, drift-signalr-subscription, drift-action-queue-integration]
  affects: [apps/web]
tech_stack:
  added: []
  patterns: [signalr-subscription, drawer-detail-view, optimistic-state-update]
key_files:
  created:
    - apps/web/src/components/drift/DriftAlertList.tsx
    - apps/web/src/components/drift/DriftAlertDetail.tsx
    - apps/web/src/components/drift/DriftSeverityBadge.tsx
    - apps/web/src/components/drift/DriftConfigPanel.tsx
    - apps/web/src/hooks/useDriftAlerts.ts
    - apps/web/src/hooks/useDriftConfig.ts
    - apps/web/src/app/drift/page.tsx
    - apps/web/src/__tests__/DriftAlertList.test.tsx
    - apps/web/src/__tests__/DriftAlertDetail.test.tsx
    - apps/web/src/__tests__/useDriftAlerts.test.ts
  modified:
    - apps/web/src/components/layout/Sidebar.tsx
    - apps/web/src/components/tenants/ActionQueue.tsx
decisions:
  - "DriftAlertDetail renders as a drawer via createPortal (not a separate route) matching Phase 5 Drawer pattern"
  - "Sidebar badge count fetches from /api/action-queue and filters drift_detected items client-side (no separate API call)"
  - "Remediation link uses simpler 'Go to tenant audit' approach rather than client-side evaluator import (avoids bundle bloat)"
  - "AREA_DISPLAY_NAMES exported from DriftAlertList for reuse in DriftAlertDetail"
  - "ActionQueue uses lucide Activity icon for drift_detected (Material Symbols used elsewhere in drift components)"
  - "useDriftAlerts uses useRef for tenantId to avoid stale closures in SignalR handler"
metrics:
  duration: ~9min
  completed: 2026-04-16
  tasks: 2
  files: 12
---

# Phase 8 Plan 02: Frontend Drift UI + Real-Time Push Summary

Complete frontend drift detection UI with alert list, detail drawer with before/after JSON diff, severity badges, real-time SignalR subscription, sidebar navigation with alert count badge, action queue integration, and drift polling config panel. This is the final plan of milestone v1.0.

## Task 1: Drift hooks, DriftAlertList, DriftSeverityBadge, DriftConfigPanel, /drift page, sidebar nav

**Commit:** `897ed2c`

Created the full drift frontend surface:

- **DriftSeverityBadge**: Colored badges for 4 severity levels (Critical=red, High=orange, Medium=yellow, Low=blue) with rounded-full pill styling.
- **DriftAlertList**: Table with 7 columns (Time, Severity, Area, Activity, Actor, Status, Actions). Relative time display with full datetime tooltip. AREA_DISPLAY_NAMES lookup maps 10 area keys to human-readable names. Empty state with dashed border and latency notice. Filter bar with severity and area dropdowns. Dismiss button on active alerts only.
- **DriftConfigPanel**: Polling interval dropdown (15/30/45/60 minutes) with Save button. Admin-only guard (non-Admin users see disabled Save). Success/error feedback inline. Last checked relative time display.
- **useDriftAlerts**: Fetch hook with severity, area, status filters and pagination. SignalR subscription via `connection.on('driftAlert', handler)` prepends new alerts matching current tenantId. Optimistic dismiss with revert on failure.
- **useDriftConfig**: Fetch + save hook for drift polling interval. Auto-clear success message after 3s.
- **/drift page**: Tenant selector dropdown for MSPs with multiple tenants. DriftAlertList with filter state from useDriftAlerts. DriftConfigPanel below the list. DriftAlertDetail drawer opens on alert click.
- **Sidebar**: Added "Drift" nav item with `sync_problem` Material Symbols icon between Reports and Deploy. Red alert count badge (absolute positioned) fetches drift_detected count from action queue API.
- **DriftAlertDetail**: Full drawer component with createPortal rendering, before/after JSON comparison with per-key diff highlighting (yellow for changed "before" keys, green for changed "after" keys), human-readable summary, actor info, latency notice, remediation link to tenant audit page, and dismiss/close buttons.

**Tests:** 13 new tests (DriftSeverityBadge: 4, DriftAlertList: 7, DriftConfigPanel: 2)

## Task 2: DriftAlertDetail tests, useDriftAlerts tests, ActionQueue drift integration

**Commit:** `79b0de4`

- **DriftAlertDetail tests**: 7 tests covering area/severity/activity/actor rendering, diff summary display, before/after JSON sections, latency notice, dismiss button visibility for active vs dismissed alerts, dismiss callback invocation.
- **useDriftAlerts tests**: 5 tests covering initial fetch on mount, empty state for null tenantId, SignalR driftAlert handler prepend for matching tenantId, SignalR message ignored for different tenantId, dismissAlert POST with optimistic local state update.
- **ActionQueue**: Added `drift_detected: "border-l-purple-500"` to SEVERITY_BORDER. Added `Activity` icon from lucide-react for drift_detected TypeIcon case. All 14 existing ActionQueue tests pass without regression.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] @omzig/shared dist rebuild required for TypeScript**
- **Found during:** Task 2 verification
- **Issue:** TypeScript compilation failed because `@omzig/shared` dist types were stale (missing `drift_detected` in the union type added by Plan 08-01)
- **Fix:** Ran `tsc` in `packages/shared` to regenerate dist/index.d.ts with the updated ActionQueueItem type
- **Files modified:** packages/shared/tsconfig.tsbuildinfo (generated)
- **Commit:** N/A (build artifact)

### Notes

- The action-queue API route does not yet compute `drift_detected` items server-side. The ActionQueue frontend handles the type correctly if/when the backend returns drift items. A follow-up is needed to add drift alert counting to the action-queue route.
- Pre-existing TypeScript error in `TenantDetail.test.tsx` (spread argument type) is out of scope -- existed before Phase 8.

## Test Results

| Package | Before | After | Delta | Pre-existing Failures |
|---------|--------|-------|-------|-----------------------|
| apps/web | 165 (165p) | 190 (190p) | +25 | TenantDetail.test.tsx TS error (unchanged) |

## Known Stubs

None -- all components are fully wired to API endpoints and SignalR subscription patterns.

## Threat Flags

None -- all new components consume existing authenticated API routes and SignalR connections. No new network endpoints or auth paths introduced.

## Self-Check: PASSED
