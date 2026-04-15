/**
 * Server-side SVG chart string generators.
 *
 * Produces plain-text SVG documents using pure string templating — no DOM
 * dependency — so they can be consumed by PDFKit/svg-to-pdfkit on the server
 * or served directly to HTML clients.
 *
 * Color palette (Phase 6 Plan 02):
 *   - Overall     #1e40af
 *   - AAD         #059669
 *   - ZTA         #d97706
 *   - 80053       #7c3aed
 *   - CSF         #dc2626
 */

const FRAMEWORK_COLORS: Record<string, string> = {
  Overall: '#1e40af',
  AAD: '#059669',
  ZTA: '#d97706',
  '80053': '#7c3aed',
  CSF: '#dc2626',
};

/**
 * XML-escape a text value for safe embedding inside SVG `<text>` elements
 * or attribute values. Handles `&`, `<`, `>`, and `"`.
 *
 * Null/undefined inputs return the empty string so chart templates never
 * emit the literal strings "null"/"undefined".
 */
export function escapeXml(text: string): string {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Radar / spider chart showing NIST 800-207 ZTA tenet maturity (0-100%).
 *
 * - Grid circles at 25/50/75/100% of the chart radius
 * - Blue data polygon (filled with 30% opacity)
 * - Tenet labels radially placed around the outside
 */
export function renderRadarSvg(
  tenets: Array<{ tenet: string; weightedPassRate: number }>,
  width: number,
  height: number,
): string {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 50;

  if (tenets.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <text x="${cx}" y="${cy}" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#6b7280">No maturity data available</text>
</svg>`;
  }

  // Grid circles
  const gridCircles = [0.25, 0.5, 0.75, 1].map(
    (r) =>
      `<circle cx="${cx}" cy="${cy}" r="${(radius * r).toFixed(1)}" fill="none" stroke="#e5e7eb" stroke-width="1"/>`,
  );

  // Axis lines + labels + data points
  const n = tenets.length;
  const angleStep = (Math.PI * 2) / n;
  const axisLines: string[] = [];
  const labels: string[] = [];
  const points: string[] = [];

  for (let i = 0; i < n; i++) {
    const angle = -Math.PI / 2 + i * angleStep;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // Axis line
    const ax = (cx + cos * radius).toFixed(1);
    const ay = (cy + sin * radius).toFixed(1);
    axisLines.push(
      `<line x1="${cx}" y1="${cy}" x2="${ax}" y2="${ay}" stroke="#e5e7eb" stroke-width="1"/>`,
    );

    // Label (outside the chart)
    const lx = (cx + cos * (radius + 20)).toFixed(1);
    const ly = (cy + sin * (radius + 20) + 5).toFixed(1);
    const anchor =
      cos > 0.3 ? 'start' : cos < -0.3 ? 'end' : 'middle';
    labels.push(
      `<text x="${lx}" y="${ly}" text-anchor="${anchor}" font-family="sans-serif" font-size="12" fill="#374151">${escapeXml(tenets[i].tenet)}</text>`,
    );

    // Data point
    const rate = Math.max(0, Math.min(100, tenets[i].weightedPassRate ?? 0));
    const r = (rate / 100) * radius;
    const px = (cx + cos * r).toFixed(1);
    const py = (cy + sin * r).toFixed(1);
    points.push(`${px},${py}`);
  }

  const polygon = `<polygon points="${points.join(' ')}" fill="#1e40af" fill-opacity="0.3" stroke="#1e40af" stroke-width="2"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${gridCircles.join('\n  ')}
  ${axisLines.join('\n  ')}
  ${polygon}
  ${labels.join('\n  ')}
</svg>`;
}

/**
 * Horizontal bar chart for framework compliance scores.
 *
 * Framework name on the left, filled bar to percentage, score label on the right.
 */
export function renderFrameworkBarSvg(
  scores: Record<string, { score: number }>,
  width: number,
  height: number,
): string {
  const entries = Object.entries(scores);
  if (entries.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#6b7280">No framework scores available</text>
</svg>`;
  }

  const labelWidth = 80;
  const scoreLabelWidth = 50;
  const padding = 20;
  const barAreaWidth = width - labelWidth - scoreLabelWidth - padding * 2;
  const rowHeight = (height - padding * 2) / entries.length;
  const barHeight = Math.max(10, rowHeight * 0.6);

  const rows = entries.map(([name, { score }], i) => {
    const y = padding + i * rowHeight + (rowHeight - barHeight) / 2;
    const safeScore = Math.max(0, Math.min(100, score ?? 0));
    const barLen = (safeScore / 100) * barAreaWidth;
    const color = FRAMEWORK_COLORS[name] ?? '#6b7280';
    const labelName = escapeXml(name);

    return `
  <text x="${padding}" y="${(y + barHeight / 2 + 4).toFixed(1)}" font-family="sans-serif" font-size="13" fill="#1f2937">${labelName}</text>
  <rect x="${padding + labelWidth}" y="${y.toFixed(1)}" width="${barAreaWidth}" height="${barHeight}" fill="#f3f4f6" rx="3"/>
  <rect x="${padding + labelWidth}" y="${y.toFixed(1)}" width="${barLen.toFixed(1)}" height="${barHeight}" fill="${color}" rx="3"/>
  <text x="${(padding + labelWidth + barAreaWidth + 10).toFixed(1)}" y="${(y + barHeight / 2 + 4).toFixed(1)}" font-family="sans-serif" font-size="13" fill="#1f2937">${safeScore}%</text>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${rows.join('')}
</svg>`;
}

/**
 * Multi-line trend chart with 5 polylines (Overall + 4 frameworks).
 *
 * X-axis: dates (equally spaced).
 * Y-axis: 0-100.
 */
export function renderTrendLineSvg(
  data: Array<{ date: string; scores: Record<string, number> }>,
  width: number,
  height: number,
): string {
  if (data.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#6b7280">No trend data available</text>
</svg>`;
  }

  const padding = 50;
  const plotW = width - padding * 2;
  const plotH = height - padding * 2;
  const n = data.length;

  const xFor = (i: number) =>
    n === 1 ? padding + plotW / 2 : padding + (i / (n - 1)) * plotW;
  const yFor = (score: number) => {
    const s = Math.max(0, Math.min(100, score));
    return padding + plotH - (s / 100) * plotH;
  };

  // Y-axis grid lines + labels
  const yGrid: string[] = [];
  for (const val of [0, 25, 50, 75, 100]) {
    const y = yFor(val).toFixed(1);
    yGrid.push(
      `<line x1="${padding}" y1="${y}" x2="${padding + plotW}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`,
    );
    yGrid.push(
      `<text x="${padding - 8}" y="${(Number(y) + 4).toFixed(1)}" text-anchor="end" font-family="sans-serif" font-size="10" fill="#6b7280">${val}</text>`,
    );
  }

  // X-axis date labels
  const xLabels: string[] = [];
  for (let i = 0; i < n; i++) {
    const x = xFor(i).toFixed(1);
    xLabels.push(
      `<text x="${x}" y="${(padding + plotH + 18).toFixed(1)}" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#6b7280">${escapeXml(data[i].date)}</text>`,
    );
  }

  // 5 polylines
  const seriesOrder = ['Overall', 'AAD', 'ZTA', '80053', 'CSF'];
  const polylines: string[] = seriesOrder.map((seriesName) => {
    const points = data
      .map((d, i) => {
        const score = d.scores[seriesName] ?? 0;
        return `${xFor(i).toFixed(1)},${yFor(score).toFixed(1)}`;
      })
      .join(' ');
    const color = FRAMEWORK_COLORS[seriesName] ?? '#6b7280';
    return `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2"/>`;
  });

  // Simple legend in top-right
  const legendEntries = seriesOrder.map((s, i) => {
    const y = padding + i * 16;
    const color = FRAMEWORK_COLORS[s];
    return `<rect x="${padding + plotW - 90}" y="${y}" width="10" height="10" fill="${color}"/><text x="${padding + plotW - 75}" y="${y + 9}" font-family="sans-serif" font-size="10" fill="#374151">${escapeXml(s)}</text>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${yGrid.join('\n  ')}
  ${xLabels.join('\n  ')}
  ${polylines.join('\n  ')}
  ${legendEntries.join('\n  ')}
</svg>`;
}
