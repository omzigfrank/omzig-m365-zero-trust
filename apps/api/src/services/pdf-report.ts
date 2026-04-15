import PDFDocument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';
import {
  renderRadarSvg,
  renderFrameworkBarSvg,
  renderTrendLineSvg,
} from './svg-charts.js';

/**
 * PDF compliance report generation.
 *
 * Two report types:
 *   - Executive summary (2-3 pages) -- overall score, framework bars,
 *     top 5 critical findings, ZTA summary.
 *   - Full compliance report (8-10 pages) -- everything in executive plus
 *     all findings grouped by framework, radar chart, and trend chart.
 *
 * Both are returned as Node `Buffer` instances so callers can set
 * Content-Type: application/pdf and ship the bytes directly.
 *
 * Buffer collection pattern (PDFKit streams -> Buffer):
 *   const chunks: Buffer[] = [];
 *   doc.on('data', (c) => chunks.push(c));
 *   doc.on('end', () => resolve(Buffer.concat(chunks)));
 *   doc.end();
 */

export interface ReportFinding {
  controlId?: string;
  product?: string;
  severity?: string;
  rating?: string;
  message?: string;
  action?: string;
  description?: string;
}

export interface ReportMaturityRow {
  tenet?: string;
  tenetName?: string;
  weightedPassRate?: number;
  maturityLevel?: string;
}

export interface ReportData {
  tenantName: string;
  orgName: string;
  auditDate: Date;
  overallScore: number;
  frameworkScores: Record<string, { score: number }>;
  maturitySnapshot: ReportMaturityRow[];
  findings: ReportFinding[];
  trendData?: Array<{ date: string; scores: Record<string, number> }>;
}

const BRAND_COLOR = '#1e40af';
const MUTED = '#6b7280';
const TEXT = '#1f2937';

function severityRank(s: string | undefined): number {
  switch ((s ?? '').toLowerCase()) {
    case 'critical':
      return 0;
    case 'high':
      return 1;
    case 'medium':
      return 2;
    case 'low':
      return 3;
    default:
      return 4;
  }
}

/**
 * Add a branding header at the top of the current page.
 */
function addBrandHeader(doc: InstanceType<typeof PDFDocument>, orgName: string) {
  doc
    .fillColor(BRAND_COLOR)
    .fontSize(10)
    .text('Omzig Zero Trust Auditor', 50, 30, { align: 'left' });
  doc
    .fillColor(MUTED)
    .fontSize(9)
    .text(orgName, 50, 30, { align: 'right' });
  doc.fillColor(TEXT);
}

/**
 * Add a title section for the report (large headline + tenant + date).
 */
function addTitle(
  doc: InstanceType<typeof PDFDocument>,
  title: string,
  data: ReportData,
) {
  doc
    .fillColor(BRAND_COLOR)
    .fontSize(24)
    .text(title, 50, 70);
  doc
    .fillColor(TEXT)
    .fontSize(14)
    .text(data.tenantName, 50, 110);
  doc
    .fillColor(MUTED)
    .fontSize(10)
    .text(`Audit completed: ${data.auditDate.toISOString().slice(0, 10)}`, 50, 130);
  doc.moveDown(2);
}

/**
 * Embed an SVG string at (x, y) with the given width/height, safely.
 */
function embedSvg(
  doc: InstanceType<typeof PDFDocument>,
  svg: string,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  try {
    SVGtoPDF(doc, svg, x, y, { width, height, assumePt: true });
  } catch (err) {
    // Fallback: render a plain "chart unavailable" box so the PDF is still valid
    doc
      .rect(x, y, width, height)
      .stroke('#e5e7eb');
    doc
      .fillColor(MUTED)
      .fontSize(10)
      .text(
        'Chart unavailable',
        x,
        y + height / 2 - 5,
        { width, align: 'center' },
      );
    doc.fillColor(TEXT);
    // eslint-disable-next-line no-console
    console.warn('Failed to embed SVG in PDF:', err);
  }
}

/**
 * Render the executive summary onto the document. Also used as the first
 * 2-3 pages of the full report.
 */
function renderExecutive(
  doc: InstanceType<typeof PDFDocument>,
  data: ReportData,
) {
  addBrandHeader(doc, data.orgName);
  addTitle(doc, 'Compliance Assessment Report', data);

  // Overall score (large)
  doc
    .fillColor(BRAND_COLOR)
    .fontSize(48)
    .text(`${Math.round(data.overallScore)}%`, 50, 170);
  doc
    .fillColor(MUTED)
    .fontSize(11)
    .text('Overall compliance score', 50, 225);
  doc.fillColor(TEXT);

  // Framework bar chart
  const barSvg = renderFrameworkBarSvg(data.frameworkScores, 500, 160);
  embedSvg(doc, barSvg, 50, 260, 500, 160);

  // Page 2: top 5 critical/high findings + ZTA summary
  doc.addPage();
  addBrandHeader(doc, data.orgName);

  doc
    .fillColor(BRAND_COLOR)
    .fontSize(18)
    .text('Top Priority Findings', 50, 70);
  doc.fillColor(TEXT);

  const critical = [...data.findings]
    .filter((f) => (f.rating ?? '').toLowerCase() === 'fail')
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .slice(0, 5);

  let y = 110;
  if (critical.length === 0) {
    doc
      .fontSize(11)
      .fillColor(MUTED)
      .text('No critical findings. Great work!', 50, y);
    doc.fillColor(TEXT);
  } else {
    doc.fontSize(10);
    for (const f of critical) {
      doc
        .fillColor(BRAND_COLOR)
        .text(`${f.controlId ?? 'Unknown'}`, 50, y, { continued: true })
        .fillColor(TEXT)
        .text(`  [${f.severity ?? 'Unknown'}]`, { continued: false });
      doc
        .fillColor(MUTED)
        .fontSize(9)
        .text(f.message ?? '', 50, y + 12, { width: 500 });
      doc.fillColor(TEXT).fontSize(10);
      y += 40;
    }
  }

  // ZTA maturity summary
  y = Math.max(y, 340);
  doc
    .fillColor(BRAND_COLOR)
    .fontSize(18)
    .text('ZTA Maturity Summary', 50, y);
  doc.fillColor(TEXT).fontSize(10);

  if (data.maturitySnapshot.length === 0) {
    doc
      .fillColor(MUTED)
      .text('No maturity data available', 50, y + 30);
    doc.fillColor(TEXT);
  } else {
    let row = y + 30;
    for (const t of data.maturitySnapshot) {
      doc
        .fillColor(TEXT)
        .text(
          `${t.tenetName ?? t.tenet ?? 'Tenet'}: ${t.weightedPassRate ?? 0}% (${t.maturityLevel ?? 'unknown'})`,
          50,
          row,
        );
      row += 16;
    }
  }

  // Page 3 (optional): radar chart if we have maturity data
  if (data.maturitySnapshot.length > 0) {
    doc.addPage();
    addBrandHeader(doc, data.orgName);
    doc
      .fillColor(BRAND_COLOR)
      .fontSize(18)
      .text('ZTA Maturity Radar', 50, 70);
    doc.fillColor(TEXT);
    const radarSvg = renderRadarSvg(
      data.maturitySnapshot.map((m) => ({
        tenet: m.tenetName ?? m.tenet ?? 'Tenet',
        weightedPassRate: m.weightedPassRate ?? 0,
      })),
      400,
      400,
    );
    embedSvg(doc, radarSvg, 100, 110, 400, 400);
  }
}

/**
 * Collect PDFKit stream output into a Buffer.
 */
function toBuffer(doc: InstanceType<typeof PDFDocument>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err: Error) => reject(err));
    doc.end();
  });
}

/**
 * Generate the executive summary PDF (2-3 pages).
 */
export async function generateExecutiveReport(data: ReportData): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'LETTER', margin: 50, autoFirstPage: true });
  renderExecutive(doc, data);
  return toBuffer(doc);
}

/**
 * Generate the full compliance report PDF (8-10 pages).
 */
export async function generateFullReport(data: ReportData): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'LETTER', margin: 50, autoFirstPage: true });

  // Pages 1-3: executive content
  renderExecutive(doc, data);

  // Pages 4+: findings grouped by framework
  const byFramework: Record<string, ReportFinding[]> = {};
  for (const f of data.findings) {
    const key = f.product ?? 'Other';
    if (!byFramework[key]) byFramework[key] = [];
    byFramework[key].push(f);
  }

  const frameworkOrder = ['AAD', 'ZTA', '80053', 'CSF'];
  const frameworks = [
    ...frameworkOrder.filter((k) => byFramework[k]),
    ...Object.keys(byFramework).filter((k) => !frameworkOrder.includes(k)),
  ];

  for (const framework of frameworks) {
    doc.addPage();
    addBrandHeader(doc, data.orgName);
    doc
      .fillColor(BRAND_COLOR)
      .fontSize(18)
      .text(`Findings — ${framework}`, 50, 70);
    doc.fillColor(TEXT);

    const list = byFramework[framework];
    let y = 110;
    doc.fontSize(9);
    for (const f of list) {
      if (y > 720) {
        doc.addPage();
        addBrandHeader(doc, data.orgName);
        y = 70;
      }
      doc
        .fillColor(BRAND_COLOR)
        .text(
          `${f.controlId ?? 'Unknown'}  [${f.severity ?? '—'}]  ${(f.rating ?? '').toUpperCase()}`,
          50,
          y,
        );
      doc
        .fillColor(TEXT)
        .text(f.message ?? '', 50, y + 12, { width: 500 });
      if (f.action) {
        doc
          .fillColor(MUTED)
          .fontSize(8)
          .text(`Action: ${f.action}`, 50, y + 28, { width: 500 });
        doc.fillColor(TEXT).fontSize(9);
      }
      y += 50;
    }
  }

  // Trend chart page if enough data
  if (data.trendData && data.trendData.length >= 3) {
    doc.addPage();
    addBrandHeader(doc, data.orgName);
    doc
      .fillColor(BRAND_COLOR)
      .fontSize(18)
      .text('Compliance Trend', 50, 70);
    doc.fillColor(TEXT);
    const trendSvg = renderTrendLineSvg(data.trendData, 500, 300);
    embedSvg(doc, trendSvg, 50, 110, 500, 300);
  }

  return toBuffer(doc);
}
