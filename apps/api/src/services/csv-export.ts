/**
 * CSV export service.
 *
 * Produces a ~20-column findings CSV with proper quoting and escaping for
 * both single-tenant and multi-tenant exports.
 *
 * Design:
 *   - Every field is wrapped in double quotes (consistent quoting avoids
 *     edge cases with commas, newlines, and leading/trailing whitespace).
 *   - Internal double quotes are doubled (RFC 4180).
 *   - When `tenant` is `null`, the Tenant Name and Tenant ID columns are
 *     omitted so single-tenant exports from a tenant detail page don't
 *     carry redundant context.
 */

export type FindingCsvRow = Record<string, unknown>;

export interface CsvColumn {
  header: string;
  accessor: (
    finding: FindingCsvRow,
    run?: Record<string, unknown> | null,
    tenant?: { id: string; displayName: string } | null,
  ) => string;
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export const CSV_COLUMNS: CsvColumn[] = [
  {
    header: 'Tenant Name',
    accessor: (_f, _r, t) => stringify(t?.displayName),
  },
  {
    header: 'Tenant ID',
    accessor: (_f, _r, t) => stringify(t?.id),
  },
  {
    header: 'Audit ID',
    accessor: (f, r) => stringify(r?.id ?? f.auditRunId),
  },
  {
    header: 'Audit Date',
    accessor: (_f, r) => {
      const v = r?.completedAt ?? r?.startedAt ?? null;
      if (!v) return '';
      const d = v instanceof Date ? v : new Date(v as string | number);
      return isNaN(d.getTime()) ? stringify(v) : d.toISOString();
    },
  },
  { header: 'Control ID', accessor: (f) => stringify(f.controlId) },
  { header: 'Product', accessor: (f) => stringify(f.product) },
  { header: 'Description', accessor: (f) => stringify(f.description) },
  {
    header: 'Requirement Level',
    accessor: (f) => stringify(f.requirementLevel),
  },
  { header: 'Severity', accessor: (f) => stringify(f.severity) },
  { header: 'Status', accessor: (f) => stringify(f.rating) },
  { header: 'Message', accessor: (f) => stringify(f.message) },
  { header: 'Action', accessor: (f) => stringify(f.action) },
  { header: 'Setting Name', accessor: (f) => stringify(f.settingName) },
  { header: 'Current Value', accessor: (f) => stringify(f.currentValue) },
  { header: 'Expected Value', accessor: (f) => stringify(f.expectedValue) },
  { header: 'NIST 800-53', accessor: (f) => stringify(f.nist80053) },
  { header: 'NIST CSF', accessor: (f) => stringify(f.nistCsf) },
  { header: 'ZTA Tenet', accessor: (f) => stringify(f.nist800207Tenet) },
  {
    header: 'Required Permission',
    accessor: (f) => stringify(f.requiredPermission),
  },
];

/**
 * Wrap a single field in double quotes, doubling any internal double quotes.
 */
function csvField(value: string): string {
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}

function rowToLine(values: string[]): string {
  return values.map(csvField).join(',');
}

/**
 * Generate a findings CSV.
 *
 * @param findings The audit findings to include as rows.
 * @param run Optional audit run metadata (for Audit ID / Audit Date columns).
 * @param tenant When provided, includes Tenant Name + Tenant ID as the first
 *               two columns. When `null`/`undefined`, those columns are
 *               omitted (single-tenant export from the tenant detail page).
 */
export function generateFindingsCsv(
  findings: FindingCsvRow[],
  run?: Record<string, unknown> | null,
  tenant?: { id: string; displayName: string } | null,
): string {
  const columns = tenant == null ? CSV_COLUMNS.slice(2) : CSV_COLUMNS;

  const headerLine = rowToLine(columns.map((c) => c.header));
  const dataLines = findings.map((f) =>
    rowToLine(columns.map((c) => c.accessor(f, run ?? null, tenant ?? null))),
  );

  return [headerLine, ...dataLines].join('\n') + '\n';
}

/**
 * Generate a combined multi-tenant CSV.
 *
 * Always includes Tenant Name and Tenant ID as the first two columns.
 * Input is sorted alphabetically by tenant displayName (case-insensitive).
 * Rows within a tenant preserve their incoming order.
 */
export function generateMultiTenantCsv(
  tenantFindings: Array<{
    tenant: { id: string; displayName: string };
    run: Record<string, unknown> | null;
    findings: FindingCsvRow[];
  }>,
): string {
  const sorted = [...tenantFindings].sort((a, b) =>
    a.tenant.displayName.localeCompare(b.tenant.displayName, undefined, {
      sensitivity: 'base',
    }),
  );

  const headerLine = rowToLine(CSV_COLUMNS.map((c) => c.header));

  const dataLines: string[] = [];
  for (const { tenant, run, findings } of sorted) {
    for (const f of findings) {
      dataLines.push(
        rowToLine(CSV_COLUMNS.map((c) => c.accessor(f, run, tenant))),
      );
    }
  }

  return [headerLine, ...dataLines].join('\n') + '\n';
}
