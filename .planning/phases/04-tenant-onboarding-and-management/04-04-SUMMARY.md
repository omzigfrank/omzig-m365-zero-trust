---
phase: 04-tenant-onboarding-and-management
plan: 04
subsystem: ui
tags: [react, next.js, wizard, onboarding, oauth, gdap, signalr, vitest, tailwind, useRef]

# Dependency graph
requires:
  - phase: 04-tenant-onboarding-and-management
    provides: Tenant CRUD routes, OAuth callback handler, wizard-state API endpoints
provides:
  - 5-step onboarding wizard at /tenants/new for OAuth consent and GDAP paths
  - useOnboarding hook with setupWizardState table persistence and localStorage cache
  - tenant-api.ts extensions for createTenant, generateConsentUrl, verifyGdap, provisionTenant, wizard-state CRUD
  - 12 wizard tests covering all steps, both connection methods, and DB persistence
affects: [05-01-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns: ["useRef for stale closure avoidance in async callbacks", "Functional state updates via stateRef.current for multi-step wizard", "setupWizardState table persistence on each step advancement with localStorage session cache", "apiClient.patch for PATCH method support"]

key-files:
  created:
    - apps/web/src/app/tenants/new/page.tsx
    - apps/web/src/components/tenants/OnboardingWizard.tsx
    - apps/web/src/components/tenants/WizardStepTenantDetails.tsx
    - apps/web/src/components/tenants/WizardStepConnectionMethod.tsx
    - apps/web/src/components/tenants/WizardStepConnectVerify.tsx
    - apps/web/src/components/tenants/WizardStepProvisioning.tsx
    - apps/web/src/components/tenants/WizardStepComplete.tsx
    - apps/web/src/hooks/useOnboarding.ts
    - apps/web/src/__tests__/OnboardingWizard.test.tsx
  modified:
    - apps/web/src/lib/tenant-api.ts

key-decisions:
  - "useRef(state) pattern for stale closure avoidance -- async callbacks in multi-step wizard need latest state without re-creating callbacks on every render"
  - "setupWizardState table is source of truth, localStorage is session cache for fast hydration before API response"
  - "OAuth callback auto-advance: consent=success URL param triggers immediate step 4 provisioning"
  - "Provisioning auto-advances to step 5 after 1-second delay for visual feedback"

patterns-established:
  - "Multi-step wizard pattern: useOnboarding hook manages state + persistence, OnboardingWizard renders step indicator + current step component"
  - "Step indicator with numbered circles (blue active, green completed, gray future) connected by lines"
  - "Wizard step components accept callbacks from parent, no direct API calls in step components"
  - "tenant-api.ts as consolidated API client for all tenant-related endpoints"

requirements-completed: [TENANT-01, TENANT-02, TENANT-08]

# Metrics
duration: 15min
completed: 2026-03-12
---

# Phase 4 Plan 4: 5-Step Tenant Onboarding Wizard Summary

**5-step onboarding wizard at /tenants/new with OAuth consent URL generation, GDAP relationship verification, auto-provisioning progress, and setupWizardState DB persistence**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-12T01:51:20Z
- **Completed:** 2026-03-12T02:06:58Z
- **Tasks:** 1
- **Files modified:** 10

## Accomplishments
- Built complete 5-step onboarding wizard at /tenants/new with step indicator, back navigation, and conditional rendering
- Implemented both OAuth consent (shareable URL with copy button) and GDAP (relationship ID verification with customer details display) connection paths
- Built useOnboarding hook with setupWizardState table persistence on each step advancement and localStorage session cache for fast hydration
- Created 12 tests covering all wizard steps, both connection methods, state persistence, wizard resume, and OAuth callback auto-advance

## Task Commits

Each task was committed atomically:

1. **Task 1: Build onboarding wizard container, all 5 step components, and state management hook** - `2b4d559` (feat)

## Files Created/Modified
- `apps/web/src/app/tenants/new/page.tsx` - Wizard host page at /tenants/new route with AuthGuard
- `apps/web/src/components/tenants/OnboardingWizard.tsx` - 5-step wizard container with step indicator and navigation
- `apps/web/src/components/tenants/WizardStepTenantDetails.tsx` - Step 1: form with displayName, primaryDomain, contactEmail validation
- `apps/web/src/components/tenants/WizardStepConnectionMethod.tsx` - Step 2: OAuth Consent and GDAP/Lighthouse selection cards
- `apps/web/src/components/tenants/WizardStepConnectVerify.tsx` - Step 3: consent URL generation (OAuth) or GDAP relationship verification
- `apps/web/src/components/tenants/WizardStepProvisioning.tsx` - Step 4: auto-provisioning progress checklist with animated status
- `apps/web/src/components/tenants/WizardStepComplete.tsx` - Step 5: success summary with dashboard link and "Connect Another" button
- `apps/web/src/hooks/useOnboarding.ts` - Wizard state management with setupWizardState table persistence and localStorage cache
- `apps/web/src/lib/tenant-api.ts` - Extended with 7 new API client functions for onboarding and wizard-state endpoints
- `apps/web/src/__tests__/OnboardingWizard.test.tsx` - 12 tests covering all wizard functionality

## Decisions Made
- Used `useRef(state)` pattern to avoid stale closures in async callbacks -- the multi-step wizard has callbacks that need the latest state without triggering re-creation on every render cycle
- setupWizardState table (via PATCH /api/wizard-state) is the persistent source of truth; localStorage serves only as a session cache for instant hydration before the API response arrives
- OAuth callback return (consent=success query param) auto-advances wizard to provisioning step 4, restoring state from the setupWizardState table
- Provisioning step auto-advances to completion step 5 after a 1-second delay to give users visual confirmation of progress

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed stale closure in selectConnectionMethod and other async callbacks**
- **Found during:** Task 1 (test verification)
- **Issue:** `selectConnectionMethod` and other callbacks captured `state` from the closure, which was stale by the time they executed after React batched state updates from previous steps
- **Fix:** Introduced `stateRef = useRef(state)` pattern at the top of the hook, and all async callbacks read from `stateRef.current` instead of the closure-captured `state`
- **Files modified:** apps/web/src/hooks/useOnboarding.ts
- **Verification:** All 12 tests pass including multi-step navigation tests
- **Committed in:** 2b4d559

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential correctness fix for React state management in async wizard flows. No scope creep.

## Issues Encountered
- `getByText(/GDAP/i)` in tests matched multiple elements (card title + description text). Resolved by using `getByTestId("connection-method-gdap")` for more precise element selection.
- Pre-existing 4 audit-routes test failures in apps/api confirmed unrelated to this plan's scope.
- Pre-existing TS error in TenantDetail.test.tsx confirmed unrelated to this plan's changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Full onboarding wizard ready for MSPs to connect client tenants via OAuth or GDAP
- Phase 4 complete: all tenant management capabilities (CRUD, dashboard, detail, wizard) in place
- Phase 5 (Dashboard and Findings UX) can proceed with interactive drill-down and filtering

## Self-Check: PASSED

All 10 created/modified files verified present. Task commit (2b4d559) verified in git log.

---
*Phase: 04-tenant-onboarding-and-management*
*Completed: 2026-03-12*
