/**
 * Phase 7 Plan 03 -- Impact preview service tests.
 *
 * Covers all 5 RISKY control-id handlers with mocked Graph clients and
 * REAL AuditFacts shapes. Asserts:
 *   - Field paths use facts.mfa.totalUsers / .registeredUsers,
 *     facts.devices.compliantDevices / .nonCompliantDevices,
 *     facts.conditionalAccess.policies (NOT legacy top-level arrays)
 *   - Confidence downgrades to 'estimated' when facts are older than 6h
 *   - Phishing-resistant-MFA handler is ALWAYS 'estimated' regardless of
 *     factsAgeMs (documented limitation)
 *   - Conflict detection walks facts.conditionalAccess.policies
 */

import { describe, it, expect, vi } from 'vitest';
import { createEmptyFacts } from '@omzig/audit';
import {
  computeImpactPreview,
  type RemediationImpactPreview,
} from '../services/impact-preview.js';

// --- Fake Graph client builder -----------------------------------------------

function buildFakeGraphClient(responses: Record<string, unknown> = {}) {
  const calls: Array<{
    url: string;
    filter?: string;
    select?: string;
    count?: boolean;
    top?: number;
  }> = [];

  function api(url: string) {
    const state: {
      url: string;
      filter?: string;
      select?: string;
      count?: boolean;
      top?: number;
    } = { url };

    const chain: any = {
      filter(f: string) {
        state.filter = f;
        return chain;
      },
      select(s: string) {
        state.select = s;
        return chain;
      },
      count(c: boolean) {
        state.count = c;
        return chain;
      },
      top(n: number) {
        state.top = n;
        return chain;
      },
      header(_k: string, _v: string) {
        return chain;
      },
      async get() {
        calls.push({ ...state });
        // Pick response by URL.
        return responses[url] ?? {};
      },
    };
    return chain;
  }

  return {
    calls,
    client: { api } as any,
  };
}

// --- Helpers -----------------------------------------------------------------

function makeFacts(
  overrides: Partial<ReturnType<typeof createEmptyFacts>> = {},
): ReturnType<typeof createEmptyFacts> {
  const facts = createEmptyFacts();
  // Provide sensible defaults so a test can selectively override one area.
  facts.mfa = {
    available: true,
    totalUsers: 100,
    registeredUsers: 75,
    percentage: 75,
  };
  facts.devices = {
    available: true,
    totalDevices: 50,
    compliantDevices: 40,
    nonCompliantDevices: 10,
  };
  facts.conditionalAccess = {
    available: true,
    totalPolicies: 3,
    enabledCount: 2,
    reportOnlyCount: 1,
    disabledCount: 0,
    policies: [],
  };
  facts.appRegistrations = {
    available: true,
    totalApps: 42,
  };
  Object.assign(facts, overrides);
  return facts;
}

const FRESH_MS = 60 * 60 * 1000; // 1 hour
const STALE_MS = 12 * 60 * 60 * 1000; // 12 hours

// ============================================================================
// require-compliant-device (MS.AAD.3.7v1)
// ============================================================================

describe('computeImpactPreview -- MS.AAD.3.7v1 (require-compliant-device)', () => {
  it('returns all RemediationImpactPreview fields', async () => {
    const { client } = buildFakeGraphClient({
      '/deviceManagement/managedDevices': {
        value: [
          { userPrincipalName: 'alice@tenant.com' },
          { userPrincipalName: 'bob@tenant.com' },
          { userPrincipalName: 'alice@tenant.com' }, // dup
        ],
      },
    });
    const preview = await computeImpactPreview({
      findingId: 'f1',
      controlId: 'MS.AAD.3.7v1',
      graphClient: client,
      facts: makeFacts(),
      factsAgeMs: FRESH_MS,
    });

    expect(preview).toHaveProperty('affectedUserCount');
    expect(preview).toHaveProperty('totalUserCount');
    expect(preview).toHaveProperty('conflictingPolicies');
    expect(preview).toHaveProperty('warnings');
    expect(preview).toHaveProperty('confidence');
    expect(preview).toHaveProperty('summary');
  });

  it('counts unique non-compliant UPNs via Graph', async () => {
    const { client } = buildFakeGraphClient({
      '/deviceManagement/managedDevices': {
        value: [
          { userPrincipalName: 'alice@tenant.com' },
          { userPrincipalName: 'bob@tenant.com' },
          { userPrincipalName: 'ALICE@tenant.com' }, // case-insensitive dedup
        ],
      },
    });
    const preview = await computeImpactPreview({
      findingId: 'f1',
      controlId: 'MS.AAD.3.7v1',
      graphClient: client,
      facts: makeFacts(),
      factsAgeMs: FRESH_MS,
    });
    expect(preview.affectedUserCount).toBe(2);
    expect(preview.warnings.length).toBeGreaterThan(0);
    expect(preview.warnings[0]).toMatch(/2 users/);
  });

  it('reads totalUserCount from facts.mfa.totalUsers (no extra Graph call)', async () => {
    const { client, calls } = buildFakeGraphClient({
      '/deviceManagement/managedDevices': { value: [] },
    });
    const preview = await computeImpactPreview({
      findingId: 'f1',
      controlId: 'MS.AAD.3.7v1',
      graphClient: client,
      facts: makeFacts({
        mfa: {
          available: true,
          totalUsers: 250,
          registeredUsers: 200,
          percentage: 80,
        },
      }),
      factsAgeMs: FRESH_MS,
    });
    expect(preview.totalUserCount).toBe(250);
    // Only the single deviceManagement read should have been made.
    expect(calls.filter((c) => c.url.includes('users?')).length).toBe(0);
  });

  it('returns confidence=high when facts < 6 hours old', async () => {
    const { client } = buildFakeGraphClient({
      '/deviceManagement/managedDevices': { value: [] },
    });
    const preview = await computeImpactPreview({
      findingId: 'f1',
      controlId: 'MS.AAD.3.7v1',
      graphClient: client,
      facts: makeFacts(),
      factsAgeMs: FRESH_MS,
    });
    expect(preview.confidence).toBe('high');
  });

  it('returns confidence=estimated when facts >= 6 hours old', async () => {
    const { client } = buildFakeGraphClient({
      '/deviceManagement/managedDevices': { value: [] },
    });
    const preview = await computeImpactPreview({
      findingId: 'f1',
      controlId: 'MS.AAD.3.7v1',
      graphClient: client,
      facts: makeFacts(),
      factsAgeMs: STALE_MS,
    });
    expect(preview.confidence).toBe('estimated');
  });

  it('falls back to facts.devices.nonCompliantDevices when Graph read fails', async () => {
    const api = vi.fn(() => ({
      filter: () => ({
        select: () => ({
          count: () => ({
            get: () => Promise.reject(new Error('Graph unavailable')),
            header: function () {
              return this;
            },
          }),
        }),
      }),
    }));
    const client = { api } as any;

    const preview = await computeImpactPreview({
      findingId: 'f1',
      controlId: 'MS.AAD.3.7v1',
      graphClient: client,
      facts: makeFacts({
        devices: {
          available: true,
          totalDevices: 50,
          compliantDevices: 45,
          nonCompliantDevices: 5,
        },
      }),
      factsAgeMs: FRESH_MS,
    });
    expect(preview.affectedUserCount).toBe(5);
    // Confidence is downgraded because we fell back to facts.
    expect(preview.confidence).toBe('estimated');
  });

  it('detects conflicting CA policies from facts.conditionalAccess.policies', async () => {
    const { client } = buildFakeGraphClient({
      '/deviceManagement/managedDevices': { value: [] },
    });
    const preview = await computeImpactPreview({
      findingId: 'f1',
      controlId: 'MS.AAD.3.7v1',
      graphClient: client,
      facts: makeFacts({
        conditionalAccess: {
          available: true,
          totalPolicies: 2,
          enabledCount: 2,
          reportOnlyCount: 0,
          disabledCount: 0,
          policies: [
            {
              id: 'ca-existing-1',
              displayName: 'Existing all-user policy',
              state: 'enabled',
              conditions: {
                users: { includeUsers: ['All'] },
              },
              grantControls: null,
              sessionControls: null,
            },
            {
              id: 'ca-existing-2',
              displayName: 'Disabled policy',
              state: 'disabled',
              conditions: {
                users: { includeUsers: ['All'] },
              },
              grantControls: null,
              sessionControls: null,
            },
          ],
        },
      }),
      factsAgeMs: FRESH_MS,
    });

    expect(preview.conflictingPolicies.length).toBe(1);
    expect(preview.conflictingPolicies[0].id).toBe('ca-existing-1');
    expect(preview.conflictingPolicies[0].displayName).toBe(
      'Existing all-user policy',
    );
  });
});

// ============================================================================
// require-phishing-resistant-mfa (MS.AAD.3.1v1)
// ============================================================================

describe('computeImpactPreview -- MS.AAD.3.1v1 (phishing-resistant MFA)', () => {
  it('approximates unregistered count from facts.mfa', async () => {
    const { client } = buildFakeGraphClient();
    const preview = await computeImpactPreview({
      findingId: 'f2',
      controlId: 'MS.AAD.3.1v1',
      graphClient: client,
      facts: makeFacts({
        mfa: {
          available: true,
          totalUsers: 200,
          registeredUsers: 150,
          percentage: 75,
        },
      }),
      factsAgeMs: FRESH_MS,
    });
    expect(preview.affectedUserCount).toBe(50);
  });

  it('ALWAYS returns confidence=estimated (documented limitation)', async () => {
    const { client } = buildFakeGraphClient();
    const preview = await computeImpactPreview({
      findingId: 'f2',
      controlId: 'MS.AAD.3.1v1',
      graphClient: client,
      facts: makeFacts(),
      factsAgeMs: FRESH_MS, // fresh
    });
    expect(preview.confidence).toBe('estimated');
    // Warning must note the limitation.
    expect(preview.warnings.join(' ')).toMatch(/phishing-resistant/i);
  });
});

// ============================================================================
// block-guest-access (MS.AAD.8.2v1)
// ============================================================================

describe('computeImpactPreview -- MS.AAD.8.2v1 (block-guest-access)', () => {
  it('reads guest count via targeted Graph read', async () => {
    const { client } = buildFakeGraphClient({
      '/users': { '@odata.count': 17 },
    });
    const preview = await computeImpactPreview({
      findingId: 'f3',
      controlId: 'MS.AAD.8.2v1',
      graphClient: client,
      facts: makeFacts(),
      factsAgeMs: FRESH_MS,
    });
    expect(preview.affectedUserCount).toBe(17);
    expect(preview.warnings[0]).toMatch(/17 guest users/);
  });

  it('returns confidence=high for fresh facts', async () => {
    const { client } = buildFakeGraphClient({
      '/users': { '@odata.count': 0 },
    });
    const preview = await computeImpactPreview({
      findingId: 'f3',
      controlId: 'MS.AAD.8.2v1',
      graphClient: client,
      facts: makeFacts(),
      factsAgeMs: FRESH_MS,
    });
    expect(preview.confidence).toBe('high');
  });
});

// ============================================================================
// disable-user-consent-all (MS.AAD.5.2v1)
// ============================================================================

describe('computeImpactPreview -- MS.AAD.5.2v1 (disable-user-consent-all)', () => {
  it('reads user-consent grants via oauth2PermissionGrants', async () => {
    const { client } = buildFakeGraphClient({
      '/oauth2PermissionGrants': { '@odata.count': 8 },
    });
    const preview = await computeImpactPreview({
      findingId: 'f4',
      controlId: 'MS.AAD.5.2v1',
      graphClient: client,
      facts: makeFacts(),
      factsAgeMs: FRESH_MS,
    });
    expect(preview.affectedUserCount).toBe(8);
    expect(preview.warnings[0]).toMatch(/8 user-consented/);
  });
});

// ============================================================================
// sign-in-risk-policy (NIST.ZTA.T4.1v1)
// ============================================================================

describe('computeImpactPreview -- NIST.ZTA.T4.1v1 (sign-in-risk-policy)', () => {
  it('reads risky user count from Identity Protection', async () => {
    const { client } = buildFakeGraphClient({
      '/identityProtection/riskyUsers': { '@odata.count': 3 },
    });
    const preview = await computeImpactPreview({
      findingId: 'f5',
      controlId: 'NIST.ZTA.T4.1v1',
      graphClient: client,
      facts: makeFacts(),
      factsAgeMs: FRESH_MS,
    });
    expect(preview.affectedUserCount).toBe(3);
    expect(preview.warnings.join(' ')).toMatch(/3 users/);
  });
});

// ============================================================================
// Unknown control
// ============================================================================

describe('computeImpactPreview -- unknown control', () => {
  it('returns empty preview with warning', async () => {
    const { client } = buildFakeGraphClient();
    const preview = await computeImpactPreview({
      findingId: 'f6',
      controlId: 'UNKNOWN.CONTROL',
      graphClient: client,
      facts: makeFacts(),
      factsAgeMs: FRESH_MS,
    });
    expect(preview.affectedUserCount).toBe(0);
    expect(preview.warnings.length).toBeGreaterThan(0);
    expect(preview.confidence).toBe('estimated');
  });
});

// ============================================================================
// Type compile-time check: ExecutionResult.phase is optional
// ============================================================================

describe('ExecutionResult.phase (type check)', () => {
  it('accepts ExecutionResult without phase', async () => {
    // Runtime typecheck via variable assignment
    const result: import('@omzig/audit').ExecutionResult = {
      beforeSnapshot: null,
      afterSnapshot: {},
      targetResourceId: null,
    };
    expect(result).toBeDefined();
  });

  it('accepts ExecutionResult with phase=report_only_deployed', async () => {
    const result: import('@omzig/audit').ExecutionResult = {
      beforeSnapshot: null,
      afterSnapshot: {},
      targetResourceId: 'x',
      phase: 'report_only_deployed',
    };
    expect(result.phase).toBe('report_only_deployed');
  });
});

// Silence unused import warning for RemediationImpactPreview (compile-time only).
void (null as unknown as RemediationImpactPreview);
