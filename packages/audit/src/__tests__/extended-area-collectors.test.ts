import { describe, it, expect } from 'vitest';
import { parseDevices } from '../collectors/areas/devices.js';
import { parseLicenses } from '../collectors/areas/licenses.js';
import { parseDomains } from '../collectors/areas/domains.js';
import { parsePimRoles } from '../collectors/areas/pim-roles.js';
import { parseAppRegistrations } from '../collectors/areas/app-registrations.js';
import { parseSensitivityLabels } from '../collectors/areas/sensitivity-labels.js';
import {
  mockManagedDevices,
  mockSubscribedSkus,
  mockDomains,
  mockPimRoleEligibility,
  mockPimRoleAssignments,
  mockApplications,
  mockSensitivityLabels,
} from './fixtures/graph-responses.js';

// =========================================================================
// Devices
// =========================================================================
describe('devices area collector', () => {
  it('parses managedDevices collection and counts compliant vs total', () => {
    const result = parseDevices(mockManagedDevices);
    expect(result.available).toBe(true);
    expect(result.totalDevices).toBe(4);
    expect(result.compliantDevices).toBe(2);
    expect(result.nonCompliantDevices).toBe(1);
  });

  it('sets available=false with error on failure', () => {
    const result = parseDevices({ error: true, status: 403 });
    expect(result.available).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// =========================================================================
// Licenses
// =========================================================================
describe('licenses area collector', () => {
  it('parses subscribedSkus and detects P2, Defender for O365 SKUs', () => {
    const result = parseLicenses(mockSubscribedSkus);
    expect(result.available).toBe(true);
    expect(result.hasP2).toBe(true);
    expect(result.hasIntune).toBe(true);
    expect(result.hasQualifyingSku).toBe(true);
    expect(result.hasDefenderO365).toBe(true);
    expect(result.licenses.length).toBeGreaterThan(0);
  });

  it('sets available=false with error on failure', () => {
    const result = parseLicenses({ error: true, status: 403 });
    expect(result.available).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// =========================================================================
// Domains
// =========================================================================
describe('domains area collector', () => {
  it('parses domains collection and extracts passwordValidityPeriodInDays', () => {
    const result = parseDomains(mockDomains);
    expect(result.domains.available).toBe(true);
    expect(result.domains.totalDomains).toBe(2);
    expect(result.domains.customDomainCount).toBe(1);
    expect(result.domains.hasOnlyOnmicrosoft).toBe(false);
    expect(result.passwordPolicy.available).toBe(true);
    expect(result.passwordPolicy.passwordValidityPeriodInDays).toBe(2147483647);
  });

  it('sets available=false with error on failure', () => {
    const result = parseDomains({ error: true, status: 403 });
    expect(result.domains.available).toBe(false);
    expect(result.domains.error).toBeDefined();
  });
});

// =========================================================================
// PIM Roles
// =========================================================================
describe('pim-roles area collector', () => {
  it('parses eligible and active PIM role assignments', () => {
    const result = parsePimRoles(mockPimRoleEligibility, mockPimRoleAssignments);
    expect(result.available).toBe(true);
    expect(result.eligibleAssignments).toBe(2);
    expect(result.activeAssignments).toBe(2);
    expect(result.totalAssignments).toBe(2);
  });

  it('handles 403 gracefully when P2 not licensed (PITFALL 2)', () => {
    const result = parsePimRoles(
      { error: true, status: 403, message: 'Insufficient privileges' },
      { error: true, status: 403, message: 'Insufficient privileges' },
    );
    expect(result.available).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// =========================================================================
// App Registrations
// =========================================================================
describe('app-registrations area collector', () => {
  it('parses count from $count=true response', () => {
    const result = parseAppRegistrations(mockApplications);
    expect(result.available).toBe(true);
    expect(result.totalApps).toBe(12);
  });

  it('sets available=false with error on failure', () => {
    const result = parseAppRegistrations({ error: true, status: 403 });
    expect(result.available).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// =========================================================================
// Sensitivity Labels
// =========================================================================
describe('sensitivity-labels area collector', () => {
  it('parses labels from beta endpoint response (PITFALL 3)', () => {
    const result = parseSensitivityLabels(mockSensitivityLabels);
    expect(result.available).toBe(true);
    expect(result.totalLabels).toBe(3);
  });

  it('sets available=false with error on failure', () => {
    const result = parseSensitivityLabels({ error: true, status: 403 });
    expect(result.available).toBe(false);
    expect(result.error).toBeDefined();
  });
});
