# Phase 5: Dashboard and Findings UX - Research

**Researched:** 2026-03-12
**Domain:** React frontend components (drill-down navigation, filtering, remediation display, action queue) + backend API endpoints + DB schema changes
**Confidence:** HIGH

## Summary

Phase 5 transforms the existing flat audit findings table into an interactive MSP-grade dashboard with grouped accordion navigation, a slide-over drawer for finding details, an enhanced multi-dimensional filter bar, structured remediation guidance for all 101 controls, and a cross-tenant action queue. The scope is entirely UI/UX plus supporting API endpoints and a small DB schema addition (action queue dismissals table).

The existing codebase provides a strong foundation: AuditResults already has filtering and search, FrameworkBreakdown has grouping logic, and the control registry has the full 101-control catalog with IDs, severities, and cross-framework mappings. The key work is: (1) new UI primitive components (Drawer, MultiSelectDropdown), (2) transforming AuditResults into grouped/flat toggle with drawer integration, (3) creating the remediation registry as a sibling to the control registry, and (4) building the action queue section on the tenant dashboard with supporting API endpoints.

**Primary recommendation:** Build the five new UI components first (Drawer, MultiSelectDropdown, FindingDetail, GroupedFindingsView, ActionQueue), then wire the filter bar enhancement, then create the remediation registry, then add the action queue API and DB table. Keep all state management in React hooks (no new state libraries) -- the project uses this pattern consistently.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Finding Detail & Drill-Down (DASH-01)**: Hybrid navigation -- grouped accordion for categories (stays on page) + slide-over drawer (400px right) for finding detail. Grouped accordion with category-level rows showing pass/fail summary counts. View toggle for grouped/flat with flat as legacy behavior.
- **Remediation Guidance Content (DASH-05, DASH-06, DASH-07)**: Static remediation registry at `packages/audit/src/remediation-registry.ts`. Separate from evaluators -- drawer looks up by controlId at render time. All 101 controls get entries. PowerShell with CSS-class syntax highlighting (no Prism/highlight.js). Admin portal deep links.
- **Filter & Search Enhancement (DASH-02)**: Horizontal filter bar above findings. Multi-select dropdowns for Framework, Severity, Status, Workload. Active filter badges with counts. Workload filter has "Entra ID" as only v1 option.
- **Alert/Action Queue (DASH-10)**: Collapsible panel on `/tenants` page above tenant grid. Two data sources: critical findings from latest audit per tenant, tenant status events (needs_reauth, stale audit >7 days). Top 5 items, "View All" link. Dismiss/acknowledge per-user. New `actionQueueDismissals` table in control-plane DB.

### Claude's Discretion
- Exact Drawer/SlideOver component implementation (portal vs inline, animation approach)
- MultiSelectDropdown component internals (popper/floating-ui vs simple absolute positioning)
- PowerShell syntax highlighting CSS class names and keyword patterns
- Action queue item computation logic (SQL query vs in-memory aggregation)
- actionQueueDismissals table schema design (columns, indexes)
- Grouped accordion expand/collapse animation approach
- Filter state management (URL params vs component state)
- Remediation registry data for all 101 controls (steps, URLs, PowerShell commands)
- Whether to split remediation registry into per-framework files or single file
- GroupedFindingsView component structure and state management
- How the flat/grouped view toggle interacts with the filter bar

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DASH-01 | Interactive drill-down (framework -> category -> finding -> remediation) | Grouped accordion component + slide-over drawer pattern; ARIA accordion spec; existing FrameworkBreakdown groupFindings() helper reusable |
| DASH-02 | Filter findings by severity, framework, workload, and status | MultiSelectDropdown component; existing FrameworkFilter absorbs into unified bar; new severity/workload dimensions added |
| DASH-05 | Each finding displays remediation guidance with step-by-step instructions | Static remediation registry maps controlId -> structured remediation object; CISA SCuBA baseline docs provide canonical remediation steps |
| DASH-06 | Remediation guidance includes links to relevant Microsoft admin portal pages | Entra admin center deep link URLs documented; pattern is `https://entra.microsoft.com/#view/...` for most controls |
| DASH-07 | Remediation guidance includes PowerShell commands where applicable | CSS-class-based syntax highlighting; copy-to-clipboard via navigator.clipboard API; multi-line command display |
| DASH-10 | Alert/action queue shows drift events and critical findings across all tenants | New API endpoint aggregates critical findings + tenant status; actionQueueDismissals table for per-user dismiss state; collapsible panel on /tenants page |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | ^18.3.0 | UI framework | Already used throughout |
| Next.js | ^14.2.0 | Pages, SSR | Already used for routing |
| Tailwind CSS | ^3.4.17 | Styling | All existing components use it |
| clsx | ^2.1.1 | Conditional classnames | Used by Badge, Card |
| lucide-react | ^0.468.0 | Icons | Used throughout (Search, Filter, AlertTriangle, etc.) |
| Vitest + RTL | ^2.0.0 / ^14.3.1 | Testing | Existing test suite pattern |

### Supporting (already in project -- needed for this phase)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Hono | (existing) | API routes | New action queue endpoints |
| Drizzle ORM | (beta, mssql-core) | DB schema | New actionQueueDismissals table |
| zod | (existing) | Request validation | New API endpoint validation |

### No New Dependencies Needed
The decisions explicitly exclude heavy libraries (no Prism/highlight.js, no floating-ui/popper). All UI components use Tailwind CSS + React state + simple absolute positioning. This aligns with the project pattern of zero external UI libraries.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom Drawer | @headlessui/react Dialog | Adds 25KB dependency; project has no headless-ui. Custom is ~80 lines with proper ARIA. |
| Custom MultiSelectDropdown | react-select | Adds heavy dependency; project has no external UI libs. Custom is ~120 lines. |
| CSS keyword coloring | Prism.js/highlight.js | User explicitly ruled out heavy syntax highlighting. CSS classes for 10 keywords is sufficient for PowerShell. |
| Component state for filters | URL search params | URL params are shareable but add complexity. Component state matches existing project pattern (AuditResults, TenantTable). Recommend component state for v1. |

## Architecture Patterns

### Recommended Component Structure
```
apps/web/src/
├── components/
│   ├── ui/
│   │   ├── Badge.tsx            # existing
│   │   ├── Card.tsx             # existing
│   │   ├── ProgressBar.tsx      # existing
│   │   ├── Drawer.tsx           # NEW: slide-over panel
│   │   └── MultiSelectDropdown.tsx  # NEW: reusable multi-select
│   ├── audit/
│   │   ├── AuditResults.tsx     # ENHANCED: grouped/flat toggle, new filter bar
│   │   ├── FrameworkFilter.tsx  # DEPRECATED: absorbed into AuditResults filter bar
│   │   ├── FrameworkBreakdown.tsx  # existing (no changes)
│   │   ├── FindingBadges.tsx    # existing (reused in drawer)
│   │   ├── GroupedFindingsView.tsx  # NEW: accordion grouped view
│   │   ├── FindingDetailDrawer.tsx  # NEW: slide-over with remediation
│   │   ├── FilterBar.tsx        # NEW: unified horizontal filter bar
│   │   ├── PowerShellBlock.tsx  # NEW: syntax-highlighted code block
│   │   └── ExportButtons.tsx    # existing (no changes)
│   └── tenants/
│       └── ActionQueue.tsx      # NEW: cross-tenant action queue panel
├── hooks/
│   └── useActionQueue.ts        # NEW: fetch + dismiss action queue items
├── lib/
│   └── action-queue-api.ts      # NEW: API client for action queue
packages/audit/src/
├── registry/
│   ├── control-registry.ts      # existing
│   ├── entra-id-controls.ts     # existing
│   └── ...                      # existing
├── remediation/
│   ├── index.ts                 # NEW: getRemediationByControlId()
│   ├── types.ts                 # NEW: RemediationEntry type
│   ├── entra-id-remediation.ts  # NEW: 29 CISA SCuBA entries
│   ├── nist-zta-remediation.ts  # NEW: 31 ZTA entries
│   ├── nist-80053-remediation.ts # NEW: 800-53 entries
│   └── nist-csf-remediation.ts  # NEW: CSF entries
packages/db/src/
└── control-plane/
    └── schema.ts                # MODIFIED: add actionQueueDismissals table
apps/api/src/
└── routes/
    └── action-queue.ts          # NEW: GET /api/action-queue, POST dismiss
```

### Pattern 1: Slide-Over Drawer (Portal-Based)
**What:** A right-sliding panel rendered via React portal to escape parent overflow/z-index constraints
**When to use:** Finding detail display -- user clicks row, drawer slides in from right
**Recommendation:** Use `createPortal` to render at document body. This avoids z-index stacking issues from the accordion and table wrapper. Apply `aria-modal="true"`, trap focus inside, and handle Escape key.

```typescript
// Drawer component signature
interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string; // default "400px" per CONTEXT.md
}
```

**Animation approach:** CSS transition with `translate-x-full` -> `translate-x-0` on open, reverse on close. Use Tailwind's `transition-transform duration-300 ease-in-out`. No JS animation libraries needed.

**Accessibility:**
- `role="dialog"` with `aria-modal="true"` and `aria-label`
- Focus trap: auto-focus close button on open, return focus to trigger on close
- Escape key closes drawer
- Background scroll lock via `overflow-hidden` on body
- Backdrop overlay (semi-transparent) with click-to-close

### Pattern 2: Grouped Accordion View
**What:** Two-level hierarchy: framework groups (if multiple selected) -> category groups -> individual findings
**When to use:** Default view in the enhanced AuditResults component

**Implementation approach:**
- Reuse `groupFindings()` helper from FrameworkBreakdown.tsx
- Each group header is a button with `aria-expanded` and `aria-controls`
- Use `<details>` / `<summary>` HTML5 elements for native accordion behavior (screen reader friendly, no JS needed for open/close)
- Add Tailwind transition on the content div for smooth expand/collapse

**ARIA pattern (from WAI-ARIA Accordion spec):**
- Header element: `<button aria-expanded="true|false" aria-controls="panel-id">`
- Panel element: `<div id="panel-id" role="region" aria-labelledby="header-id">`
- Or use native `<details>/<summary>` which provides built-in ARIA semantics

**Group hierarchy logic:**
1. If multiple frameworks selected: Framework level -> Category level -> Findings
2. If single framework selected: Skip framework level, go straight to categories
3. Each category header shows: category name, pass count / total count, severity badge for worst finding

### Pattern 3: Filter Bar with Multi-Select Dropdowns
**What:** Horizontal bar with 4 multi-select dropdowns + text search
**When to use:** Replace existing separate FrameworkFilter and status pill buttons

**MultiSelectDropdown component:**
- Simple absolute-positioned dropdown (no floating-ui needed)
- Button shows label + count of active selections: e.g., "Severity (2)"
- Dropdown body shows checkbox list
- Click outside closes dropdown (useEffect with document click listener)
- `aria-expanded`, `role="listbox"`, `role="option"` with `aria-selected`

**Filter state management:** Use a single `useReducer` or multiple `useState` hooks within the enhanced AuditResults. All filter state is component-local (matches project pattern -- no URL params for v1). The flat/grouped toggle is separate state that controls which sub-component renders.

### Pattern 4: Remediation Registry (Static Data Module)
**What:** TypeScript module exporting structured remediation data keyed by control ID
**When to use:** Drawer looks up remediation by controlId at render time

```typescript
// packages/audit/src/remediation/types.ts
export interface RemediationEntry {
  controlId: string;
  steps: string[];           // numbered instructions
  adminPortalUrl?: string;   // deep link to Entra admin portal
  powershell?: string;       // PowerShell command(s)
  estimatedImpact?: string;  // e.g., "Low - policy change only"
  notes?: string;            // additional context
}
```

**Split into per-framework files:** Recommended (4 files matching the 4 control definition files). This keeps each file manageable (~100-200 lines) and mirrors the existing registry structure.

**Import pattern:**
```typescript
// packages/audit/src/remediation/index.ts
import { ENTRA_ID_REMEDIATION } from './entra-id-remediation.js';
import { NIST_ZTA_REMEDIATION } from './nist-zta-remediation.js';
// ... etc

const ALL_REMEDIATION = new Map<string, RemediationEntry>();
// populate from arrays

export function getRemediationByControlId(id: string): RemediationEntry | undefined {
  return ALL_REMEDIATION.get(id);
}
```

### Pattern 5: Action Queue (Computed + Dismissals)
**What:** Cross-tenant alert panel that aggregates critical findings and tenant status events
**When to use:** Tenant dashboard page (`/tenants`), positioned above the tenant grid

**Computation approach:** Recommend in-memory aggregation in the API route. The data sources are:
1. GET /api/tenants already returns `criticalFindingsCount` per tenant
2. Tenant `status` and `lastAuditAt` are already on the tenant row

The API endpoint computes queue items, then overlays dismiss state from the `actionQueueDismissals` table.

**API endpoint:**
```
GET /api/action-queue
  - Fetches all org tenants
  - For each: computes critical finding items + status event items
  - Joins with actionQueueDismissals to filter dismissed items
  - Returns sorted by severity, then recency
  - Supports ?includesDismissed=true for "View All"

POST /api/action-queue/:itemId/dismiss
  - Inserts dismiss record into actionQueueDismissals
  - Returns 200
```

**Item types:**
```typescript
interface ActionQueueItem {
  id: string;           // computed: `critical-${tenantId}` or `status-${tenantId}-${type}`
  type: 'critical_findings' | 'needs_reauth' | 'stale_audit';
  tenantId: string;
  tenantName: string;
  severity: 'critical' | 'high' | 'warning';
  message: string;
  count?: number;       // for critical findings: how many
  linkTo: string;       // e.g., '/tenants/abc123' (findings tab) or '/tenants/abc123' (settings tab)
  createdAt: string;
  dismissed: boolean;
}
```

### Anti-Patterns to Avoid
- **Do NOT add Redux/Zustand/Jotai:** The project uses React hooks for all state. Adding a state library for filter state would break the pattern. Component-local state is sufficient.
- **Do NOT use React.lazy for the drawer:** The drawer is small (~80 lines). Code splitting adds complexity for negligible bundle savings.
- **Do NOT fetch remediation data from API:** The registry is static TypeScript data. Fetching it via API adds latency and an endpoint for no reason. Import directly in the frontend bundle.
- **Do NOT query per-tenant DBs from the action queue endpoint:** Per-tenant DB queries for every tenant on dashboard load would be slow. Use the cached `lastAuditScore` and `criticalFindingsCount` already on the control-plane tenants table.
- **Do NOT use `dangerouslySetInnerHTML` for remediation HTML:** Steps are plain strings. PowerShell is in a `<pre>` block. No HTML rendering needed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Focus trap in drawer | Custom tab-key handler | Simple focus trap: auto-focus first focusable, listen for Tab on last element | Edge cases: nested focusable elements, dynamic content. Keep it simple with first/last boundary check. |
| Clipboard copy | Custom fallback chain | `navigator.clipboard.writeText()` | All modern browsers support it. No fallback needed for MSP-facing app (Chrome/Edge target). |
| Click-outside detection | Custom portal event bubbling | `useEffect` with document.addEventListener('mousedown') | Standard pattern, ~10 lines. Proven in the codebase (RemoveTenantModal already handles modal dismiss). |
| Stale audit detection | Custom date math | `Date.now() - new Date(lastAuditAt).getTime() > 7 * 24 * 60 * 60 * 1000` | Simple threshold check. No date library needed. |

**Key insight:** Every UI primitive needed in this phase (drawer, dropdown, accordion) is achievable in 60-120 lines of Tailwind + React. The project has no UI component library and adding one now would be inconsistent.

## Common Pitfalls

### Pitfall 1: Accordion State Explosion with Large Finding Sets
**What goes wrong:** 101 findings across 4 frameworks = many accordion groups. If all expand/collapse state is tracked individually, re-renders become expensive.
**Why it happens:** Naive implementation stores Set of expanded group IDs and re-renders entire tree on toggle.
**How to avoid:** Use native `<details>/<summary>` elements -- browser handles open/close state without React re-renders. Only track "currently selected finding" for the drawer.
**Warning signs:** Noticeable lag when expanding/collapsing groups.

### Pitfall 2: Drawer Z-Index Wars with the Filter Bar
**What goes wrong:** Drawer renders behind dropdown menus or doesn't cover the accordion.
**Why it happens:** CSS stacking context from `overflow-hidden` on table wrapper, or filter dropdowns have higher z-index.
**How to avoid:** Render drawer via `createPortal(document.body)` so it escapes all parent stacking contexts. Use z-50 for dropdowns, z-40 for drawer backdrop, z-50 for drawer panel.
**Warning signs:** Visual layering issues in development.

### Pitfall 3: Filter Interaction with Grouped View
**What goes wrong:** Filtering by severity collapses the accordion hierarchy (groups have 0 items) or breaks grouping logic.
**Why it happens:** Filtering happens on the flat finding array, but grouping happens after filtering. Empty groups need to be hidden.
**How to avoid:** Filter first, then group. If a group has 0 visible findings after filtering, hide the entire group header. Update group pass/fail counts to reflect filtered subset.
**Warning signs:** Empty accordion sections or wrong counts in group headers.

### Pitfall 4: Remediation Registry Import Size
**What goes wrong:** 101 remediation entries with multi-line steps and PowerShell commands could be 15-25KB of JS. On the frontend, this loads on every findings page visit.
**Why it happens:** Static imports are bundled into the page chunk.
**How to avoid:** This is actually fine for 101 entries. 25KB gzipped is ~5KB. The concern is theoretical. Do NOT prematurely optimize with dynamic imports or API fetching -- the CONTEXT.md explicitly chose static registry for simplicity and versionability.
**Warning signs:** None expected. Monitor bundle size if it exceeds 50KB.

### Pitfall 5: Action Queue N+1 Queries
**What goes wrong:** The action queue API endpoint queries each tenant's per-tenant DB to get critical findings count.
**Why it happens:** If critical findings count is not cached on the control-plane tenants table.
**How to avoid:** The `criticalFindingsCount` field already exists on `TenantSummary` (but currently hardcoded to 0 in `toTenantSummary`). Phase 5 needs to wire this: after audit completion, update the tenants table's `lastAuditScore` and compute+store critical findings count. This was already noted in Phase 2 code as a TODO.
**Warning signs:** The `toTenantSummary` function in `tenants.ts` returns `criticalFindingsCount: 0` -- this must be updated.

### Pitfall 6: Stale Drawer Content After Filter Change
**What goes wrong:** User opens drawer for a finding, then changes filter. The finding disappears from the list but the drawer stays open showing stale data.
**Why it happens:** Drawer open state is independent of filter state.
**How to avoid:** Close the drawer when any filter changes. Add a `useEffect` that watches filter state and calls `setSelectedFinding(null)`.
**Warning signs:** Drawer shows a finding that is no longer visible in the filtered list.

### Pitfall 7: Missing Package Export for Remediation Module
**What goes wrong:** Frontend import of `@omzig/audit` remediation functions fails at build time.
**Why it happens:** The `packages/audit/package.json` exports may not include the new remediation path.
**How to avoid:** Ensure `packages/audit/src/index.ts` re-exports `getRemediationByControlId`. Or add explicit exports map entry.
**Warning signs:** TypeScript "module not found" or build errors in the web app.

## Code Examples

### Drawer Component Pattern
```typescript
// apps/web/src/components/ui/Drawer.tsx
"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
}

export function Drawer({ isOpen, onClose, title, children, width = "400px" }: DrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      closeRef.current?.focus();
      document.body.style.overflow = "hidden";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-40">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute right-0 top-0 h-full bg-white shadow-xl transition-transform duration-300"
        style={{ width }}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b px-6 py-4">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button ref={closeRef} onClick={onClose} aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {children}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
```

### MultiSelectDropdown Pattern
```typescript
// apps/web/src/components/ui/MultiSelectDropdown.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

interface Option { value: string; label: string; }

interface Props {
  label: string;
  options: Option[];
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
  minSelected?: number; // default 0
}

export function MultiSelectDropdown({ label, options, selected, onChange, minSelected = 0 }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) {
      if (next.size <= minSelected) return;
      next.delete(value);
    } else {
      next.add(value);
    }
    onChange(next);
  };

  const activeCount = selected.size;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm ..."
      >
        {label} {activeCount > 0 && activeCount < options.length && `(${activeCount})`}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div role="listbox" aria-multiselectable="true"
          className="absolute left-0 top-full z-50 mt-1 w-48 rounded-lg border bg-white py-1 shadow-lg">
          {options.map((opt) => (
            <label key={opt.value} role="option" aria-selected={selected.has(opt.value)}
              className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50">
              <input type="checkbox" checked={selected.has(opt.value)}
                onChange={() => toggle(opt.value)} className="h-3.5 w-3.5 rounded" />
              {opt.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
```

### PowerShell Syntax Highlighting Pattern (CSS-Only)
```typescript
// apps/web/src/components/audit/PowerShellBlock.tsx
"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

const PS_KEYWORDS = /\b(Connect-MgGraph|Get-Mg\w+|Set-Mg\w+|New-Mg\w+|Update-Mg\w+|Invoke-MgGraphRequest|Get-MgBeta\w+)\b/g;
const PS_PARAMS = /\s(-\w+)/g;
const PS_STRINGS = /('[^']*'|"[^"]*")/g;
const PS_COMMENTS = /(#.*$)/gm;

function highlightPS(code: string): string {
  return code
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(PS_COMMENTS, '<span class="text-gray-500 italic">$1</span>')
    .replace(PS_STRINGS, '<span class="text-amber-600">$1</span>')
    .replace(PS_KEYWORDS, '<span class="text-blue-600 font-semibold">$1</span>')
    .replace(PS_PARAMS, ' <span class="text-cyan-600">$1</span>');
}

export function PowerShellBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative rounded-lg bg-gray-900 p-4">
      <button onClick={handleCopy} className="absolute right-2 top-2 ..."
        aria-label="Copy to clipboard">
        {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4 text-gray-400" />}
      </button>
      <pre className="overflow-x-auto text-sm text-gray-100">
        <code dangerouslySetInnerHTML={{ __html: highlightPS(code) }} />
      </pre>
    </div>
  );
}
```

Note: `dangerouslySetInnerHTML` is safe here because the input is static registry data, not user input.

### Remediation Registry Entry Pattern
```typescript
// packages/audit/src/remediation/types.ts
export interface RemediationEntry {
  controlId: string;
  steps: string[];
  adminPortalUrl?: string;
  powershell?: string;
  estimatedImpact?: string;
  notes?: string;
}

// packages/audit/src/remediation/entra-id-remediation.ts
export const ENTRA_ID_REMEDIATION: RemediationEntry[] = [
  {
    controlId: 'MS.AAD.1.1v1',
    steps: [
      'Navigate to Microsoft Entra admin center > Protection > Conditional Access > Policies',
      'Click "+ New policy"',
      'Set Users: All users',
      'Set Target resources: All cloud apps',
      'Set Conditions > Client apps: Select "Exchange ActiveSync clients" and "Other clients"',
      'Set Access controls > Grant: Block Access',
      'Set policy to Report-only, test impact, then switch to On',
    ],
    adminPortalUrl: 'https://entra.microsoft.com/#view/Microsoft_AAD_ConditionalAccess/ConditionalAccessBlade/~/Policies',
    powershell: `# Block legacy authentication via Graph API
Connect-MgGraph -Scopes "Policy.ReadWrite.ConditionalAccess"
New-MgIdentityConditionalAccessPolicy -BodyParameter @{
  displayName = "CA001-Block-Legacy-Auth"
  state = "enabledForReportingButNotEnforced"
  conditions = @{
    clientAppTypes = @("exchangeActiveSync", "other")
    users = @{ includeUsers = @("All") }
    applications = @{ includeApplications = @("All") }
  }
  grantControls = @{
    operator = "OR"
    builtInControls = @("block")
  }
}`,
    estimatedImpact: 'High - May block users on older email clients (Outlook 2010 and earlier)',
  },
  // ... 28 more entries
];
```

### Action Queue Dismissals Schema
```typescript
// Addition to packages/db/src/control-plane/schema.ts
export const actionQueueDismissals = mssqlTable('action_queue_dismissals', {
  id: varchar('id', { length: 36 }).primaryKey().notNull(),
  orgId: varchar('org_id', { length: 36 }).notNull().references(() => organizations.id),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  itemKey: varchar('item_key', { length: 200 }).notNull(),
  // itemKey format: "critical-{tenantId}" or "status-{tenantId}-needs_reauth" or "status-{tenantId}-stale_audit"
  dismissedAt: datetime2('dismissed_at').notNull().default(sql`GETDATE()`),
});
// Index on (orgId, userId, itemKey) for fast lookups
```

### Grouped Findings View (Native Details/Summary)
```typescript
// apps/web/src/components/audit/GroupedFindingsView.tsx (structure)
interface GroupedFindingsViewProps {
  findings: AuditFinding[];
  frameworks: Set<string>;
  onSelectFinding: (finding: AuditFinding) => void;
}

// Uses <details>/<summary> for native accordion behavior
// Groups by framework (if multiple) then by category within each framework
// Each group header shows: category name, pass/fail count
// Each finding row is clickable -> calls onSelectFinding -> opens drawer
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom accordion with JS open/close state | Native `<details>/<summary>` HTML5 elements | 2023+ (wide browser support) | No JS needed for expand/collapse, built-in ARIA semantics, less code |
| Floating UI / Popper.js for dropdowns | Absolute positioning with click-outside handler | Simplification trend for basic dropdowns | No dependency, simpler code, adequate for non-edge cases (dropdowns not near viewport edge) |
| Full syntax highlighting libraries (Prism, highlight.js) | CSS class-based regex replacement for targeted languages | Domain-specific choice | 1-2KB vs 30KB+, sufficient for single-language (PowerShell) display |
| react-accessible-accordion | Native HTML5 details/summary | react-accessible-accordion is no longer maintained | Browser-native beats library; fewer dependencies |

**Deprecated/outdated:**
- react-accessible-accordion: No longer maintained, recommends native HTML5 details/summary
- FrameworkFilter component: Will be absorbed into the unified FilterBar (mark as deprecated)

## Microsoft Entra Admin Portal Deep Links

Verified admin portal URL patterns for remediation guidance:

| Area | URL |
|------|-----|
| Conditional Access Policies | `https://entra.microsoft.com/#view/Microsoft_AAD_ConditionalAccess/ConditionalAccessBlade/~/Policies` |
| Authentication Methods | `https://entra.microsoft.com/#view/Microsoft_AAD_IAM/AuthenticationMethodsMenuBlade/~/AdminAuthMethods` |
| User Settings | `https://entra.microsoft.com/#view/Microsoft_AAD_UsersManagementMenuBlade/~/UserSettings` |
| Enterprise Apps > Consent | `https://entra.microsoft.com/#view/Microsoft_AAD_IAM/ConsentPoliciesMenuBlade/~/UserSettings` |
| External Identities | `https://entra.microsoft.com/#view/Microsoft_AAD_IAM/CompanyRelationshipsMenuBlade/~/Settings` |
| PIM > Entra Roles | `https://entra.microsoft.com/#view/Microsoft_Azure_PIMCommon/ResourceMenuBlade/~/roles` |
| Roles and Admins | `https://entra.microsoft.com/#view/Microsoft_AAD_IAM/RolesManagementMenuBlade/~/AllRoles` |
| Identity Protection | `https://entra.microsoft.com/#view/Microsoft_AAD_IAM/IdentityProtectionMenuBlade` |
| Named Locations | `https://entra.microsoft.com/#view/Microsoft_AAD_ConditionalAccess/ConditionalAccessBlade/~/NamedLocations` |
| M365 Admin Center (Password Policy) | `https://admin.microsoft.com/#/Settings/SecurityPrivacy/:/Settings/L1/PasswordPolicy` |

**Confidence:** MEDIUM -- These URLs follow the observed pattern from the Entra admin center SPA routing. They may change with portal updates. The remediation registry should include these as best-effort links with a note that exact URLs may vary.

## CISA SCuBA Remediation Data Availability

Verified via the official CISA SCuBA Entra ID baseline document (cisagov/ScubaGear baselines/aad.md):

- **All 29 CISA SCuBA Entra ID controls** have detailed step-by-step remediation instructions available
- **8 controls** have explicit PowerShell commands (Graph API-based)
- **Advisory controls** (7.3, 7.4, 7.6, 7.8, 7.9) require manual verification -- remediation guidance is organizational ("verify with your security team")
- **NIST ZTA, 800-53, CSF controls**: These are mapped from the same Entra ID settings, so remediation steps overlap. ZTA/800-53/CSF entries should reference the same admin portal pages but frame the guidance in terms of their specific framework requirements.

**Confidence:** HIGH -- CISA publishes canonical remediation steps in the baseline document. These are the authoritative source.

## DB Schema Changes Required

### 1. actionQueueDismissals Table (Control-Plane DB)
New table for tracking per-user dismiss state on action queue items.

| Column | Type | Notes |
|--------|------|-------|
| id | varchar(36) PK | UUID |
| orgId | varchar(36) FK | organizations.id |
| userId | varchar(36) FK | users.id |
| itemKey | varchar(200) | Computed key like "critical-{tenantId}" |
| dismissedAt | datetime2 | When dismissed |

**Index:** Composite on (orgId, userId, itemKey) for fast dismiss lookups.

### 2. Tenants Table Updates (Control-Plane DB)
The existing `criticalFindingsCount` field on `TenantSummary` type is returned as hardcoded `0`. This phase needs to:
- Add a `criticalFindingsCount` column to the `tenants` table (int, default 0)
- OR compute it from the latest audit at query time (slower but avoids schema change)

**Recommendation:** Add the column. It mirrors the existing `lastAuditScore` caching pattern. Update it when audit completes (same place that updates `lastAuditScore`).

## Open Questions

1. **criticalFindingsCount column on tenants table**
   - What we know: TenantSummary type includes it, API returns 0. The pipeline already updates `lastAuditScore` after completion.
   - What's unclear: Whether adding a column requires a migration or if the project uses `push` for schema changes.
   - Recommendation: Add column to schema.ts and run `drizzle-kit push` (matching project's existing pattern from Phase 1 decisions).

2. **Badge count placement for action queue**
   - What we know: CONTEXT.md mentions it as Claude's discretion.
   - What's unclear: Where in the navigation/layout it should appear.
   - Recommendation: Add a small red badge on the "Tenants" nav link when unread action items > 0. This is low-effort and matches standard SaaS patterns.

3. **Remediation registry file size**
   - What we know: 101 entries with multi-line steps and PowerShell = estimated 15-30KB source.
   - What's unclear: Exact bundle impact after tree-shaking and gzip.
   - Recommendation: Acceptable. Monitor after implementation. The alternative (API-fetched) adds complexity for minimal savings.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.0 + React Testing Library 14.3 + jsdom 24.1 |
| Config file | `apps/web/vitest.config.ts` |
| Quick run command | `cd apps/web && pnpm test` |
| Full suite command | `cd apps/web && pnpm test` (same -- no separation) |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DASH-01 | Grouped accordion expands/collapses; drawer opens on finding click | unit | `cd apps/web && pnpm vitest run src/__tests__/GroupedFindings.test.tsx -x` | Wave 0 |
| DASH-02 | Filter bar filters by severity, framework, workload, status | unit | `cd apps/web && pnpm vitest run src/__tests__/FilterBar.test.tsx -x` | Wave 0 |
| DASH-05 | Drawer displays remediation steps from registry | unit | `cd apps/web && pnpm vitest run src/__tests__/FindingDetail.test.tsx -x` | Wave 0 |
| DASH-06 | Drawer shows admin portal link for applicable controls | unit | `cd apps/web && pnpm vitest run src/__tests__/FindingDetail.test.tsx -x` | Wave 0 |
| DASH-07 | Drawer shows PowerShell block with copy button for applicable controls | unit | `cd apps/web && pnpm vitest run src/__tests__/PowerShellBlock.test.tsx -x` | Wave 0 |
| DASH-10 | Action queue renders items, dismiss works, empty state | unit | `cd apps/web && pnpm vitest run src/__tests__/ActionQueue.test.tsx -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd apps/web && pnpm test`
- **Per wave merge:** Full suite across packages
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/web/src/__tests__/GroupedFindings.test.tsx` -- covers DASH-01 (drill-down, accordion, drawer open)
- [ ] `apps/web/src/__tests__/FilterBar.test.tsx` -- covers DASH-02 (multi-select filters, clear all)
- [ ] `apps/web/src/__tests__/FindingDetail.test.tsx` -- covers DASH-05, DASH-06 (remediation steps, portal links)
- [ ] `apps/web/src/__tests__/PowerShellBlock.test.tsx` -- covers DASH-07 (syntax highlight, copy button)
- [ ] `apps/web/src/__tests__/ActionQueue.test.tsx` -- covers DASH-10 (queue items, dismiss, empty state)
- [ ] `packages/audit/src/remediation/__tests__/remediation-registry.test.ts` -- covers registry completeness (all 101 controls have entries)
- [ ] `apps/api/src/__tests__/action-queue.test.ts` -- covers GET/POST action queue API routes

## Sources

### Primary (HIGH confidence)
- Existing codebase: AuditResults.tsx, FrameworkBreakdown.tsx, FrameworkFilter.tsx, FindingBadges.tsx, Badge.tsx, Card.tsx, control-registry.ts, entra-id-controls.ts, tenant.ts types, control-plane schema, tenant schema, audits.ts routes, tenants.ts routes, app.ts, useAudit.ts, useTenants.ts, TenantDashboard test patterns
- CISA SCuBA Entra ID baseline: https://github.com/cisagov/ScubaGear/blob/main/PowerShell/ScubaGear/baselines/aad.md -- canonical remediation steps for all 29 AAD controls
- CISA BOD 25-01 Required Configurations: https://www.cisa.gov/resources-tools/services/bod-25-01-implementing-secure-practices-cloud-services-required-configurations

### Secondary (MEDIUM confidence)
- Microsoft Entra admin center portal URLs: https://learn.microsoft.com/en-us/entra/fundamentals/entra-admin-center -- URL patterns follow SPA routing convention `entra.microsoft.com/#view/...`
- WAI-ARIA Accordion pattern: https://www.aditus.io/patterns/accordion/ -- aria-expanded, aria-controls spec
- React createPortal for drawers: React official docs -- standard pattern for modal/drawer rendering
- Drizzle ORM MSSQL migrations: https://orm.drizzle.team/docs/migrations

### Tertiary (LOW confidence)
- Exact Entra admin center deep link URLs -- these follow observed patterns but Microsoft may change portal routing. Include as best-effort with disclaimer.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies, all existing patterns
- Architecture: HIGH - components, hooks, and API patterns match existing codebase exactly
- Pitfalls: HIGH - identified from actual code inspection (hardcoded criticalFindingsCount, z-index stacking, filter+group interaction)
- Remediation content: HIGH for CISA SCuBA controls (official baseline docs), MEDIUM for NIST ZTA/800-53/CSF (derived from same Entra settings)
- Admin portal URLs: MEDIUM - observed patterns, may change

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (30 days -- stable domain, no fast-moving dependencies)
