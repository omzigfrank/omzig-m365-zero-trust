import { describe, it, expect } from 'vitest';
import {
  generateFindingsCsv,
  generateMultiTenantCsv,
  CSV_COLUMNS,
} from '../services/csv-export.js';

const baseFinding = {
  id: 'f1',
  auditRunId: 'audit-1',
  controlId: 'MS.AAD.1.1v1',
  product: 'AAD',
  description: 'Block legacy auth',
  requirementLevel: 'SHALL',
  severity: 'High',
  rating: 'fail',
  message: 'Legacy auth still allowed',
  action: 'Disable legacy authentication protocols',
  settingName: 'legacyAuthEnabled',
  currentValue: 'true',
  expectedValue: 'false',
  requiredPermission: 'Policy.Read.All',
  nist80053: 'AC-17',
  nistCsf: 'PR.AC-7',
  nist800207Tenet: 'User',
};

const baseRun = {
  id: 'audit-1',
  completedAt: new Date('2026-04-14T10:00:00Z'),
};

describe('CSV_COLUMNS', () => {
  it('exports a column list with at least 19 entries', () => {
    expect(Array.isArray(CSV_COLUMNS)).toBe(true);
    expect(CSV_COLUMNS.length).toBeGreaterThanOrEqual(19);
  });

  it('has Tenant Name and Tenant ID as first two columns', () => {
    expect(CSV_COLUMNS[0].header).toBe('Tenant Name');
    expect(CSV_COLUMNS[1].header).toBe('Tenant ID');
  });

  it('includes all required columns', () => {
    const headers = CSV_COLUMNS.map((c) => c.header);
    for (const required of [
      'Audit ID',
      'Audit Date',
      'Control ID',
      'Product',
      'Description',
      'Requirement Level',
      'Severity',
      'Status',
      'Message',
      'Action',
      'Setting Name',
      'Current Value',
      'Expected Value',
      'NIST 800-53',
      'NIST CSF',
      'ZTA Tenet',
      'Required Permission',
    ]) {
      expect(headers).toContain(required);
    }
  });
});

describe('generateFindingsCsv', () => {
  it('produces a header row with all columns when tenant is provided', () => {
    const csv = generateFindingsCsv([baseFinding], baseRun, {
      id: 't-1',
      displayName: 'Acme',
    });
    const firstLine = csv.split('\n')[0];
    expect(firstLine).toContain('"Tenant Name"');
    expect(firstLine).toContain('"Tenant ID"');
    expect(firstLine).toContain('"Audit ID"');
    expect(firstLine).toContain('"Control ID"');
  });

  it('omits Tenant Name and Tenant ID columns when tenant is null', () => {
    const csv = generateFindingsCsv([baseFinding], baseRun, null);
    const firstLine = csv.split('\n')[0];
    expect(firstLine).not.toContain('Tenant Name');
    expect(firstLine).not.toContain('Tenant ID');
    expect(firstLine).toContain('"Audit ID"');
  });

  it('produces a data row with tenant info as first two fields', () => {
    const csv = generateFindingsCsv([baseFinding], baseRun, {
      id: 'tenant-123',
      displayName: 'Acme Corp',
    });
    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(2);
    expect(lines[1]).toMatch(/^"Acme Corp","tenant-123",/);
  });

  it('quotes every field in both header and data rows', () => {
    const csv = generateFindingsCsv([baseFinding], baseRun, {
      id: 't-1',
      displayName: 'Acme',
    });
    const lines = csv.trim().split('\n');
    // Each line begins and ends with a double quote
    expect(lines[0].startsWith('"')).toBe(true);
    expect(lines[0].endsWith('"')).toBe(true);
    expect(lines[1].startsWith('"')).toBe(true);
    expect(lines[1].endsWith('"')).toBe(true);
  });

  it('escapes internal double quotes by doubling them', () => {
    const finding = {
      ...baseFinding,
      message: 'He said "hello" to the user',
    };
    const csv = generateFindingsCsv([finding], baseRun, null);
    expect(csv).toContain('""hello""');
  });

  it('preserves commas inside field values', () => {
    const finding = {
      ...baseFinding,
      description: 'Apples, oranges, pears',
    };
    const csv = generateFindingsCsv([finding], baseRun, null);
    expect(csv).toContain('"Apples, oranges, pears"');
  });

  it('handles null/undefined finding fields by writing empty strings', () => {
    const finding = {
      ...baseFinding,
      message: null,
      action: undefined,
      nistCsf: null,
    };
    const csv = generateFindingsCsv([finding], baseRun, null);
    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(2);
    // Sanity: still parseable, still quoted
    expect(lines[1].startsWith('"')).toBe(true);
  });

  it('returns header-only CSV for empty findings array', () => {
    const csv = generateFindingsCsv([], baseRun, null);
    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('"Audit ID"');
  });
});

describe('generateMultiTenantCsv', () => {
  it('returns header-only CSV when input array is empty', () => {
    const csv = generateMultiTenantCsv([]);
    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('"Tenant Name"');
    expect(lines[0]).toContain('"Tenant ID"');
  });

  it('combines findings from multiple tenants into one CSV', () => {
    const csv = generateMultiTenantCsv([
      {
        tenant: { id: 't-1', displayName: 'Acme' },
        run: baseRun,
        findings: [baseFinding],
      },
      {
        tenant: { id: 't-2', displayName: 'Beta' },
        run: baseRun,
        findings: [baseFinding, baseFinding],
      },
    ]);
    const lines = csv.trim().split('\n');
    // 1 header + 1 for Acme + 2 for Beta = 4
    expect(lines.length).toBe(4);
    expect(lines[0]).toContain('"Tenant Name"');
    expect(lines[1]).toMatch(/^"Acme"/);
    expect(lines[2]).toMatch(/^"Beta"/);
    expect(lines[3]).toMatch(/^"Beta"/);
  });

  it('sorts tenants alphabetically by displayName', () => {
    const csv = generateMultiTenantCsv([
      {
        tenant: { id: 't-z', displayName: 'Zeta' },
        run: baseRun,
        findings: [baseFinding],
      },
      {
        tenant: { id: 't-a', displayName: 'Alpha' },
        run: baseRun,
        findings: [baseFinding],
      },
    ]);
    const lines = csv.trim().split('\n');
    expect(lines[1]).toMatch(/^"Alpha"/);
    expect(lines[2]).toMatch(/^"Zeta"/);
  });

  it('always includes Tenant Name and Tenant ID columns', () => {
    const csv = generateMultiTenantCsv([
      {
        tenant: { id: 't-1', displayName: 'Acme' },
        run: baseRun,
        findings: [baseFinding],
      },
    ]);
    const firstLine = csv.split('\n')[0];
    expect(firstLine).toContain('"Tenant Name"');
    expect(firstLine).toContain('"Tenant ID"');
  });
});
