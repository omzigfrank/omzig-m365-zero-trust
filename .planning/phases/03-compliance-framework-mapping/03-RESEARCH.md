# Phase 3: Compliance Framework Mapping - Research

**Researched:** 2026-03-11
**Domain:** NIST compliance framework evaluators, cross-framework mapping, maturity scoring, radar chart visualization
**Confidence:** HIGH

## Summary

Phase 3 extends the existing audit engine (29 CISA SCuBA Entra ID evaluators) with three NIST compliance frameworks: NIST 800-207 (Zero Trust Architecture, 7 tenets), NIST 800-53 Rev 5 (Security Controls, 20 control families), and NIST CSF 2.0 (Cybersecurity Framework, 6 functions). Each framework gets **independent evaluators** -- not derived from CISA mappings -- that follow the established `EvaluatorFn = (facts: AuditFacts) => EvaluatorResult` pattern. All evaluators consume the same 15-area AuditFacts snapshot, requiring no new Graph API calls.

The existing codebase provides a mature foundation. The PowerShell `NistEvaluatorRegistry.ps1` contains 35 ZTA checks organized by 7 tenets -- a direct port source. The `ControlDefinition` type already has a `nist80053` field and needs extension with `nistCsf` and `nist800207Tenet`. The `auditFindings` DB table needs new columns for CSF function and ZTA tenet. The audit pipeline (`audit-runner.ts`) currently runs only `ENTRA_ID_CONTROLS` and must be extended to run all registered controls. The frontend `FrameworkSelector` (radio buttons) must be replaced with multi-select filter checkboxes, and a new radar chart component is needed for ZTA maturity visualization.

**Primary recommendation:** Port the 35 PowerShell ZTA checks first (they map 1:1 to the existing AuditFacts), then build 800-53 and CSF evaluators that target the same fact areas. Extend `ControlDefinition` with cross-reference fields, extend the DB schema, update the pipeline to run `getAllControls()`, and build the combined dashboard with recharts RadarChart.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Port + enhance: port the 35 PowerShell ZTA checks (NistEvaluatorRegistry.ps1) 1:1 as baseline, then add new checks where the researcher identifies gaps vs the official NIST 800-207 spec
- ZTA evaluators run as part of the same audit pipeline -- one audit run = CISA + ZTA + 800-53 + CSF checks, single progress stream, one set of findings
- ZTA findings stored in the same `auditFindings` table with `product='ZTA'`
- Evaluators use the same existing AuditFacts (15 data areas) -- no new Graph API calls needed
- NIST 800-53 evaluators are independent -- NOT derived from CISA/ZTA mappings. Own evaluator functions with own pass/fail logic
- Each 800-53 evaluator maps to an 800-53 control family (AC, IA, SC, AU, etc.)
- Stored in `auditFindings` with `product='80053'` (or similar)
- NIST CSF 2.0 evaluators are independent -- consistent with the 800-53 decision
- Each CSF evaluator maps to a CSF 2.0 function (Govern/Identify/Protect/Detect/Respond/Recover)
- Stored in `auditFindings` with `product='CSF'` (or similar)
- All evaluators use the same AuditFacts snapshot
- Extend `ControlDefinition` with `nistCsf` and `nist800207Tenet` fields alongside existing `nist80053`
- Each finding carries its full cross-reference chain -- denormalized, consistent with Phase 2 design
- All framework mappings live on the control definition, not in separate mapping tables
- Severity-weighted pass rate per NIST 800-207 tenet. Critical findings weigh heavier than Low
- Maturity thresholds: Traditional (<40%), Initial (40-69%), Advanced (70-89%), Optimal (90%+)
- Thresholds are configurable per org (not hardcoded)
- Overall tenant maturity shows BOTH weighted average AND weakest tenet
- Maturity scores stored as a snapshot with each audit run (not computed on-the-fly) -- enables historical trending in Phase 6
- Combined dashboard layout: score cards at top (all 4 frameworks), ZTA maturity radar chart, then unified findings list with filters
- Radar chart shows current audit as solid fill + previous audit as dotted outline for comparison
- FrameworkSelector replaced with multi-select filter checkboxes -- users toggle which frameworks appear in findings list, score cards always visible
- NIST 800-53 shows per-control-family breakdown (AC: 85%, IA: 90%, SC: 70%, etc.)
- NIST CSF 2.0 shows per-function scores (Identify, Protect, Detect, etc.)
- Findings list supports inline cross-framework linking: each finding shows badges/tags for mapped frameworks

### Claude's Discretion
- Exact evaluator file organization within framework directories
- Product code naming convention for new frameworks (ZTA, 80053, CSF, etc.)
- Radar chart library selection
- Maturity score weight formula (how much heavier Critical vs Low)
- Cross-reference badge styling and interaction
- auditFindings schema changes needed for new framework columns
- Test structure and mocking approach for new evaluators

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FRAME-02 | Audit engine evaluates tenant against NIST 800-207 ZTA (all 7 tenets, 31+ checks) | PowerShell NistEvaluatorRegistry.ps1 has 35 checks covering all 7 tenets; direct TypeScript port with same AuditFacts; NIST 800-207 tenet mapping documented below |
| FRAME-03 | Each finding cross-maps to NIST 800-53 security control families where applicable | ControlDefinition already has `nist80053` field; extend to all new evaluators; 20 control families documented; independent evaluators per family |
| FRAME-04 | Each finding cross-maps to NIST CSF 2.0 functions where applicable | New `nistCsf` field on ControlDefinition; CSF 2.0 has 6 functions (GV/ID/PR/DE/RS/RC) with 22 categories; independent evaluators per function |
| FRAME-05 | User can view compliance score per framework (CISA SCuBA, NIST 800-207, NIST 800-53, CSF 2.0) | Combined dashboard with 4 score cards; scores computed from pass/fail/total per product code; maturity snapshot persisted with audit run |
| FRAME-06 | User can view ZTA maturity level per NIST 800-207 tenet | Severity-weighted pass rate per tenet; 4 levels (Traditional/Initial/Advanced/Optimal); configurable thresholds; both weighted average and weakest tenet shown |
| FRAME-07 | Dashboard displays ZTA maturity radar chart showing all 7 tenets | Recharts RadarChart with dual Radar layers (current + previous audit); 7 tenet axes; solid fill current, dotted outline previous |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| recharts | ^2.12.0 | Radar chart for ZTA maturity visualization | Most popular React charting lib (25M+ weekly npm downloads); native SVG; supports multiple Radar layers for current/previous overlay; TypeScript support; composable API fits React patterns |
| vitest | ^2.0.0 | Unit testing for all evaluators | Already in project; used for all 29 existing evaluator tests |
| drizzle-orm | beta | DB schema extension for new columns | Already in project; mssql-core for Azure SQL |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @omzig/audit | workspace | Evaluator types, AuditFacts, pipeline | All evaluator code lives here |
| @omzig/db | workspace | Schema definitions, migrations | auditFindings schema extension |
| lucide-react | ^0.468.0 | Icons for framework badges and UI | Already in web app |
| clsx | ^2.1.1 | Conditional CSS classes | Already in web app |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| recharts | chart.js + react-chartjs-2 | Canvas-based (not SVG), harder to style with Tailwind, heavier bundle. Recharts is simpler for the single radar chart needed here |
| recharts | nivo | More sophisticated but heavier dependency for just one chart type |
| recharts | visx (Airbnb) | Lower-level, more effort to build radar chart from primitives |

**Installation:**
```bash
cd apps/web && pnpm add recharts
```

## Architecture Patterns

### Recommended Project Structure

```
packages/audit/src/
  evaluators/
    entra-id/          # Existing 29 CISA evaluators (8 files)
    nist-zta/          # NIST 800-207 ZTA evaluators (7 files, one per tenet)
      tenet-1-resources.ts
      tenet-2-communication.ts
      tenet-3-per-session.ts
      tenet-4-dynamic-policy.ts
      tenet-5-monitoring.ts
      tenet-6-authentication.ts
      tenet-7-improvement.ts
      index.ts
    nist-80053/         # NIST 800-53 evaluators (grouped by family)
      ac-access-control.ts
      ia-identification.ts
      sc-system-comms.ts
      au-audit.ts
      cm-configuration.ts
      si-system-integrity.ts
      index.ts
    nist-csf/           # NIST CSF 2.0 evaluators (grouped by function)
      govern.ts
      identify.ts
      protect.ts
      detect.ts
      respond.ts
      recover.ts
      index.ts
  registry/
    entra-id-controls.ts    # Existing 29 controls
    nist-zta-controls.ts    # ~35 ZTA controls
    nist-80053-controls.ts  # ~20-25 800-53 controls
    nist-csf-controls.ts    # ~15-20 CSF controls
    control-registry.ts     # Aggregates ALL_CONTROLS
  pipeline/
    audit-runner.ts         # Extended to run getAllControls()
    maturity-calculator.ts  # NEW: severity-weighted maturity scoring
  types.ts                  # Extended ControlDefinition

packages/db/src/tenant/
  schema.ts                 # Extended auditFindings + new maturityScores table

apps/web/src/components/audit/
  FrameworkSelector.tsx     # REPLACED: radio -> multi-select checkboxes
  FrameworkFilter.tsx       # NEW: multi-select framework filter
  ScoreOverview.tsx         # EXTENDED: 4 score cards instead of 1
  ScoreCard.tsx             # NEW: reusable score card component
  ZtaMaturityRadar.tsx      # NEW: radar chart for 7 tenets
  FrameworkBreakdown.tsx    # NEW: per-family/per-function score tables
  FindingBadges.tsx         # NEW: cross-framework badges on findings
  AuditResults.tsx          # EXTENDED: inline framework badges
```

### Pattern 1: Independent Evaluator per Framework

**What:** Each NIST framework (800-207, 800-53, CSF 2.0) has its own evaluator functions with its own pass/fail logic, NOT derived from CISA evaluators.

**When to use:** For every evaluator in this phase.

**Why:** User locked this decision. Prevents coupling between frameworks -- a CISA pass does not automatically mean a ZTA pass because the criteria and thresholds differ.

**Example:**
```typescript
// packages/audit/src/evaluators/nist-zta/tenet-1-resources.ts
// Source: Ported from NistEvaluatorRegistry.ps1 lines 14-66
import type { EvaluatorFn } from '../../types.js';

export const evaluateZTA_T1_DeviceInventory: EvaluatorFn = (facts) => {
  if (!facts.devices.available) {
    return {
      rating: 'fail',
      message: 'Could not retrieve device inventory.',
      action: 'Verify Intune permissions (DeviceManagementManagedDevices.Read.All).',
      settingName: 'Device Inventory',
      currentValue: 'Unknown',
      expectedValue: 'Managed devices in Intune inventory',
      requiredPermission: 'DeviceManagementManagedDevices.Read.All',
    };
  }
  if (facts.devices.totalDevices > 0) {
    return {
      rating: 'pass',
      message: `${facts.devices.totalDevices} managed devices in Intune inventory.`,
      settingName: 'Device Inventory',
      currentValue: `${facts.devices.totalDevices} devices`,
      expectedValue: 'At least 1 managed device',
    };
  }
  return {
    rating: 'fail',
    message: 'No managed devices found in Intune.',
    action: 'Enroll devices in Intune to establish a device inventory.',
    settingName: 'Device Inventory',
    currentValue: '0 devices',
    expectedValue: 'At least 1 managed device',
  };
};
```

### Pattern 2: Extended ControlDefinition with Cross-Reference Fields

**What:** Add `nistCsf` and `nist800207Tenet` to ControlDefinition. All cross-framework metadata lives on the control, not in separate mapping tables.

**When to use:** Every control definition across all framework registries.

**Example:**
```typescript
// packages/audit/src/types.ts -- Extended ControlDefinition
export interface ControlDefinition {
  id: string;
  product: string;                    // 'AAD' | 'ZTA' | '80053' | 'CSF'
  description: string;
  requirementLevel: RequirementLevel;
  severity: Severity;
  nist80053: string;                  // Existing: '800-53 control ref (e.g., AC-7)'
  nistCsf: string;                    // NEW: CSF function ref (e.g., 'PR.AC')
  nist800207Tenet: string;            // NEW: ZTA tenet (e.g., 'T1', 'T4')
  evaluator: EvaluatorFn;
  requiredPermissions: string[];
}
```

### Pattern 3: Maturity Score Calculation with Severity Weights

**What:** Severity-weighted pass rate per ZTA tenet. Critical findings count 4x, High 3x, Medium 2x, Low 1x.

**When to use:** Maturity level computation after evaluator run.

**Example:**
```typescript
// packages/audit/src/pipeline/maturity-calculator.ts

const SEVERITY_WEIGHTS: Record<string, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

const DEFAULT_THRESHOLDS = {
  traditional: 0,     // 0-39%
  initial: 40,        // 40-69%
  advanced: 70,       // 70-89%
  optimal: 90,        // 90-100%
};

export type MaturityLevel = 'Traditional' | 'Initial' | 'Advanced' | 'Optimal';

export interface TenetMaturity {
  tenet: string;
  tenetName: string;
  passRate: number;           // 0-100 percentage
  weightedPassRate: number;   // 0-100 severity-weighted percentage
  maturityLevel: MaturityLevel;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
}

export interface MaturitySnapshot {
  tenets: TenetMaturity[];
  overallWeightedAverage: number;
  overallMaturityLevel: MaturityLevel;
  weakestTenet: TenetMaturity;
}

export function calculateMaturityLevel(
  weightedPassRate: number,
  thresholds = DEFAULT_THRESHOLDS,
): MaturityLevel {
  if (weightedPassRate >= thresholds.optimal) return 'Optimal';
  if (weightedPassRate >= thresholds.advanced) return 'Advanced';
  if (weightedPassRate >= thresholds.initial) return 'Initial';
  return 'Traditional';
}
```

### Pattern 4: Unified Pipeline Running All Controls

**What:** The audit runner iterates over `getAllControls()` instead of just `ENTRA_ID_CONTROLS`.

**When to use:** In the audit pipeline modification.

**Example:**
```typescript
// packages/audit/src/pipeline/audit-runner.ts -- key change
import { getAllControls } from '../registry/control-registry.js';

// ... in runAuditPipeline:
const allControls = getAllControls();
await emitter.emit(0, allControls.length, 'Collecting tenant configuration...', 'running');

for (let i = 0; i < allControls.length; i++) {
  const control = allControls[i];
  // ... same evaluation loop, now with nistCsf and nist800207Tenet in finding insert
}
```

### Anti-Patterns to Avoid
- **Deriving framework scores from CISA mappings:** Each framework has independent evaluators. A CISA pass does NOT imply a ZTA pass. The user explicitly locked this decision.
- **Separate mapping tables:** Cross-reference metadata is denormalized onto `ControlDefinition` and `auditFindings`. No JOIN tables.
- **On-the-fly maturity computation:** Maturity scores must be persisted as snapshots per audit run for Phase 6 historical trending.
- **Framework-specific Graph API calls:** All evaluators MUST use the existing 15-area AuditFacts. No new `collectFacts` areas.
- **Hardcoded maturity thresholds:** Thresholds must be configurable per org (defaults are Traditional < 40, Initial 40-69, Advanced 70-89, Optimal 90+).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Radar chart | Custom SVG polygon rendering | recharts `RadarChart` + `Radar` components | Multiple layer support, responsive container, tooltips, legends -- all built in |
| Severity weighting | Ad-hoc weight logic scattered across evaluators | Centralized `maturity-calculator.ts` with `SEVERITY_WEIGHTS` constant | Single source of truth for weight formula, easy to adjust |
| Framework score computation | Inline score math in API routes | Dedicated score computation functions in `@omzig/audit` | Testable, reusable between API and pipeline |
| Cross-reference rendering | Manual string parsing in frontend | Structured fields (`nistCsf`, `nist800207Tenet`, `nist80053`) on finding objects | Type-safe, filterable, no regex needed |

**Key insight:** The evaluator pattern is already well-established (29 working examples). The new evaluators are a direct port/adaptation, not new architecture. The real complexity is in: (1) getting the cross-reference metadata right on every control, (2) the maturity scoring math, and (3) the combined dashboard layout.

## Common Pitfalls

### Pitfall 1: Pipeline Total Count Breaks Progress Bar
**What goes wrong:** Adding ~70+ new evaluators to the pipeline without updating the progress total causes the SignalR progress bar to show incorrect percentages or overflow.
**Why it happens:** The audit trigger route currently hardcodes `totalChecks: 29` and the pipeline uses `ENTRA_ID_CONTROLS.length` for progress.
**How to avoid:** Use `getAllControls().length` dynamically for both the initial `totalChecks` insert and progress emission. Update the trigger route to compute the count from the registry.
**Warning signs:** Progress shows "35/29" or the bar fills past 100%.

### Pitfall 2: ControlDefinition Field Optionality
**What goes wrong:** Existing CISA controls don't have `nistCsf` or `nist800207Tenet` values, causing TypeScript errors or null crashes.
**Why it happens:** The original `ControlDefinition` interface only had `nist80053: string`.
**How to avoid:** Make `nistCsf` and `nist800207Tenet` optional strings (`string | undefined`) on `ControlDefinition`. Existing CISA controls populate these where applicable, leave undefined where not. The DB columns should also be nullable.
**Warning signs:** TypeScript compile errors when importing existing ENTRA_ID_CONTROLS after type change.

### Pitfall 3: DB Migration Column Addition
**What goes wrong:** Adding columns to `auditFindings` requires a Drizzle migration. If done incorrectly, existing data is lost or the migration fails on production.
**Why it happens:** Drizzle mssql-core migrations for Azure SQL require careful ordering -- add nullable columns, never rename existing columns.
**How to avoid:** Add new columns as nullable varchar. Never change existing column types. Generate migration with `drizzle-kit generate` and review SQL before running.
**Warning signs:** Migration errors mentioning "column does not exist" or "cannot alter column."

### Pitfall 4: Maturity Score Not Persisted
**What goes wrong:** Computing maturity on-the-fly in the API means Phase 6 trending cannot show historical maturity.
**Why it happens:** Temptation to compute scores client-side from findings.
**How to avoid:** Create a `maturityScores` table (or add to `auditRuns`) and persist the maturity snapshot at the end of each pipeline run. The snapshot includes per-tenet weighted pass rate and maturity level.
**Warning signs:** No maturity data available for past audit runs after code changes.

### Pitfall 5: PowerShell Port Misses Break-Glass Facts
**What goes wrong:** The PowerShell ZTA checks reference `$Facts.breakGlass` (tenet 6.3) but the TypeScript `AuditFacts` does not have a `breakGlass` property.
**Why it happens:** NistEvaluatorRegistry.ps1 was written against a different fact collector that collects break-glass group info.
**How to avoid:** For the initial port, make the break-glass check return `warn` (advisory) since the data is not available. OR: if this is a critical check, add a `breakGlass` area to AuditFacts in a future phase. The decision to not add new Graph API calls means this check should be advisory.
**Warning signs:** TypeScript error on `facts.breakGlass` during port.

### Pitfall 6: Frontend Type Divergence
**What goes wrong:** The frontend `AuditFinding` type in `apps/web/src/lib/types.ts` falls out of sync with the backend after adding new DB columns.
**Why it happens:** Frontend types are manually defined, not generated from schema.
**How to avoid:** Update the frontend `AuditFinding` type to include `nistCsf`, `nist800207Tenet` fields matching the DB schema extension. Keep both in sync.
**Warning signs:** Missing framework badges because the field is undefined in the frontend type.

## Code Examples

### Verified Pattern: Existing Evaluator (Source to Port From)
```typescript
// Source: packages/audit/src/evaluators/entra-id/aad-1-legacy-auth.ts
// Pattern: Pure function, no side effects, returns EvaluatorResult
export const evaluateAAD_1_1: EvaluatorFn = (facts) => {
  if (!facts.conditionalAccess.available) {
    return {
      rating: 'fail',
      message: 'Could not retrieve CA policies.',
      settingName: 'Conditional Access - Legacy Auth Block',
      currentValue: 'Unknown',
      expectedValue: 'CA policy blocking legacy auth',
      requiredPermission: 'Policy.Read.All',
    };
  }
  // ... evaluation logic
};
```

### Verified Pattern: Control Registry Extension
```typescript
// Source: packages/audit/src/registry/control-registry.ts
// Pattern: Spread operator to add new framework controls
import { ENTRA_ID_CONTROLS } from './entra-id-controls.js';
import { NIST_ZTA_CONTROLS } from './nist-zta-controls.js';
import { NIST_80053_CONTROLS } from './nist-80053-controls.js';
import { NIST_CSF_CONTROLS } from './nist-csf-controls.js';

const ALL_CONTROLS: ControlDefinition[] = [
  ...ENTRA_ID_CONTROLS,
  ...NIST_ZTA_CONTROLS,
  ...NIST_80053_CONTROLS,
  ...NIST_CSF_CONTROLS,
];
```

### Verified Pattern: DB Schema Extension
```typescript
// Source: packages/db/src/tenant/schema.ts
// Pattern: Add nullable columns for new cross-reference fields
export const auditFindings = mssqlTable('audit_findings', {
  // ... existing columns ...
  nist80053: varchar('nist_800_53', { length: 50 }),       // Existing
  nistCsf: varchar('nist_csf', { length: 50 }),            // NEW
  nist800207Tenet: varchar('nist_800_207_tenet', { length: 10 }), // NEW
});
```

### Verified Pattern: Recharts RadarChart with Dual Layers
```typescript
// Source: recharts.org API docs + shadcn radar-multiple pattern
import {
  RadarChart, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Radar, Legend, ResponsiveContainer,
} from 'recharts';

interface TenetScore {
  tenet: string;
  current: number;   // 0-100
  previous: number;  // 0-100
}

function ZtaMaturityRadar({ data }: { data: TenetScore[] }) {
  return (
    <ResponsiveContainer width="100%" height={400}>
      <RadarChart data={data}>
        <PolarGrid />
        <PolarAngleAxis dataKey="tenet" />
        <PolarRadiusAxis angle={30} domain={[0, 100]} />
        <Radar
          name="Current"
          dataKey="current"
          stroke="#3b82f6"
          fill="#3b82f6"
          fillOpacity={0.3}
        />
        <Radar
          name="Previous"
          dataKey="previous"
          stroke="#9ca3af"
          fill="none"
          strokeDasharray="5 5"
        />
        <Legend />
      </RadarChart>
    </ResponsiveContainer>
  );
}
```

### Verified Pattern: Maturity Snapshot Persistence
```typescript
// packages/db/src/tenant/schema.ts -- NEW table
export const maturityScores = mssqlTable('maturity_scores', {
  id: varchar('id', { length: 36 }).primaryKey().notNull(),
  auditRunId: varchar('audit_run_id', { length: 36 }).notNull(),
  tenet: varchar('tenet', { length: 10 }).notNull(),      // 'T1'..'T7' or 'overall'
  tenetName: nvarchar('tenet_name', { length: 100 }).notNull(),
  totalChecks: int('total_checks').notNull().default(0),
  passedChecks: int('passed_checks').notNull().default(0),
  failedChecks: int('failed_checks').notNull().default(0),
  passRate: int('pass_rate').notNull().default(0),          // 0-100
  weightedPassRate: int('weighted_pass_rate').notNull().default(0), // 0-100
  maturityLevel: varchar('maturity_level', { length: 15 }).notNull(),
  createdAt: datetime2('created_at').notNull().default(sql`GETDATE()`),
});
```

### Test Pattern: Evaluator Tests (Established)
```typescript
// Source: packages/audit/src/__tests__/evaluators.test.ts
// Pattern: createPassingFacts / createFailingFacts fixtures, assertResult helper
describe('ZTA Tenet 1: Resource Awareness', () => {
  it('T1.1 pass with managed devices', () => {
    const facts = createPassingFacts();
    const r = evaluateZTA_T1_DeviceInventory(facts);
    assertResult(r);
    expect(r.rating).toBe('pass');
  });
  it('T1.1 fail with no devices', () => {
    const facts = createPassingFacts();
    facts.devices.totalDevices = 0;
    const r = evaluateZTA_T1_DeviceInventory(facts);
    expect(r.rating).toBe('fail');
  });
});
```

## NIST Framework Reference Data

### NIST 800-207 Zero Trust Architecture -- 7 Tenets

| Tenet | ID | Name | Description |
|-------|----|------|-------------|
| 1 | T1 | All Resources | All data sources and computing services are considered resources |
| 2 | T2 | Secure Communication | All communication is secured regardless of network location |
| 3 | T3 | Per-Session Access | Access to individual enterprise resources is granted on a per-session basis |
| 4 | T4 | Dynamic Policy | Access to resources is determined by dynamic policy |
| 5 | T5 | Integrity Monitoring | The enterprise monitors and measures the integrity and security posture of all owned and associated assets |
| 6 | T6 | Dynamic Auth/Authz | All resource authentication and authorization are dynamic and strictly enforced before access is allowed |
| 7 | T7 | Continuous Improvement | The enterprise collects as much information as possible about assets, network infrastructure and communications and uses it to improve its security posture |

**Source:** NIST SP 800-207 (August 2020), Section 2.1. PowerShell NistEvaluatorRegistry.ps1 maps these tenets exactly.

### PowerShell ZTA Check Inventory (35 checks to port)

| Tenet | Check Count | Checks |
|-------|-------------|--------|
| T1 | 4 | Device Inventory, Application Inventory, Data Classification, Domain Inventory |
| T2 | 4 | Legacy Auth Blocked, Security Baseline Strategy, Network Trust Posture, Modern Auth Enforcement |
| T3 | 2 | Per-Session Evaluation, Session Controls |
| T4 | 6 | Risk-Based Access, Device Compliance Required, Location-Based Restrictions, Application-Specific Policies, MFA Coverage, Admin Access Controls |
| T5 | 4 | Audit Logging, Endpoint Detection, Email Threat Protection, Telemetry Coverage |
| T6 | 7 | MFA Registration, Privileged Role Control, Emergency Access, Auth Methods Modernized, Weak Auth Methods Disabled, PIM Configured, Admin Consent Workflow |
| T7 | 4 | Identity Protection Licensing, Guest Access Governance, App Registration Governance, Password Policy Modernized |
| **Total** | **31** | *(NistEvaluatorRegistry.ps1 has 31 check functions -- the +4 for the 800-53 cross-reference function make 35 total, but only 31 are ZTA evaluator checks)* |

**Note:** The PowerShell file also includes `Get-Nist80053CrossReference` function (lines 605-705) which is a derived mapping, NOT an independent evaluator. Per the user's decision, 800-53 evaluators must be independent. This function serves as a reference for which 800-53 families are relevant but should not be ported as-is.

### NIST 800-53 Rev 5 -- 20 Control Families

| Code | Family Name | M365 Relevance | Evaluator Priority |
|------|------------|-----------------|-------------------|
| AC | Access Control | HIGH -- CA policies, RBAC, guest access | Must have |
| IA | Identification and Authentication | HIGH -- MFA, auth methods, identity protection | Must have |
| SC | System and Communications Protection | HIGH -- encryption, TLS, secure channels | Must have |
| AU | Audit and Accountability | HIGH -- logging, audit trails | Must have |
| CM | Configuration Management | HIGH -- baseline configs, change tracking | Must have |
| SI | System and Information Integrity | MEDIUM -- defender, anti-malware, patching | Should have |
| AT | Awareness and Training | LOW -- not auditable via Graph | Advisory only |
| CA | Assessment, Authorization, and Monitoring | MEDIUM -- continuous monitoring | Should have |
| CP | Contingency Planning | LOW -- break-glass, backup | Advisory only |
| IR | Incident Response | LOW -- not auditable via Graph | Advisory only |
| MA | Maintenance | LOW -- not auditable via Graph | Advisory only |
| MP | Media Protection | LOW -- DLP, sensitivity labels | Should have |
| PE | Physical and Environmental Protection | NONE -- Azure datacenter | Skip |
| PL | Planning | LOW -- not auditable via Graph | Advisory only |
| PM | Program Management | LOW -- not auditable via Graph | Advisory only |
| PS | Personnel Security | NONE -- HR processes | Skip |
| PT | PII Processing and Transparency | LOW -- limited Graph coverage | Advisory only |
| RA | Risk Assessment | MEDIUM -- risk policies, identity protection | Should have |
| SA | System and Services Acquisition | LOW -- app governance | Advisory only |
| SR | Supply Chain Risk Management | LOW -- not auditable via Graph | Advisory only |

**Recommended 800-53 evaluator count:** ~20-25 independent evaluators covering the HIGH and MEDIUM families.

### NIST CSF 2.0 -- 6 Functions, 22 Categories

| Function | Code | Categories (by code) | M365 Relevance |
|----------|------|---------------------|-----------------|
| Govern | GV | OC, RM, RR, PO, OV, SC | LOW -- organizational processes, not auditable via Graph |
| Identify | ID | AM, RA, IM | MEDIUM -- asset management, risk assessment |
| Protect | PR | AA, AT, DS, PS, IR | HIGH -- access control, data security, platform security |
| Detect | DE | CM, AE | HIGH -- continuous monitoring, anomaly detection |
| Respond | RS | MA, AN, CO, MI | MEDIUM -- incident analysis, mitigation |
| Recover | RC | RP, CO | LOW -- recovery planning, not auditable via Graph |

**Recommended CSF evaluator count:** ~15-20 independent evaluators covering Protect, Detect, and partially Identify and Respond.

### Recommended Product Codes

| Framework | Product Code | Rationale |
|-----------|-------------|-----------|
| CISA SCuBA Entra ID | `AAD` | Already established in codebase |
| NIST 800-207 ZTA | `ZTA` | Clear, short, unambiguous |
| NIST 800-53 | `80053` | Consistent with existing `nist80053` field naming |
| NIST CSF 2.0 | `CSF` | Clear abbreviation matching CSF function codes |

### Recommended Severity Weight Formula

| Severity | Weight | Rationale |
|----------|--------|-----------|
| Critical | 4 | 4x multiplier -- a single Critical failure significantly impacts maturity |
| High | 3 | 3x multiplier |
| Medium | 2 | 2x multiplier |
| Low | 1 | Baseline weight |

**Formula:** `weightedPassRate = sum(passingWeight) / sum(totalWeight) * 100`

Where each check's weight is `SEVERITY_WEIGHTS[check.severity]`. A pass contributes its weight to `passingWeight`. Every check contributes its weight to `totalWeight`.

**Example:** Tenet 4 has 6 checks (2 Critical, 2 High, 1 Medium, 1 Low). If all pass: `(4+4+3+3+2+1)/(4+4+3+3+2+1) = 100%`. If 1 Critical fails: `(4+3+3+2+1)/(4+4+3+3+2+1) = 13/17 = 76%` = Advanced. The Critical failure drops from Optimal to Advanced, which is the correct sensitivity.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| NIST CSF 1.1 (5 functions, 23 categories) | NIST CSF 2.0 (6 functions, 22 categories) | February 2024 | Govern function added; category codes changed; use CSF 2.0 category IDs |
| CISA ZT Maturity Model v1 | CISA ZT Maturity Model v2 | April 2023 | Updated maturity levels; our maturity model aligns with CISA v2 terminology |
| NIST 800-53 Rev 4 (18 families) | NIST 800-53 Rev 5 (20 families) | September 2020 | PT and SR families added; use Rev 5 control IDs |
| FrameworkSelector radio buttons | Multi-select framework filter checkboxes | This phase | User decided; always show all 4 score cards |

**Deprecated/outdated:**
- NIST CSF 1.1 category IDs (e.g., `PR.AC`, `ID.AM` from v1.1 differ from v2.0 codes) -- use CSF 2.0 codes exclusively
- CISA Zero Trust Maturity Model v1 -- superseded by v2.0 (April 2023)

## Open Questions

1. **Break-glass group fact area availability**
   - What we know: PowerShell ZTA check T6.3 references `$Facts.breakGlass` but TypeScript `AuditFacts` has no break-glass property
   - What's unclear: Whether this data can be inferred from existing facts (e.g., checking for a group named "Break-Glass-Admins" in a general groups query)
   - Recommendation: Make T6.3 an advisory (`warn`) check for this phase. If break-glass detection is critical, add it as a fact area in a future phase

2. **Exact CSF 2.0 category codes for evaluator cross-references**
   - What we know: CSF 2.0 has 22 categories across 6 functions; Govern function has GV.OC, GV.RM, GV.RR, GV.PO, GV.OV, GV.SC
   - What's unclear: Exact codes for remaining categories (Identify, Protect, Detect, Respond, Recover) differ from CSF 1.1
   - Recommendation: Use the function-level codes (GV, ID, PR, DE, RS, RC) as the primary `nistCsf` value since those are stable; add category-level granularity (PR.AA, DE.CM) where the mapping is clear

3. **auditRuns totalChecks update vs. dynamic count**
   - What we know: The trigger route hardcodes `totalChecks: 29` on audit run creation
   - What's unclear: Whether to compute count at trigger time or update it in the pipeline
   - Recommendation: Use `getAllControls().length` at trigger time so the count is correct from the start

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^2.0.0 |
| Config file | `packages/audit/vitest.config.ts` |
| Quick run command | `cd packages/audit && pnpm test` |
| Full suite command | `pnpm -r test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FRAME-02 | 31+ ZTA evaluators return correct pass/fail per tenet | unit | `cd packages/audit && pnpm vitest run src/__tests__/zta-evaluators.test.ts -x` | Wave 0 |
| FRAME-03 | 800-53 evaluators return correct pass/fail per control family | unit | `cd packages/audit && pnpm vitest run src/__tests__/nist-80053-evaluators.test.ts -x` | Wave 0 |
| FRAME-04 | CSF evaluators return correct pass/fail per function | unit | `cd packages/audit && pnpm vitest run src/__tests__/csf-evaluators.test.ts -x` | Wave 0 |
| FRAME-05 | Score computation returns correct per-framework scores | unit | `cd packages/audit && pnpm vitest run src/__tests__/score-computation.test.ts -x` | Wave 0 |
| FRAME-06 | Maturity calculator returns correct levels per tenet with severity weighting | unit | `cd packages/audit && pnpm vitest run src/__tests__/maturity-calculator.test.ts -x` | Wave 0 |
| FRAME-07 | ZtaMaturityRadar renders with 7 axes and dual datasets | unit | `cd apps/web && pnpm vitest run src/__tests__/ZtaMaturityRadar.test.tsx -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd packages/audit && pnpm test`
- **Per wave merge:** `pnpm -r test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/audit/src/__tests__/zta-evaluators.test.ts` -- covers FRAME-02 (31+ ZTA evaluator tests)
- [ ] `packages/audit/src/__tests__/nist-80053-evaluators.test.ts` -- covers FRAME-03
- [ ] `packages/audit/src/__tests__/csf-evaluators.test.ts` -- covers FRAME-04
- [ ] `packages/audit/src/__tests__/score-computation.test.ts` -- covers FRAME-05
- [ ] `packages/audit/src/__tests__/maturity-calculator.test.ts` -- covers FRAME-06
- [ ] `apps/web/src/__tests__/ZtaMaturityRadar.test.tsx` -- covers FRAME-07 (requires test setup for recharts)

## Sources

### Primary (HIGH confidence)
- `packages/audit/src/types.ts` -- AuditFacts interface, ControlDefinition, EvaluatorFn signature
- `packages/audit/src/evaluators/entra-id/aad-1-legacy-auth.ts` -- Established evaluator pattern
- `packages/audit/src/registry/entra-id-controls.ts` -- 29 control definitions with nist80053 field
- `packages/audit/src/registry/control-registry.ts` -- ALL_CONTROLS aggregation pattern
- `packages/audit/src/pipeline/audit-runner.ts` -- Pipeline loop, finding persistence, progress emission
- `packages/db/src/tenant/schema.ts` -- auditFindings table schema
- `scripts/audit/NistEvaluatorRegistry.ps1` -- 31 ZTA checks + 800-53 cross-reference function
- `apps/web/src/lib/types.ts` -- Frontend type definitions
- `apps/web/src/components/audit/FrameworkSelector.tsx` -- Component to replace
- `.planning/phases/03-compliance-framework-mapping/03-CONTEXT.md` -- User decisions

### Secondary (MEDIUM confidence)
- [NIST SP 800-207](https://csrc.nist.gov/pubs/sp/800/207/final) -- Zero Trust Architecture specification (August 2020)
- [NIST SP 800-53 Rev 5](https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final) -- Security and Privacy Controls (September 2020, updated)
- [NIST CSF 2.0](https://nvlpubs.nist.gov/nistpubs/CSWP/NIST.CSWP.29.pdf) -- Cybersecurity Framework v2.0 (February 2024)
- [Recharts RadarChart API](https://recharts.org/en-US/api/Radar) -- Radar chart configuration
- [Recharts multiple radar example](https://www.shadcn.io/patterns/chart-radar-multiple) -- Dual dataset overlay pattern

### Tertiary (LOW confidence)
- CSF 2.0 category-level codes beyond GV function -- Govern categories confirmed (GV.OC, GV.RM, GV.RR, GV.PO, GV.OV, GV.SC), remaining function categories need verification against official reference tool

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- recharts well-documented, existing project patterns clear, framework specs are published NIST standards
- Architecture: HIGH -- extending established patterns (evaluator, registry, pipeline); all integration points identified from codebase reading
- Pitfalls: HIGH -- identified from actual code analysis (hardcoded totalChecks, missing breakGlass facts, schema migration requirements)
- NIST framework data: MEDIUM -- tenet names and family codes verified against official publications; CSF 2.0 category codes partially verified

**Research date:** 2026-03-11
**Valid until:** 2026-04-11 (NIST specs are stable, no expected changes)
