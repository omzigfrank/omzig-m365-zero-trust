---
phase: 03-compliance-framework-mapping
plan: 05
subsystem: ui
tags: [recharts, radar-chart, framework-scores, compliance-dashboard, react, testing-library]

# Dependency graph
requires:
  - phase: 03-compliance-framework-mapping (plans 01-04)
    provides: ZTA, 800-53, CSF evaluators, maturity calculator, unified control registry
  - phase: 02-core-audit-engine
    provides: audit pipeline, audit-runner, fact collector, DB schema, API routes
provides:
  - Combined compliance dashboard with 4 per-framework score cards
  - ZTA maturity radar chart with current/previous audit overlay
  - Multi-select framework filter (replaces radio FrameworkSelector)
  - Per-family (800-53) and per-function (CSF 2.0) score breakdown tables
  - Cross-framework finding badges (800-53, CSF, ZTA tenet)
  - API maturitySnapshot and frameworkScores in audit detail response
  - Frontend types for FrameworkScore, MaturityScoreEntry, FrameworkScores
affects: [phase-05-dashboard-ux, phase-06-reporting, api-routes]

# Tech tracking
tech-stack:
  added: [recharts, @testing-library/react, @testing-library/jest-dom, jsdom, @vitejs/plugin-react]
  patterns: [recharts-radar-chart, multi-select-filter, cross-framework-badges, component-level-testing]

key-files:
  created:
    - apps/web/src/components/audit/ScoreCard.tsx
    - apps/web/src/components/audit/ZtaMaturityRadar.tsx
    - apps/web/src/components/audit/FrameworkFilter.tsx
    - apps/web/src/components/audit/FrameworkBreakdown.tsx
    - apps/web/src/components/audit/FindingBadges.tsx
    - apps/web/src/__tests__/ZtaMaturityRadar.test.tsx
    - .npmrc
  modified:
    - apps/api/src/routes/audits.ts
    - apps/web/src/lib/types.ts
    - apps/web/src/components/audit/ScoreOverview.tsx
    - apps/web/src/components/audit/AuditResults.tsx
    - apps/web/src/components/audit/ExportButtons.tsx
    - apps/web/src/components/audit/FrameworkSelector.tsx
    - apps/web/src/app/audit/page.tsx
    - apps/web/src/hooks/useAudit.ts
    - apps/web/vitest.config.ts
    - apps/web/package.json

key-decisions:
  - "Recharts RadarChart for ZTA maturity visualization with dual Radar layers (solid fill current, dashed outline previous)"
  - "FrameworkFilter multi-select checkboxes replace FrameworkSelector radio buttons -- at least 1 must remain selected"
  - "Score cards always visible regardless of framework filter state (per user decision)"
  - "ExportButtons updated from AuditEnvelope to AuditRunDetail interface for consistency"
  - "useAudit tenantId made optional (default '') to fix pre-existing type mismatch with audit page"
  - "Added .npmrc with public-hoist-pattern for react/* to fix pnpm strict mode + jsdom test resolution"
  - "jsdom environment with esbuild jsx:automatic for component testing"

patterns-established:
  - "Component-level testing with mocked recharts (capture props, render testable data-testid elements)"
  - "FrameworkFilter pattern: Set<string> state with toggle preventing empty deselection"
  - "FindingBadges pattern: conditional inline badges from nullable cross-reference fields"
  - "ScoreCard pattern: reusable color-coded score display with configurable label/product"

requirements-completed: [FRAME-05, FRAME-07]

# Metrics
duration: 15min
completed: 2026-03-11
---

# Phase 3 Plan 5: Combined Compliance Dashboard Summary

**4 per-framework score cards, ZTA maturity radar chart with current/previous overlay, multi-select framework filter, per-family/per-function breakdowns, and cross-framework finding badges**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-11T20:23:01Z
- **Completed:** 2026-03-11T20:38:30Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments
- API audit detail endpoint returns maturitySnapshot (current + previous) and frameworkScores
- 4 per-framework score cards (CISA SCuBA, NIST 800-207, NIST 800-53, CSF 2.0) always visible
- ZTA maturity radar chart with 7 tenet axes, solid fill for current audit, dashed outline for previous
- Multi-select framework filter checkboxes replace old radio-button FrameworkSelector
- Per-control-family breakdown (NIST 800-53: AC, IA, SC, AU, CM, SI, RA) and per-function breakdown (CSF 2.0: GV, ID, PR, DE, RS, RC)
- Cross-framework badges on each finding (800-53: AC-7 | CSF: PR | ZTA: T4)
- 11 ZtaMaturityRadar tests covering axes, data, legend, maturity display, edge cases

## Task Commits

Each task was committed atomically:

1. **Task 1: API framework scores + maturity data + frontend types** - `b8aab31` (feat)
2. **Task 2: Dashboard components, radar chart, filter, badges, test** - `aab8df7` (feat)

## Files Created/Modified
- `apps/api/src/routes/audits.ts` - Added maturitySnapshot, previousMaturity, frameworkScores to audit detail response
- `apps/web/src/lib/types.ts` - Added FrameworkScore, MaturityScoreEntry, FrameworkScores types; extended AuditFinding and AuditRunDetail
- `apps/web/src/components/audit/ScoreCard.tsx` - Reusable color-coded per-framework score card
- `apps/web/src/components/audit/ScoreOverview.tsx` - Rewritten: 4 framework score cards using ScoreCard
- `apps/web/src/components/audit/ZtaMaturityRadar.tsx` - Recharts RadarChart with dual Radar layers and maturity summary
- `apps/web/src/components/audit/FrameworkFilter.tsx` - Multi-select checkbox filter for framework products
- `apps/web/src/components/audit/FrameworkBreakdown.tsx` - Per-family (800-53) and per-function (CSF) score tables
- `apps/web/src/components/audit/FindingBadges.tsx` - Inline cross-framework badge pills
- `apps/web/src/components/audit/AuditResults.tsx` - Rewritten: uses AuditFinding[] with FrameworkFilter and FindingBadges
- `apps/web/src/components/audit/ExportButtons.tsx` - Updated from AuditEnvelope to AuditRunDetail
- `apps/web/src/components/audit/FrameworkSelector.tsx` - Deprecated with comment
- `apps/web/src/app/audit/page.tsx` - New layout: score cards, radar, breakdowns, findings
- `apps/web/src/hooks/useAudit.ts` - tenantId default '' for backward compat
- `apps/web/vitest.config.ts` - jsdom environment with esbuild jsx:automatic
- `apps/web/src/__tests__/ZtaMaturityRadar.test.tsx` - 11 tests with mocked recharts
- `.npmrc` - public-hoist-pattern for react/testing-library/recharts

## Decisions Made
- Recharts RadarChart chosen for ZTA maturity (plan's recommendation confirmed)
- FrameworkFilter uses Set<string> state with minimum-1 prevention
- Score cards always visible regardless of filter (user locked decision from 03-CONTEXT.md)
- ExportButtons updated to AuditRunDetail (was AuditEnvelope) for type consistency
- useAudit tenantId made optional to fix pre-existing page.tsx call mismatch
- Added .npmrc with public-hoist-pattern to resolve pnpm strict mode dependency resolution for jsdom tests
- Used esbuild jsx:automatic in vitest config (simpler than @vitejs/plugin-react which had ESM issues)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] pnpm strict mode preventing jsdom from resolving react**
- **Found during:** Task 2 (ZtaMaturityRadar test setup)
- **Issue:** @testing-library/react in pnpm store couldn't find react (strict isolation)
- **Fix:** Created .npmrc with public-hoist-pattern for react, testing-library, and recharts packages
- **Files modified:** .npmrc, pnpm-lock.yaml
- **Verification:** All 11 tests pass
- **Committed in:** aab8df7 (Task 2 commit)

**2. [Rule 1 - Bug] useAudit tenantId parameter missing default**
- **Found during:** Task 2 (audit page rewrite)
- **Issue:** useAudit(tenantId: string) required arg but page.tsx called useAudit() -- pre-existing TS error
- **Fix:** Added default value: useAudit(tenantId: string = '')
- **Files modified:** apps/web/src/hooks/useAudit.ts
- **Verification:** tsc --noEmit passes with zero new errors
- **Committed in:** aab8df7 (Task 2 commit)

**3. [Rule 1 - Bug] ExportButtons using deprecated AuditEnvelope type**
- **Found during:** Task 2 (audit page rewrite)
- **Issue:** ExportButtons accepted AuditEnvelope but page now passes AuditRunDetail
- **Fix:** Updated ExportButtons to accept AuditRunDetail and use findings array directly
- **Files modified:** apps/web/src/components/audit/ExportButtons.tsx
- **Verification:** tsc --noEmit passes, build succeeds
- **Committed in:** aab8df7 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 bug fixes, 1 blocking)
**Impact on plan:** All auto-fixes necessary for correctness and test infrastructure. No scope creep.

## Issues Encountered
- jsdom v28 had dependency issue with source-map-js; downgraded to v24 which resolved it
- @vitejs/plugin-react ESM-only package couldn't be loaded by vitest CJS config; used esbuild jsx:automatic instead
- Recharts SVG internals don't render in jsdom; adapted tests to use fully mocked recharts capturing props and rendering data-testid elements

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 3 complete: all 5 plans executed covering NIST 800-207, 800-53, CSF 2.0 evaluators, maturity scoring, and combined dashboard
- Combined dashboard provides the UI foundation Phase 5 (Dashboard and Findings UX) will build on for drill-down and remediation guidance
- maturitySnapshot persistence enables Phase 6 (Reporting and Trending) historical compliance trends
- API frameworkScores endpoint ready for Phase 4 multi-tenant dashboard cross-tenant compliance view

## Self-Check: PASSED

All 16 created/modified files verified present. Both task commits (b8aab31, aab8df7) verified in git log. 11 ZtaMaturityRadar tests pass. Web app tsc --noEmit clean. Build succeeds.

---
*Phase: 03-compliance-framework-mapping*
*Completed: 2026-03-11*
