# Phase 3: Compliance Framework Mapping - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Add NIST 800-207 (Zero Trust Architecture), NIST 800-53 (Security Controls), and NIST CSF 2.0 (Cybersecurity Framework) compliance evaluation to the existing audit engine. Includes independent evaluators for all three frameworks, maturity scoring per NIST 800-207 tenet, per-framework compliance scores, and a combined compliance dashboard with radar chart, per-family/per-function breakdowns, and cross-framework linking. No tenant onboarding (Phase 4), no dashboard drill-down UX beyond framework scores (Phase 5), no scheduled scans or trending (Phase 6).

</domain>

<decisions>
## Implementation Decisions

### NIST 800-207 Evaluator Approach
- Port + enhance: port the 35 PowerShell ZTA checks (NistEvaluatorRegistry.ps1) 1:1 as baseline, then add new checks where the researcher identifies gaps vs the official NIST 800-207 spec
- ZTA evaluators run as part of the same audit pipeline — one audit run = CISA + ZTA + 800-53 + CSF checks, single progress stream, one set of findings
- ZTA findings stored in the same `auditFindings` table with `product='ZTA'`
- Evaluators use the same existing AuditFacts (15 data areas) — no new Graph API calls needed

### NIST 800-53 Evaluators
- Independent evaluators — NOT derived from CISA/ZTA mappings. Own evaluator functions with their own pass/fail logic
- Each evaluator maps to an 800-53 control family (AC, IA, SC, AU, etc.)
- Stored in `auditFindings` with `product='80053'` (or similar)
- Uses the same AuditFacts snapshot as CISA and ZTA evaluators

### NIST CSF 2.0 Evaluators
- Independent evaluators — consistent with the 800-53 decision
- Each evaluator maps to a CSF 2.0 function (Govern/Identify/Protect/Detect/Respond/Recover)
- Stored in `auditFindings` with `product='CSF'` (or similar)
- Uses the same AuditFacts snapshot

### Cross-Reference Metadata
- Extend `ControlDefinition` with `nistCsf` and `nist800207Tenet` fields alongside existing `nist80053`
- Each finding carries its full cross-reference chain — denormalized, consistent with Phase 2 design
- All framework mappings live on the control definition, not in separate mapping tables

### Maturity Level Calculation
- Severity-weighted pass rate per NIST 800-207 tenet. Critical findings weigh heavier than Low
- Maturity thresholds: Traditional (<40%), Initial (40-69%), Advanced (70-89%), Optimal (90%+)
- Thresholds are configurable per org (not hardcoded)
- Overall tenant maturity shows BOTH weighted average AND weakest tenet: "Overall: Advanced (weakest: Tenet 3 at Initial)"
- Maturity scores stored as a snapshot with each audit run (not computed on-the-fly) — enables historical trending in Phase 6

### Multi-Framework Score Presentation
- Combined dashboard layout: score cards at top (all 4 frameworks), ZTA maturity radar chart, then unified findings list with filters
- Radar chart shows current audit as solid fill + previous audit as dotted outline for comparison
- FrameworkSelector replaced with multi-select filter checkboxes — users toggle which frameworks appear in findings list, score cards always visible
- NIST 800-53 shows per-control-family breakdown (AC: 85%, IA: 90%, SC: 70%, etc.)
- NIST CSF 2.0 shows per-function scores (Identify, Protect, Detect, etc.)
- Findings list supports inline cross-framework linking: each finding shows badges/tags for mapped frameworks (e.g., "800-53: AC-7 | CSF: Protect | ZTA: Tenet 2")

### Claude's Discretion
- Exact evaluator file organization within framework directories
- Product code naming convention for new frameworks (ZTA, 80053, CSF, etc.)
- Radar chart library selection
- Maturity score weight formula (how much heavier Critical vs Low)
- Cross-reference badge styling and interaction
- auditFindings schema changes needed for new framework columns
- Test structure and mocking approach for new evaluators

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- **PowerShell NistEvaluatorRegistry** (`scripts/audit/NistEvaluatorRegistry.ps1`): 35 ZTA checks organized by 7 tenets. Direct port source — same AuditFacts, same evaluation logic pattern as CISA evaluators
- **CISA evaluator pattern** (`packages/audit/src/evaluators/entra-id/`): 29 pure evaluator functions. ZTA/800-53/CSF evaluators follow the exact same `EvaluatorFn = (facts: AuditFacts) => EvaluatorResult` pattern
- **Control registry** (`packages/audit/src/registry/control-registry.ts`): `ALL_CONTROLS` array with extensible `...ENTRA_ID_CONTROLS` pattern. Add `...ZTA_CONTROLS`, `...NIST_80053_CONTROLS`, `...CSF_CONTROLS`
- **ControlDefinition type** (`packages/audit/src/types.ts`): Already has `nist80053: string` field. Extend with `nistCsf` and `nist800207Tenet`
- **Audit runner pipeline** (`packages/audit/src/pipeline/audit-runner.ts`): Currently runs `ENTRA_ID_CONTROLS` — extend to include all registered controls
- **FrameworkSelector component** (`apps/web/src/components/audit/FrameworkSelector.tsx`): CISA/NIST/Both radio selector — replace with multi-select filter
- **Frontend types** (`apps/web/src/lib/types.ts`): `AuditFramework`, `FrameworkReport`, `AuditFinding` types — extend with new frameworks
- **auditFindings table** (`packages/db/src/tenant/schema.ts`): Denormalized findings table with `product`, `nist_800_53` columns — extend with CSF and ZTA tenet columns

### Established Patterns
- Pure evaluator functions: no side effects, no Graph calls — only `(facts: AuditFacts) => EvaluatorResult`
- Product-aware directory structure: `evaluators/entra-id/` — extend with `evaluators/nist-zta/`, `evaluators/nist-80053/`, `evaluators/nist-csf/`
- Static TypeScript control registry: control definitions versioned with code
- Denormalized finding storage: each finding row carries its own metadata for historical accuracy
- Vitest unit tests with fixture-based AuditFacts

### Integration Points
- Audit runner (`audit-runner.ts`): extend control list to include all framework evaluators
- Progress emitter: update total check count to include new framework evaluators
- auditFindings schema: add columns for CSF function, ZTA tenet cross-refs
- Audit run summary: add per-framework score counts and maturity snapshot
- Frontend audit results page: replace simple results view with combined dashboard
- API audit detail endpoint: return findings with framework cross-references

</code_context>

<specifics>
## Specific Ideas

- Independent evaluators for ALL three NIST frameworks — not just mappings of CISA results. Each framework has its own evaluation logic, even though they all use the same AuditFacts
- "Show both" maturity approach: overall weighted average AND weakest tenet highlighted. MSPs need the nuanced view for client conversations
- Radar chart with previous audit overlay — immediate visual comparison without waiting for Phase 6 trending
- Per-family (800-53) and per-function (CSF 2.0) breakdowns — not just aggregate scores. These are the units that compliance audiences think in
- Inline cross-framework badges on findings — "800-53: AC-7 | CSF: Protect | ZTA: Tenet 2" makes cross-mapping tangible for compliance documentation

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-compliance-framework-mapping*
*Context gathered: 2026-03-11*
