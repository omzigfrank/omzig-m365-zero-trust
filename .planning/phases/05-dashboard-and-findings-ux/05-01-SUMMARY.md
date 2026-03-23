---
phase: 05-dashboard-and-findings-ux
plan: 01
subsystem: audit, ui, database
tags: [remediation, registry, drawer, multi-select, powershell, syntax-highlight, drizzle, mssql]

# Dependency graph
requires:
  - phase: 02-core-audit-engine
    provides: "control registry with 101 controls (29 AAD + 31 ZTA + 22 800-53 + 19 CSF)"
  - phase: 03-compliance-framework-mapping
    provides: "NIST ZTA, 800-53, CSF control definitions and evaluators"
provides:
  - "getRemediationByControlId() lookup for all 101 controls"
  - "RemediationEntry type with steps, adminPortalUrl, powershell, estimatedImpact, notes"
  - "Drawer slide-over panel component (portal-based, ARIA dialog)"
  - "MultiSelectDropdown component with checkbox list and count badges"
  - "PowerShellBlock component with CSS-class syntax highlighting and copy-to-clipboard"
  - "actionQueueDismissals table in control-plane DB"
  - "criticalFindingsCount column on tenants table"
affects: [05-02-findings-ux, 05-03-action-queue]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Remediation registry as sibling to control registry", "Portal-based Drawer for slide-over panels", "CSS-class regex syntax highlighting (no Prism/highlight.js)"]

key-files:
  created:
    - packages/audit/src/remediation/types.ts
    - packages/audit/src/remediation/entra-id-remediation.ts
    - packages/audit/src/remediation/nist-zta-remediation.ts
    - packages/audit/src/remediation/nist-80053-remediation.ts
    - packages/audit/src/remediation/nist-csf-remediation.ts
    - packages/audit/src/remediation/index.ts
    - packages/audit/src/remediation/__tests__/remediation-registry.test.ts
    - apps/web/src/components/ui/Drawer.tsx
    - apps/web/src/components/ui/MultiSelectDropdown.tsx
    - apps/web/src/components/audit/PowerShellBlock.tsx
  modified:
    - packages/audit/src/index.ts
    - packages/db/src/control-plane/schema.ts

key-decisions:
  - "Remediation registry split into 4 per-framework files mirroring control registry structure"
  - "PowerShell highlighting uses 4-regex pipeline: comments -> strings -> keywords -> params"
  - "Drawer uses createPortal(document.body) to escape parent stacking contexts"
  - "MultiSelectDropdown uses simple absolute positioning (no floating-ui)"
  - "actionQueueDismissals itemKey format: critical-{tenantId} or status-{tenantId}-{type}"

patterns-established:
  - "Remediation data pattern: static TypeScript arrays, Map-based lookup, exported from barrel"
  - "Portal-based UI overlay pattern: Drawer with backdrop, Escape, scroll lock, ARIA dialog"
  - "CSS-class syntax highlighting pattern: HTML-escape, then ordered regex replacements"

requirements-completed: [DASH-05, DASH-06, DASH-07]

# Metrics
duration: 9min
completed: 2026-03-12
---

# Phase 5 Plan 1: Foundation Components Summary

**Remediation registry for all 101 controls with admin portal deep links and PowerShell commands, plus Drawer/MultiSelectDropdown/PowerShellBlock UI primitives and actionQueueDismissals DB schema**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-12T15:19:08Z
- **Completed:** 2026-03-12T15:28:56Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- 101 remediation entries covering all 4 frameworks (29 AAD + 31 ZTA + 22 800-53 + 19 CSF) with step-by-step instructions, admin portal URLs, and PowerShell commands
- All 29 AAD entries have adminPortalUrl; 10+ entries have PowerShell Graph API commands
- 3 reusable UI components: Drawer (portal slide-over), MultiSelectDropdown (checkbox list), PowerShellBlock (syntax-highlighted code block)
- DB schema additions: criticalFindingsCount column on tenants, actionQueueDismissals table

## Task Commits

Each task was committed atomically:

1. **Task 1: Remediation registry (TDD RED)** - `8f4ff56` (test)
2. **Task 1: Remediation registry (TDD GREEN)** - `ec223c2` (feat)
3. **Task 2: UI primitives and DB schema** - `c19710e` (feat)

_TDD task had separate test and implementation commits per TDD protocol._

## Files Created/Modified
- `packages/audit/src/remediation/types.ts` - RemediationEntry interface
- `packages/audit/src/remediation/entra-id-remediation.ts` - 29 CISA SCuBA Entra ID remediation entries with PS commands
- `packages/audit/src/remediation/nist-zta-remediation.ts` - 31 NIST 800-207 ZTA remediation entries
- `packages/audit/src/remediation/nist-80053-remediation.ts` - 22 NIST 800-53 remediation entries
- `packages/audit/src/remediation/nist-csf-remediation.ts` - 19 NIST CSF 2.0 remediation entries
- `packages/audit/src/remediation/index.ts` - Map-based lookup: getRemediationByControlId()
- `packages/audit/src/remediation/__tests__/remediation-registry.test.ts` - 6 tests covering completeness, steps, URLs, PS, duplicates
- `packages/audit/src/index.ts` - Re-exports getRemediationByControlId and RemediationEntry
- `apps/web/src/components/ui/Drawer.tsx` - Portal slide-over with Escape, backdrop, scroll lock, ARIA
- `apps/web/src/components/ui/MultiSelectDropdown.tsx` - Checkbox dropdown with count badges, minSelected
- `apps/web/src/components/audit/PowerShellBlock.tsx` - CSS-class syntax highlighting with copy-to-clipboard
- `packages/db/src/control-plane/schema.ts` - criticalFindingsCount column + actionQueueDismissals table

## Decisions Made
- Remediation registry split into 4 per-framework files mirroring control registry structure (keeps each file 100-300 lines)
- PowerShell highlighting uses ordered 4-regex pipeline: comments first (avoid false positives inside comments), then strings, keywords, parameters
- Drawer uses createPortal(document.body) for z-index isolation from parent containers
- MultiSelectDropdown uses absolute positioning + click-outside handler (no floating-ui dependency, matching project zero-dependency pattern)
- Advisory controls (AAD 4.1, 7.3, 7.4, 7.6, 7.8, 7.9; ZTA T6.3; CSF GV.OC-1, RC.RP-1) include "organizational/advisory control" in steps

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing test failures in `apps/api/src/__tests__/audit-routes.test.ts` (4 tests from Phase 2) -- confirmed unrelated to changes by checking git history. Logged as out-of-scope; did not fix.
- Pre-existing TypeScript error in `apps/web/src/__tests__/TenantDetail.test.tsx` (spread argument type) -- also unrelated and pre-existing.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Remediation registry ready for FindingDetailDrawer (Plan 02) to call getRemediationByControlId()
- Drawer component ready for FindingDetailDrawer integration
- MultiSelectDropdown ready for FilterBar component
- PowerShellBlock ready for remediation PowerShell display
- actionQueueDismissals table ready for action queue API endpoints (Plan 03)
- criticalFindingsCount column ready for action queue computation

## Self-Check: PASSED

All 12 files verified present. All 3 commits verified in git log.

---
*Phase: 05-dashboard-and-findings-ux*
*Completed: 2026-03-12*
