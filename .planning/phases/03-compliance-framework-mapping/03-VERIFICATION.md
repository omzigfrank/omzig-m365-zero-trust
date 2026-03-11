---
phase: 03-compliance-framework-mapping
verified: 2026-03-11T00:00:00Z
status: passed
score: 7/7 must-haves verified
re_verification: false
---

# Phase 3: Compliance Framework Mapping Verification Report

**Phase Goal:** Users can view their tenant's compliance posture across NIST 800-207, 800-53, and CSF 2.0 with maturity scoring
**Verified:** 2026-03-11
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | ControlDefinition type includes optional nistCsf and nist800207Tenet fields | VERIFIED | `packages/audit/src/types.ts` lines 224-226: both fields present as optional on ControlDefinition interface |
| 2 | DB schema has maturityScores table and auditFindings has nist_csf and nist_800_207_tenet columns | VERIFIED | `packages/db/src/tenant/schema.ts` lines 48-49 (findings columns) and lines 57-69 (maturityScores table); exported from `packages/db/src/index.ts` line 15 |
| 3 | 31 ZTA evaluators exist covering all 7 NIST 800-207 tenets | VERIFIED | 7 tenet files + index in `packages/audit/src/evaluators/nist-zta/`; ztaEvaluators Map has 31 entries confirmed by 69 grep hits on evaluateZTA_ in index.ts; NIST_ZTA_CONTROLS has 31 entries (product='ZTA' count: 31) |
| 4 | 22 independent NIST 800-53 evaluators and 19 CSF 2.0 evaluators exist with registries | VERIFIED | NIST_80053_CONTROLS: 22 entries (product='80053' count: 22); NIST_CSF_CONTROLS: 19 entries (product='CSF' count: 19); all evaluator files present |
| 5 | Maturity calculator with severity-weighted scoring persisted via pipeline | VERIFIED | `packages/audit/src/pipeline/maturity-calculator.ts` fully implemented (SEVERITY_WEIGHTS Critical=4/High=3/Medium=2/Low=1); `audit-runner.ts` calls calculateMaturitySnapshot and inserts per-tenet + overall rows into maturityScores |
| 6 | Audit pipeline runs all 4 framework registries via getAllControls() | VERIFIED | `control-registry.ts` spreads all 4 arrays into ALL_CONTROLS; `audit-runner.ts` imports getAllControls, uses allControls.length for progress and DB update |
| 7 | User can view 4 per-framework scores, ZTA maturity radar chart, and framework breakdowns | VERIFIED | ScoreOverview (4 ScoreCards), ZtaMaturityRadar (Recharts RadarChart with dual Radar layers), FrameworkBreakdown (800-53 family + CSF function tables), FindingBadges, FrameworkFilter all exist and are wired in audit/page.tsx |

**Score: 7/7 truths verified**

---

## Required Artifacts

### Plan 03-01 Artifacts (FRAME-02)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/audit/src/types.ts` | Extended ControlDefinition with nistCsf and nist800207Tenet | VERIFIED | Both optional fields present at lines 224-226 |
| `packages/db/src/tenant/schema.ts` | Extended auditFindings + new maturityScores table | VERIFIED | nistCsf/nist800207Tenet columns at lines 48-49; maturityScores table at lines 57-69 |
| `packages/audit/src/evaluators/nist-zta/index.ts` | Barrel export of all 31 ZTA evaluator functions | VERIFIED | All 31 exports + ztaEvaluators Map; 115 lines |
| `packages/audit/src/registry/nist-zta-controls.ts` | 31 NIST ZTA control definitions | VERIFIED | 31 entries, all product='ZTA', all 7 tenets represented (T1-T7) |
| `packages/audit/src/__tests__/zta-evaluators.test.ts` | Unit tests for all 31 ZTA evaluators | VERIFIED | 632 lines (min_lines: 200 requirement exceeded) |

### Plan 03-02 Artifacts (FRAME-03)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/audit/src/evaluators/nist-80053/index.ts` | Barrel export of all 800-53 evaluator functions | VERIFIED | Exports nist80053Evaluators |
| `packages/audit/src/registry/nist-80053-controls.ts` | 800-53 control definitions | VERIFIED | 22 entries, product='80053', all 7 families (AC/IA/SC/AU/CM/SI/RA) |
| `packages/audit/src/__tests__/nist-80053-evaluators.test.ts` | Unit tests for all 22 evaluators | VERIFIED | 604 lines (min_lines: 200 requirement exceeded) |

### Plan 03-03 Artifacts (FRAME-04)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/audit/src/evaluators/nist-csf/index.ts` | Barrel export of all CSF evaluator functions | VERIFIED | Exports nistCsfEvaluators |
| `packages/audit/src/registry/nist-csf-controls.ts` | CSF control definitions | VERIFIED | 19 entries, product='CSF', all 6 functions (PR/DE/ID/RS/GV/RC) |
| `packages/audit/src/__tests__/csf-evaluators.test.ts` | Unit tests for all 19 evaluators | VERIFIED | 573 lines (min_lines: 150 requirement exceeded) |

### Plan 03-04 Artifacts (FRAME-05, FRAME-06)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/audit/src/pipeline/maturity-calculator.ts` | Severity-weighted maturity scoring | VERIFIED | Exports calculateMaturitySnapshot, calculateMaturityLevel, computeFrameworkScores, MaturitySnapshot, TenetMaturity, MaturityLevel; full implementation |
| `packages/audit/src/registry/control-registry.ts` | Unified ALL_CONTROLS including all 4 frameworks | VERIFIED | Spreads ENTRA_ID_CONTROLS + NIST_ZTA_CONTROLS + NIST_80053_CONTROLS + NIST_CSF_CONTROLS |
| `packages/audit/src/pipeline/audit-runner.ts` | Extended pipeline running all controls + maturity persistence | VERIFIED | Uses getAllControls(), persists nistCsf/nist800207Tenet on findings, inserts per-tenet and overall maturityScores rows |
| `packages/audit/src/__tests__/maturity-calculator.test.ts` | Maturity calculator unit tests | VERIFIED | 243 lines (min_lines: 80 requirement exceeded) |
| `packages/audit/src/__tests__/score-computation.test.ts` | Framework score computation unit tests | VERIFIED | 122 lines (min_lines: 40 requirement exceeded) |

### Plan 03-05 Artifacts (FRAME-05, FRAME-07)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/web/src/components/audit/ScoreCard.tsx` | Reusable score card component | VERIFIED | 55 lines; renders score%, pass/fail counts, color-coded progress bar |
| `apps/web/src/components/audit/ZtaMaturityRadar.tsx` | Recharts RadarChart with dual Radar layers | VERIFIED | 133 lines; imports from recharts; current (solid) + previous (dashed) Radar layers; 7 tenet axes |
| `apps/web/src/components/audit/FrameworkFilter.tsx` | Multi-select framework filter checkboxes | VERIFIED | 57 lines; 4 checkbox controls for AAD/ZTA/80053/CSF; prevents deselecting all |
| `apps/web/src/components/audit/FrameworkBreakdown.tsx` | Per-family and per-function score breakdown tables | VERIFIED | 149 lines; groups 800-53 findings by control family, CSF findings by function |
| `apps/web/src/components/audit/FindingBadges.tsx` | Cross-framework badge rendering | VERIFIED | 41 lines; renders 800-53/CSF/ZTA tenet badges per finding |
| `apps/web/src/lib/types.ts` | Extended frontend types for multi-framework audit data | VERIFIED | Contains MaturitySnapshot (MaturityScoreEntry), FrameworkScore, FrameworkScores; AuditFinding includes nistCsf and nist800207Tenet; AuditRunDetail has maturitySnapshot, previousMaturity, frameworkScores |
| `apps/web/src/__tests__/ZtaMaturityRadar.test.tsx` | Unit tests for ZtaMaturityRadar component | VERIFIED | 193 lines (min_lines: 40 requirement exceeded); 10 test cases covering 7 axes, current/previous rendering, null/undefined handling |

---

## Key Link Verification

### Plan 03-01 Key Links

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `nist-zta-controls.ts` | `evaluators/nist-zta/` | import evaluator functions | WIRED | All 31 evaluator functions imported from 7 tenet files; confirmed in file lines 8-29 |
| `nist-zta-controls.ts` | `types.ts` | ControlDefinition type | WIRED | `import type { ControlDefinition } from '../types.js'` at line 6 |

### Plan 03-02 Key Links

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `nist-80053-controls.ts` | `evaluators/nist-80053/` | import evaluator functions | WIRED | All 22 evaluators imported from 7 family files; confirmed in file lines 11-31 |
| `nist-80053-controls.ts` | `types.ts` | ControlDefinition type | WIRED | `import type { ControlDefinition } from '../types.js'` at line 9 |

### Plan 03-03 Key Links

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `nist-csf-controls.ts` | `evaluators/nist-csf/` | import evaluator functions | WIRED | All 19 evaluators imported from 6 function files; confirmed in file lines 8-22 |
| `nist-csf-controls.ts` | `types.ts` | ControlDefinition type | WIRED | `import type { ControlDefinition } from '../types.js'` at line 6 |

### Plan 03-04 Key Links

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `control-registry.ts` | `nist-80053-controls.ts` | spread into ALL_CONTROLS | WIRED | `import { NIST_80053_CONTROLS }` and spread at line 15 |
| `control-registry.ts` | `nist-csf-controls.ts` | spread into ALL_CONTROLS | WIRED | `import { NIST_CSF_CONTROLS }` and spread at line 17 |
| `audit-runner.ts` | `control-registry.ts` | getAllControls() instead of ENTRA_ID_CONTROLS | WIRED | `import { getAllControls } from '../registry/control-registry.js'` at line 15; `const allControls = getAllControls()` at line 40 |
| `audit-runner.ts` | `maturity-calculator.ts` | calculateMaturitySnapshot after evaluation | WIRED | `import { calculateMaturitySnapshot }` at line 21; called at line 144 after evaluation loop |

### Plan 03-05 Key Links

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `apps/web/src/app/audit/page.tsx` | `ZtaMaturityRadar.tsx` | component import and data pass | WIRED | Imported at line 5; rendered with `current={audit.result.maturitySnapshot}` and `previous={audit.result.previousMaturity}` |
| `apps/web/src/app/audit/page.tsx` | `ScoreOverview.tsx` | 4 score cards rendering | WIRED | Imported at line 4; rendered with `frameworkScores={audit.result.frameworkScores}` |
| `apps/web/src/app/audit/page.tsx` | `FrameworkFilter.tsx` | framework filter state | WIRED | FrameworkFilter is used inside AuditResults.tsx (which is wired in page.tsx at line 113) |
| `apps/api/src/routes/audits.ts` | `@omzig/db maturityScores` | query for maturity data in audit detail response | WIRED | `import { auditRuns, auditFindings, maturityScores } from '@omzig/db'` at line 4; queried at line 172; returned as `maturitySnapshot` in response at line 219 |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| FRAME-02 | 03-01 | Evaluate tenant against NIST 800-207 ZTA (7 tenets, 31+ checks) | SATISFIED | 31 ZTA evaluators in registry; all 7 tenets T1-T7 covered |
| FRAME-03 | 03-02 | Cross-map findings to NIST 800-53 control families | SATISFIED | 22 independent 800-53 evaluators; nistCsf populated on findings and persisted in auditFindings.nist_csf |
| FRAME-04 | 03-03 | Cross-map findings to NIST CSF 2.0 functions | SATISFIED | 19 CSF 2.0 evaluators covering PR/DE/ID/RS/GV/RC; nistCsf field carries function code |
| FRAME-05 | 03-04, 03-05 | User can view compliance score per framework (CISA SCuBA, NIST 800-207, NIST 800-53, CSF 2.0) | SATISFIED | computeFrameworkScores in maturity-calculator.ts; API computes frameworkScores in GET /audits/:id; ScoreOverview renders 4 ScoreCards |
| FRAME-06 | 03-04 | User can view ZTA maturity level per NIST 800-207 tenet | SATISFIED | calculateMaturitySnapshot produces per-tenet TenetMaturity with maturityLevel (Traditional/Initial/Advanced/Optimal); persisted to maturityScores table; API returns maturitySnapshot |
| FRAME-07 | 03-05 | Dashboard displays ZTA maturity radar chart showing all 7 tenets | SATISFIED | ZtaMaturityRadar component with RadarChart; 7 tenet axes; current solid fill + previous dashed overlay; rendered in audit/page.tsx |

All 6 requirement IDs from phase plans are accounted for. No orphaned requirements found for Phase 3 in REQUIREMENTS.md.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/api/src/routes/audits.ts` | 246 | `// Placeholder: Plan 03 wires actual retry logic` — retry endpoint returns static `{ status: 'retrying' }` | Info | Single-check retry is not wired; not part of Phase 3 goal (FRAME requirements). Does not block compliance posture viewing. |
| `apps/web/src/components/audit/ZtaMaturityRadar.tsx` | 40 | `return null` on empty/undefined current | Info | Guard clause for no-data state — not a stub; intentional and correct |
| `apps/web/src/components/audit/FrameworkBreakdown.tsx` | 130 | `return null` on empty groups | Info | Guard clause for no-data state — not a stub; intentional and correct |

No blocker anti-patterns found. All `return null` instances are proper empty-state guards. The retry placeholder is an existing pre-Phase-3 stub for a different feature (single-check retry) that is out of scope for this phase.

---

## Human Verification Required

### 1. Radar Chart Visual Rendering

**Test:** Complete an audit run, wait for it to finish, then view the audit detail page.
**Expected:** ZTA Maturity Radar section appears with a spider/radar chart showing 7 axes labeled Resources, Communication, Per-Session, Dynamic Policy, Monitoring, Authentication, Improvement. Each axis shows a value 0-100. Current audit data renders as a blue filled polygon.
**Why human:** Recharts ResponsiveContainer requires an actual browser environment with DOM dimensions. The test mocks it; visual correctness requires a real render.

### 2. Previous Audit Overlay on Radar Chart

**Test:** Run two audits sequentially, then view the second audit's detail page.
**Expected:** Radar chart shows both the current audit polygon (solid blue fill) and the previous audit polygon (gray dashed outline, no fill). A Legend shows "Current" and "Previous" labels.
**Why human:** Requires two completed audit runs in the database. Cannot verify with static analysis.

### 3. Framework Score Cards Always Visible During Filter

**Test:** On the audit detail page, uncheck two framework checkboxes in the filter. Then recheck them.
**Expected:** The 4 per-framework score cards (CISA SCuBA, NIST 800-207, NIST 800-53, NIST CSF 2.0) remain visible and show accurate scores regardless of which frameworks are checked in the findings filter.
**Why human:** Score cards are rendered by ScoreOverview which is above AuditResults and not affected by the FrameworkFilter state in AuditResults. Requires runtime verification.

### 4. NIST 800-53 Control Family Breakdown Rendering

**Test:** After a completed audit, scroll to the Framework Breakdowns section.
**Expected:** "NIST 800-53 by Control Family" table shows rows for AC, IA, SC, AU, CM, SI, RA with pass/total counts and colored bars.
**Why human:** Requires a real audit run with findings that have product='80053' and nist80053 populated. The grouping logic extracts the family prefix from the control ID.

### 5. Cross-Framework Badges on Findings

**Test:** In the findings table, locate any ZTA finding (e.g., NIST.ZTA.T1.1v1).
**Expected:** Below the control ID, badges appear: `800-53: CM-8` (indigo), `ZTA: T1` (blue). For a CSF finding, `CSF: PR` (teal) badge appears.
**Why human:** Requires a completed audit with findings that have nist80053, nistCsf, and nist800207Tenet populated in the database.

---

## Gaps Summary

No gaps identified. All 7 observable truths are verified. All artifacts exist, are substantive, and are wired into the data flow. All 6 FRAME requirements are satisfied by actual implementation evidence.

The retry endpoint placeholder at line 246 of audits.ts is a pre-existing stub for a different feature (single-check retry) that was explicitly called out in Plan 03 context as not yet implemented. It does not block any Phase 3 goal or requirement.

---

_Verified: 2026-03-11_
_Verifier: Claude (gsd-verifier)_
