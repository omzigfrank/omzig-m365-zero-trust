import { describe, it, expect } from 'vitest';
import {
  renderRadarSvg,
  renderFrameworkBarSvg,
  renderTrendLineSvg,
  escapeXml,
} from '../services/svg-charts.js';

describe('escapeXml', () => {
  it('escapes ampersand', () => {
    expect(escapeXml('A & B')).toBe('A &amp; B');
  });
  it('escapes less-than and greater-than', () => {
    expect(escapeXml('<tag>')).toBe('&lt;tag&gt;');
  });
  it('escapes double quotes', () => {
    expect(escapeXml('say "hi"')).toBe('say &quot;hi&quot;');
  });
  it('escapes all together', () => {
    expect(escapeXml('A & B < "C"')).toBe('A &amp; B &lt; &quot;C&quot;');
  });
  it('handles undefined/null by returning empty string', () => {
    expect(escapeXml(undefined as unknown as string)).toBe('');
    expect(escapeXml(null as unknown as string)).toBe('');
  });
});

describe('renderRadarSvg', () => {
  const tenets = [
    { tenet: 'User', weightedPassRate: 80 },
    { tenet: 'Device', weightedPassRate: 60 },
    { tenet: 'Network', weightedPassRate: 40 },
    { tenet: 'Application', weightedPassRate: 90 },
    { tenet: 'Data', weightedPassRate: 70 },
  ];

  it('produces an SVG element with width and height attributes', () => {
    const svg = renderRadarSvg(tenets, 400, 400);
    expect(svg).toContain('<svg');
    expect(svg).toContain('width="400"');
    expect(svg).toContain('height="400"');
    expect(svg).toContain('</svg>');
  });

  it('includes grid circles for 25/50/75/100%', () => {
    const svg = renderRadarSvg(tenets, 400, 400);
    // Should have 4 grid circles
    const circleCount = (svg.match(/<circle/g) || []).length;
    expect(circleCount).toBeGreaterThanOrEqual(4);
  });

  it('includes a data polygon', () => {
    const svg = renderRadarSvg(tenets, 400, 400);
    expect(svg).toContain('<polygon');
  });

  it('includes labels for each tenet (text elements)', () => {
    const svg = renderRadarSvg(tenets, 400, 400);
    for (const t of tenets) {
      expect(svg).toContain(t.tenet);
    }
  });

  it('XML-escapes special characters in tenet labels', () => {
    const svg = renderRadarSvg(
      [{ tenet: 'A & <B>', weightedPassRate: 50 }],
      200,
      200,
    );
    expect(svg).toContain('A &amp; &lt;B&gt;');
    expect(svg).not.toContain('A & <B>');
  });

  it('returns an empty-state svg when no tenets are provided', () => {
    const svg = renderRadarSvg([], 200, 200);
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });
});

describe('renderFrameworkBarSvg', () => {
  const scores = {
    AAD: { score: 85 },
    ZTA: { score: 70 },
    '80053': { score: 60 },
    CSF: { score: 90 },
  };

  it('produces an SVG element with width and height', () => {
    const svg = renderFrameworkBarSvg(scores, 600, 300);
    expect(svg).toContain('<svg');
    expect(svg).toContain('width="600"');
    expect(svg).toContain('height="300"');
    expect(svg).toContain('</svg>');
  });

  it('draws one rect per framework', () => {
    const svg = renderFrameworkBarSvg(scores, 600, 300);
    const rectCount = (svg.match(/<rect/g) || []).length;
    expect(rectCount).toBeGreaterThanOrEqual(4);
  });

  it('uses the framework color palette', () => {
    const svg = renderFrameworkBarSvg(scores, 600, 300);
    expect(svg).toContain('#059669'); // AAD
    expect(svg).toContain('#d97706'); // ZTA
    expect(svg).toContain('#7c3aed'); // 80053
    expect(svg).toContain('#dc2626'); // CSF
  });

  it('includes framework name labels and score %', () => {
    const svg = renderFrameworkBarSvg(scores, 600, 300);
    expect(svg).toContain('AAD');
    expect(svg).toContain('85');
    expect(svg).toContain('90');
  });
});

describe('renderTrendLineSvg', () => {
  const trendData = [
    {
      date: '2026-01-01',
      scores: { Overall: 70, AAD: 75, ZTA: 65, '80053': 60, CSF: 80 },
    },
    {
      date: '2026-02-01',
      scores: { Overall: 75, AAD: 80, ZTA: 70, '80053': 65, CSF: 85 },
    },
    {
      date: '2026-03-01',
      scores: { Overall: 80, AAD: 85, ZTA: 75, '80053': 70, CSF: 90 },
    },
  ];

  it('produces an SVG element', () => {
    const svg = renderTrendLineSvg(trendData, 800, 300);
    expect(svg).toContain('<svg');
    expect(svg).toContain('width="800"');
    expect(svg).toContain('height="300"');
  });

  it('renders 5 polylines (Overall + 4 frameworks)', () => {
    const svg = renderTrendLineSvg(trendData, 800, 300);
    const polylineCount = (svg.match(/<polyline/g) || []).length;
    expect(polylineCount).toBe(5);
  });

  it('uses Overall color #1e40af for the overall line', () => {
    const svg = renderTrendLineSvg(trendData, 800, 300);
    expect(svg).toContain('#1e40af');
  });

  it('renders date labels on the x-axis', () => {
    const svg = renderTrendLineSvg(trendData, 800, 300);
    expect(svg).toContain('2026-01-01');
    expect(svg).toContain('2026-03-01');
  });

  it('handles empty trend data without throwing', () => {
    const svg = renderTrendLineSvg([], 800, 300);
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });
});
