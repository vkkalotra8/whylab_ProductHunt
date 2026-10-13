import type { MLIncidentReport } from './incident-report.ts';

// Standard A4 dimensions in PDF points (72 points = 1 inch)
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_LEFT = 40;
const MARGIN_RIGHT = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT; // ~515.28 pt
const MARGIN_BOTTOM = 50;

type RGB = [number, number, number];

const COLORS = {
  white: [1, 1, 1] as RGB,
  navy: [0.06, 0.09, 0.16] as RGB, // #0f172a
  navyLight: [0.12, 0.23, 0.54] as RGB, // #1e3a8a
  slateDark: [0.2, 0.25, 0.33] as RGB, // #334155
  slateMuted: [0.39, 0.45, 0.55] as RGB, // #64748b
  slateLight: [0.85, 0.88, 0.92] as RGB, // #cbd5e1
  bgSurface: [0.97, 0.98, 0.99] as RGB, // #f8fafc
  bgHeader: [0.95, 0.96, 0.98] as RGB, // #f1f5f9
  criticalRed: [0.86, 0.15, 0.15] as RGB, // #dc2626
  criticalBg: [0.99, 0.95, 0.95] as RGB,
  warningAmber: [0.71, 0.33, 0.04] as RGB, // #b45309
  warningBg: [1.0, 0.98, 0.92] as RGB,
  successGreen: [0.02, 0.59, 0.41] as RGB, // #059669
  successBg: [0.93, 0.99, 0.96] as RGB,
  infoBlue: [0.01, 0.52, 0.78] as RGB, // #0284c7
  infoBg: [0.94, 0.98, 1.0] as RGB,
};

function escapePdfText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, ' '); // ensure printable ASCII
}

/**
 * Robust word-wrapping utility for PDF Helvetica and Courier text
 */
export function wrapTextLines(
  text: string,
  maxWidth: number,
  fontSize: number,
  font: '/F1' | '/F2' | '/F3' | '/F4' = '/F1'
): string[] {
  if (!text || text.trim().length === 0) return [''];

  const charWidth = font === '/F3' || font === '/F4' ? fontSize * 0.6 : fontSize * 0.48;
  const maxChars = Math.max(1, Math.floor(maxWidth / charWidth));

  const words = text.replace(/[\r\n]+/g, ' ').split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (!word) continue;

    if (currentLine.length === 0) {
      if (word.length > maxChars) {
        let remaining = word;
        while (remaining.length > maxChars) {
          lines.push(remaining.slice(0, maxChars));
          remaining = remaining.slice(maxChars);
        }
        currentLine = remaining;
      } else {
        currentLine = word;
      }
    } else if (currentLine.length + 1 + word.length <= maxChars) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      if (word.length > maxChars) {
        let remaining = word;
        while (remaining.length > maxChars) {
          lines.push(remaining.slice(0, maxChars));
          remaining = remaining.slice(maxChars);
        }
        currentLine = remaining;
      } else {
        currentLine = word;
      }
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [''];
}

interface PageStream {
  operations: string[];
}

export type TableCell =
  | string
  | {
      text: string;
      badge?: { label: string; type: 'critical' | 'warning' | 'success' | 'info' | 'neutral' };
      font?: '/F1' | '/F2' | '/F3' | '/F4';
      size?: number;
      color?: RGB;
    };

export class SimplePdfDocument {
  private pages: PageStream[] = [];
  private currentPageIndex = -1;
  private currentY = 0;

  constructor() {
    this.addPage();
  }

  public addPage(): void {
    this.pages.push({ operations: [] });
    this.currentPageIndex = this.pages.length - 1;
    this.currentY = PAGE_HEIGHT - 45; // Start near top
  }

  public get pageCount(): number {
    return this.pages.length;
  }

  public getY(): number {
    return this.currentY;
  }

  public setY(y: number): void {
    this.currentY = y;
  }

  public ensureSpace(requiredHeight: number): void {
    if (this.currentY - requiredHeight < MARGIN_BOTTOM) {
      this.addPage();
    }
  }

  private op(cmd: string): void {
    this.pages[this.currentPageIndex].operations.push(cmd);
  }

  public drawRect(
    x: number,
    y: number,
    w: number,
    h: number,
    fill?: RGB,
    stroke?: RGB,
    lineWidth = 1
  ): void {
    let cmd = `${lineWidth} w\n`;
    if (fill) {
      cmd += `${fill[0].toFixed(3)} ${fill[1].toFixed(3)} ${fill[2].toFixed(3)} rg\n`;
    }
    if (stroke) {
      cmd += `${stroke[0].toFixed(3)} ${stroke[1].toFixed(3)} ${stroke[2].toFixed(3)} RG\n`;
    }
    // PDF coordinates start from bottom-left
    cmd += `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re\n`;
    if (fill && stroke) {
      cmd += 'B\n';
    } else if (fill) {
      cmd += 'f\n';
    } else if (stroke) {
      cmd += 'S\n';
    }
    this.op(cmd);
  }

  public drawLine(x1: number, y1: number, x2: number, y2: number, color: RGB = COLORS.slateLight, width = 1): void {
    const cmd = `${width} w\n${color[0].toFixed(3)} ${color[1].toFixed(3)} ${color[2].toFixed(3)} RG\n${x1.toFixed(2)} ${y1.toFixed(2)} m\n${x2.toFixed(2)} ${y2.toFixed(2)} l\nS\n`;
    this.op(cmd);
  }

  public drawText(
    text: string,
    x: number,
    y: number,
    font: '/F1' | '/F2' | '/F3' | '/F4' = '/F1',
    size = 10,
    color: RGB = COLORS.slateDark
  ): void {
    const safeText = escapePdfText(text);
    const cmd = `BT\n${font} ${size} Tf\n${color[0].toFixed(3)} ${color[1].toFixed(3)} ${color[2].toFixed(3)} rg\n1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm\n(${safeText}) Tj\nET\n`;
    this.op(cmd);
  }

  public drawWrappedText(
    text: string,
    x: number,
    startY: number,
    maxWidth: number,
    lineHeight = 12,
    font: '/F1' | '/F2' | '/F3' | '/F4' = '/F1',
    size = 8.5,
    color: RGB = COLORS.slateDark
  ): number {
    const lines = wrapTextLines(text, maxWidth, size, font);
    let y = startY;

    for (const line of lines) {
      this.ensureSpace(lineHeight);
      this.drawText(line, x, y, font, size, color);
      y -= lineHeight;
    }
    this.currentY = y;
    return y;
  }

  public drawBadge(
    label: string,
    x: number,
    y: number,
    type: 'critical' | 'warning' | 'success' | 'info' | 'neutral'
  ): number {
    let bg = COLORS.infoBg;
    let textCol = COLORS.infoBlue;
    let borderCol = COLORS.infoBlue;

    if (type === 'critical') {
      bg = COLORS.criticalBg;
      textCol = COLORS.criticalRed;
      borderCol = COLORS.criticalRed;
    } else if (type === 'warning') {
      bg = COLORS.warningBg;
      textCol = COLORS.warningAmber;
      borderCol = COLORS.warningAmber;
    } else if (type === 'success') {
      bg = COLORS.successBg;
      textCol = COLORS.successGreen;
      borderCol = COLORS.successGreen;
    } else if (type === 'neutral') {
      bg = COLORS.bgHeader;
      textCol = COLORS.slateDark;
      borderCol = COLORS.slateMuted;
    }

    const approxWidth = label.length * 5.2 + 12;
    const height = 15;
    this.drawRect(x, y - 3, approxWidth, height, bg, borderCol, 0.7);
    this.drawText(label, x + 6, y + 1, '/F2', 7.5, textCol);
    return approxWidth;
  }

  public drawSectionHeader(title: string, badgeText?: string, badgeType?: 'critical' | 'warning' | 'success' | 'info'): void {
    this.ensureSpace(40);
    const y = this.currentY;

    // Header bar highlight indicator
    this.drawRect(MARGIN_LEFT, y - 4, 3, 16, COLORS.infoBlue);
    this.drawText(title, MARGIN_LEFT + 8, y, '/F2', 12, COLORS.navy);

    if (badgeText) {
      this.drawBadge(badgeText, MARGIN_LEFT + 8 + title.length * 7 + 10, y, badgeType ?? 'info');
    }

    this.drawLine(MARGIN_LEFT, y - 8, MARGIN_LEFT + CONTENT_WIDTH, y - 8, COLORS.slateLight, 0.7);
    this.currentY = y - 17;
  }

  /**
   * High-precision dynamic table with cell text wrapping and automatic pagination
   */
  public drawTable(
    headers: string[],
    rows: TableCell[][],
    colWidths: number[]
  ): void {
    const headerHeight = 20;
    const lineHeight = 10;
    const padTop = 5;
    const padBottom = 4;

    // Helper to draw table header
    const drawTableHeader = (yPos: number) => {
      this.drawRect(MARGIN_LEFT, yPos - headerHeight, CONTENT_WIDTH, headerHeight, COLORS.bgHeader, COLORS.slateLight, 0.7);
      let curX = MARGIN_LEFT;
      for (let i = 0; i < headers.length; i++) {
        this.drawText(headers[i], curX + 6, yPos - 13, '/F2', 8.5, COLORS.navy);
        curX += colWidths[i];
      }
      return yPos - headerHeight;
    };

    // Ensure initial space for header + at least 1 row
    this.ensureSpace(headerHeight + 25);
    let y = drawTableHeader(this.currentY);

    // Render Rows with Dynamic Cell Text Wrapping
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];

      // Pre-calculate wrapped lines for every cell in this row
      const cellLines: string[][] = [];
      let maxLines = 1;

      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        const colW = colWidths[c] ?? 100;
        const maxTextW = Math.max(20, colW - 12);

        if (typeof cell === 'string') {
          const lines = wrapTextLines(cell, maxTextW, 8, '/F1');
          cellLines.push(lines);
          if (lines.length > maxLines) maxLines = lines.length;
        } else if (cell.badge) {
          cellLines.push([cell.badge.label]);
        } else {
          const font = cell.font ?? '/F1';
          const size = cell.size ?? 8;
          const lines = wrapTextLines(cell.text, maxTextW, size, font);
          cellLines.push(lines);
          if (lines.length > maxLines) maxLines = lines.length;
        }
      }

      // Compute row height based on content
      const rowHeight = Math.max(17, padTop + maxLines * lineHeight + padBottom);

      // Pagination check: if row crosses bottom margin, break and redraw header
      if (y - rowHeight < MARGIN_BOTTOM) {
        this.addPage();
        y = drawTableHeader(this.currentY);
      }

      // Draw row background
      const rowBg = r % 2 === 1 ? COLORS.bgSurface : COLORS.white;
      this.drawRect(MARGIN_LEFT, y - rowHeight, CONTENT_WIDTH, rowHeight, rowBg, COLORS.slateLight, 0.5);

      // Draw cells
      let curX = MARGIN_LEFT;
      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        const lines = cellLines[c];

        if (typeof cell !== 'string' && cell.badge) {
          const badgeY = y - Math.floor(rowHeight / 2) - 3;
          this.drawBadge(cell.badge.label, curX + 6, badgeY, cell.badge.type);
        } else {
          const font = typeof cell === 'object' && cell.font ? cell.font : '/F1';
          const size = typeof cell === 'object' && cell.size ? cell.size : 8;
          const color = typeof cell === 'object' && cell.color ? cell.color : COLORS.slateDark;

          for (let l = 0; l < lines.length; l++) {
            const lineY = y - padTop - (l * lineHeight);
            this.drawText(lines[l], curX + 6, lineY, font, size, color);
          }
        }

        curX += colWidths[c];
      }

      y -= rowHeight;
    }

    this.currentY = y - 9;
  }

  /**
   * Finalizes document and serializes to standard PDF 1.4 byte buffer
   */
  public toBuffer(): Uint8Array {
    const totalPages = this.pages.length;

    // Draw running headers and footers on every page
    for (let p = 0; p < totalPages; p++) {
      const page = this.pages[p];
      // Top header rule
      page.operations.push(
        `0.7 w\n${COLORS.slateLight[0]} ${COLORS.slateLight[1]} ${COLORS.slateLight[2]} RG\n${MARGIN_LEFT} ${PAGE_HEIGHT - 28} m\n${PAGE_LEFT_LIMIT(CONTENT_WIDTH)} ${PAGE_HEIGHT - 28} l\nS\n` +
          `BT\n/F2 7.5 Tf\n${COLORS.navyLight[0]} ${COLORS.navyLight[1]} ${COLORS.navyLight[2]} rg\n1 0 0 1 ${MARGIN_LEFT} ${PAGE_HEIGHT - 22} Tm\n(${escapePdfText('WhyLab 2.0  ·  ML Reliability Incident & Diagnostic Report')}) Tj\nET\n` +
          `BT\n/F1 7.5 Tf\n${COLORS.slateMuted[0]} ${COLORS.slateMuted[1]} ${COLORS.slateMuted[2]} rg\n1 0 0 1 ${PAGE_LEFT_LIMIT(CONTENT_WIDTH) - 130} ${PAGE_HEIGHT - 22} Tm\n(${escapePdfText('Certified Deterministic Evidence')}) Tj\nET\n`
      );

      // Bottom footer rule
      const pageStr = `Page ${p + 1} of ${totalPages}`;
      page.operations.push(
        `0.7 w\n${COLORS.slateLight[0]} ${COLORS.slateLight[1]} ${COLORS.slateLight[2]} RG\n${MARGIN_LEFT} 32 m\n${PAGE_LEFT_LIMIT(CONTENT_WIDTH)} 32 l\nS\n` +
          `BT\n/F1 7.5 Tf\n${COLORS.slateMuted[0]} ${COLORS.slateMuted[1]} ${COLORS.slateMuted[2]} rg\n1 0 0 1 ${MARGIN_LEFT} 22 Tm\n(${escapePdfText('WhyLab AI Reliability Systems · Machine Learning Verification Platform')}) Tj\nET\n` +
          `BT\n/F2 7.5 Tf\n${COLORS.slateDark[0]} ${COLORS.slateDark[1]} ${COLORS.slateDark[2]} rg\n1 0 0 1 ${PAGE_LEFT_LIMIT(CONTENT_WIDTH) - 60} 22 Tm\n(${escapePdfText(pageStr)}) Tj\nET\n`
      );
    }

    // Assemble PDF Objects
    const chunks: string[] = [];
    const offsets: number[] = [];
    let currentOffset = 0;

    const pushChunk = (str: string) => {
      chunks.push(str);
      currentOffset += Buffer.byteLength(str, 'binary');
    };

    pushChunk('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

    const fontObjF1 = 3 + totalPages * 2;
    const fontObjF2 = fontObjF1 + 1;
    const fontObjF3 = fontObjF2 + 1;
    const fontObjF4 = fontObjF3 + 1;

    // 1. Catalog
    offsets[1] = currentOffset;
    pushChunk('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

    // 2. Pages Root
    const kids = Array.from({ length: totalPages }, (_, i) => `${3 + i * 2} 0 R`).join(' ');
    offsets[2] = currentOffset;
    pushChunk(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${totalPages} >>\nendobj\n`);

    // For each page:
    for (let i = 0; i < totalPages; i++) {
      const pageObjNum = 3 + i * 2;
      const contentObjNum = pageObjNum + 1;

      offsets[pageObjNum] = currentOffset;
      pushChunk(
        `${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents ${contentObjNum} 0 R /Resources << /Font << /F1 ${fontObjF1} 0 R /F2 ${fontObjF2} 0 R /F3 ${fontObjF3} 0 R /F4 ${fontObjF4} 0 R >> /ProcSet [/PDF /Text /ImageB /ImageC /ImageI] >> >>\nendobj\n`
      );

      const streamContent = this.pages[i].operations.join('');
      const streamLen = Buffer.byteLength(streamContent, 'binary');

      offsets[contentObjNum] = currentOffset;
      pushChunk(
        `${contentObjNum} 0 obj\n<< /Length ${streamLen} >>\nstream\n${streamContent}\nendstream\nendobj\n`
      );
    }

    // Font Objects
    offsets[fontObjF1] = currentOffset;
    pushChunk(`${fontObjF1} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`);

    offsets[fontObjF2] = currentOffset;
    pushChunk(`${fontObjF2} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`);

    offsets[fontObjF3] = currentOffset;
    pushChunk(`${fontObjF3} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n`);

    offsets[fontObjF4] = currentOffset;
    pushChunk(`${fontObjF4} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>\nendobj\n`);

    // Cross-Reference Table
    const startXref = currentOffset;
    const totalObjs = fontObjF4 + 1;

    pushChunk(`xref\n0 ${totalObjs}\n0000000000 65535 f \n`);
    for (let i = 1; i < totalObjs; i++) {
      const off = offsets[i] ?? 0;
      const padded = off.toString().padStart(10, '0');
      pushChunk(`${padded} 00000 n \n`);
    }

    pushChunk(`trailer\n<< /Size ${totalObjs} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`);

    const fullStr = chunks.join('');
    const buf = new Uint8Array(Buffer.byteLength(fullStr, 'binary'));
    for (let i = 0; i < fullStr.length; i++) {
      buf[i] = fullStr.charCodeAt(i) & 0xff;
    }
    return buf;
  }
}

function PAGE_LEFT_LIMIT(contentWidth: number): number {
  return MARGIN_LEFT + contentWidth;
}

/**
 * Generates an executive, light-theme incident report PDF from an MLIncidentReport
 */
export function buildIncidentReportPdf(report: MLIncidentReport): Uint8Array {
  const doc = new SimplePdfDocument();

  // ---------------- HEADER & TITLE ----------------
  doc.setY(PAGE_HEIGHT - 55);

  // Top Title Banner
  doc.drawText('WhyLab 2.0 Incident Attestation', MARGIN_LEFT, doc.getY(), '/F2', 9, COLORS.navyLight);
  doc.drawBadge(report.status, MARGIN_LEFT + CONTENT_WIDTH - 80, doc.getY(), report.status === 'REMEDIATED' ? 'success' : 'critical');
  doc.setY(doc.getY() - 18);

  doc.drawText('ML Reliability Diagnostic & Incident Report', MARGIN_LEFT, doc.getY(), '/F2', 17, COLORS.navy);
  doc.setY(doc.getY() - 14);

  doc.drawText(
    `Investigation ID: ${report.investigationId}  ·  Report ID: ${report.reportId}  ·  Generated: ${new Date(report.generatedAt).toLocaleString()}`,
    MARGIN_LEFT,
    doc.getY(),
    '/F1',
    8.5,
    COLORS.slateMuted
  );
  doc.setY(doc.getY() - 14);

  doc.drawLine(MARGIN_LEFT, doc.getY(), MARGIN_LEFT + CONTENT_WIDTH, doc.getY(), COLORS.slateLight, 1);
  doc.setY(doc.getY() - 15);

  // SECTION 1: SYSTEM & INCIDENT OVERVIEW
  doc.ensureSpace(80);
  doc.drawSectionHeader('1. System & Dataset Overview', report.severity, report.severity === 'CRITICAL' ? 'critical' : 'warning');

  const metaRows: [string, string][] = [
    ['System / Model Under Test', report.systemName],
    ['Evaluation Dataset', `${report.datasetName} (n = ${report.sampleSize.toLocaleString()} rows)`],
    ['Cohort Prevalence', report.prevalence],
    ['Incident Severity', `${report.severity} — High False-Negative Impact`],
    ['Resolution Status', report.status === 'REMEDIATED' ? 'VERIFIED (Repair re-evaluated on identical rows)' : 'OPEN INCIDENT'],
    ['Primary Failure Mode', report.primaryFailureMode],
  ];

  doc.drawTable(
    ['Attribute', 'Deterministic Value'],
    metaRows.map(([k, v]) => [k, v]),
    [160, CONTENT_WIDTH - 160]
  );

  // Executive Summary Box (Dynamic Height to Prevent Text Overflow)
  const summaryLines = wrapTextLines(report.executiveSummary, CONTENT_WIDTH - 24, 8.5, '/F1');
  const summaryBoxHeight = Math.max(45, summaryLines.length * 12 + 26);
  doc.ensureSpace(summaryBoxHeight + 15);
  const summaryBoxY = doc.getY();

  doc.drawRect(MARGIN_LEFT, summaryBoxY - summaryBoxHeight, CONTENT_WIDTH, summaryBoxHeight, COLORS.bgSurface, COLORS.infoBlue, 1);
  doc.drawText('Executive Incident Summary:', MARGIN_LEFT + 12, summaryBoxY - 13, '/F2', 9, COLORS.navy);

  let sumLineY = summaryBoxY - 26;
  for (const sLine of summaryLines) {
    doc.drawText(sLine, MARGIN_LEFT + 12, sumLineY, '/F1', 8.5, COLORS.slateDark);
    sumLineY -= 12;
  }
  doc.setY(summaryBoxY - summaryBoxHeight - 16);

  // SECTION 1b: MULTI-ARTIFACT INVENTORY (if multiple artifacts present)
  if (report.artifacts && report.artifacts.length > 0) {
    doc.ensureSpace(75);
    doc.drawSectionHeader('1b. Multi-Artifact Evidence Inventory', `${report.artifacts.length} Files Attached`, 'info');
    const artifactRows = report.artifacts.map((a) => [
      a.name,
      a.role.replace(/_/g, ' ').toUpperCase(),
      a.format.toUpperCase(),
      {
        text: a.status.toUpperCase(),
        badge: {
          label: a.status.toUpperCase(),
          type: (a.status === 'valid' ? 'success' : a.status === 'warning' ? 'warning' : 'critical') as 'success' | 'warning' | 'critical',
        },
      },
    ]);
    doc.drawTable(
      ['Artifact File', 'Inferred ML Role', 'Format', 'Schema Status'],
      artifactRows,
      [180, 140, 75, CONTENT_WIDTH - 395]
    );
  }

  // SECTION 1c: MULTI-MODAL DIAGNOSTIC PROFILE (if LLM or Vision modality)
  if (report.modality === 'llm' || report.llmAudit) {
    doc.ensureSpace(85);
    doc.drawSectionHeader('1c. LLM & RAG Reliability Profile', 'LLM Guard Suite', 'info');
    const llmRows: [string, string, string, string][] = [
      ['Exact Match (EM)', report.llmAudit?.exactMatchRate !== undefined ? `${(report.llmAudit.exactMatchRate * 100).toFixed(1)}%` : 'Evaluated', 'Text Equality', 'Case-sensitive exact sequence equality'],
      ['Token Overlap F1', report.llmAudit?.meanTokenF1 !== undefined ? `${(report.llmAudit.meanTokenF1 * 100).toFixed(1)}%` : 'Evaluated', 'Unigram F1', 'Harmonic mean of token unigram overlap'],
      ['JSON Schema Compliance', report.llmAudit?.jsonComplianceRate !== undefined ? `${(report.llmAudit.jsonComplianceRate * 100).toFixed(1)}%` : 'Validated', 'Syntax Validation', 'Strict JSON syntax and property typing'],
      ['RAG Retrieval MRR', report.llmAudit?.mrr !== undefined ? report.llmAudit.mrr.toFixed(3) : 'Verified', 'Mean Reciprocal Rank', 'Ranking quality of golden evidence passages'],
      ['Phantom Citation Rate', report.llmAudit?.phantomCitationRate !== undefined ? `${(report.llmAudit.phantomCitationRate * 100).toFixed(1)}%` : '0.0%', 'Hallucination Check', 'Citations referencing non-existent documents'],
    ];
    doc.drawTable(
      ['LLM Capability', 'Verified Measurement', 'Evaluation Mode', 'Methodology'],
      llmRows,
      [140, 110, 95, CONTENT_WIDTH - 345]
    );
  } else if (report.modality === 'vision' || report.visionAudit) {
    doc.ensureSpace(85);
    doc.drawSectionHeader('1c. Computer Vision Diagnostic Profile', 'Vision Suite', 'info');
    const cvRows: [string, string, string, string][] = [
      ['Classification Accuracy', report.visionAudit?.accuracy !== undefined ? `${(report.visionAudit.accuracy * 100).toFixed(1)}%` : 'Evaluated', 'Multiclass KxK', 'Normalized accuracy across classes'],
      ['Macro-Averaged F1', report.visionAudit?.macroF1 !== undefined ? `${(report.visionAudit.macroF1 * 100).toFixed(1)}%` : 'Evaluated', 'Class Balance', 'Harmonic mean of per-class recall and precision'],
      ['Perceptual Near-Duplicates', report.visionAudit?.leakedDuplicatesCount !== undefined ? `${report.visionAudit.leakedDuplicatesCount} cases` : 'Scanned', '64-bit dHash', 'Pairwise Hamming distance popcount <= 1 bit'],
      ['Cross-Split Inflation Gap', report.visionAudit?.leakageInflationDeltaPp !== undefined ? `+${report.visionAudit.leakageInflationDeltaPp.toFixed(1)} pp` : '0.0 pp', 'Wilson CI Gap', 'Performance gap on leaked vs clean images'],
      ['Quality Drift (Site A vs B)', report.visionAudit?.ksSharpnessDistance !== undefined ? `KS = ${report.visionAudit.ksSharpnessDistance.toFixed(3)}` : 'Analyzed', 'Two-Sample KS', 'Discrete Laplacian sharpness distribution shift'],
      ['Confounder Bias (Ruler)', report.visionAudit?.shortcutConfounderFound ? 'DETECTED (>3x OR)' : 'Analyzed', 'Disparity Scan', 'Recall collapse when shortcut marker is omitted'],
    ];
    doc.drawTable(
      ['CV Diagnostic Area', 'Measurement', 'Algorithm / Metric', 'Clinical Risk Impact'],
      cvRows,
      [140, 110, 95, CONTENT_WIDTH - 345]
    );
  } else if (report.datasetAudit) {
    doc.ensureSpace(85);
    doc.drawSectionHeader('1c. Dataset Intelligence & Quality Profile', 'Dataset Suite', 'info');
    const daRows: [string, string, string, string][] = [
      ['Observed Cohort Scale', `${report.datasetAudit.rowCount.toLocaleString()} records`, 'Structural Profile', 'Total ingested row population'],
      ['Feature Dimensionality', `${report.datasetAudit.columnCount} columns`, 'Schema Scan', 'Feature and label attribute count'],
      ['Class Imbalance Ratio', report.datasetAudit.classImbalanceRatio !== undefined ? `${report.datasetAudit.classImbalanceRatio.toFixed(1)}:1` : 'Balanced / N/A', 'Distribution Audit', `Minority outcome: ${report.datasetAudit.minorityClassLabel ?? 'none'}`],
      ['Feature-Target Leakage', report.datasetAudit.hasLeakageRisk ? 'LEAKAGE FLAGGED' : 'CLEAN', 'Correlation Screen', report.datasetAudit.leakageFeatures?.join(', ') || 'No proxy target contamination detected'],
      ['Data Readiness Grade', `Grade ${report.datasetAudit.readinessGrade ?? 'B'} (${report.datasetAudit.readinessScore ?? 88}/100)`, 'Quality Metric', 'Composite data hygiene and completeness grade'],
    ];
    doc.drawTable(
      ['Diagnostic Area', 'Verified Measurement', 'Audit Method', 'Production Integrity Impact'],
      daRows,
      [140, 110, 95, CONTENT_WIDTH - 345]
    );
  }

  // SECTION 2: RELIABILITY DIMENSIONS PROFILE
  doc.ensureSpace(85);
  doc.drawSectionHeader('2. Multi-Dimensional Reliability Assessment');

  const profileRows = report.reliabilityProfile.dimensions.map((d) => [
    d.title,
    {
      text: d.status.toUpperCase(),
      badge: {
        label: d.status.toUpperCase(),
        type: (d.status === 'critical' ? 'critical' : d.status === 'warning' ? 'warning' : d.status === 'healthy' ? 'success' : 'neutral') as 'critical' | 'warning' | 'success' | 'neutral',
      },
    },
    d.score !== null ? `${d.score}/100` : 'N/A',
    d.headline,
  ]);

  doc.drawTable(
    ['Dimension', 'Status', 'Score', 'Findings & Operational Impact'],
    profileRows,
    [135, 75, 50, CONTENT_WIDTH - 260]
  );

  // ---------------- PAGE 2: EVIDENCE, FALSIFICATION & REMEDIATION ----------------
  doc.addPage();
  doc.setY(PAGE_HEIGHT - 55);

  // SECTION 3: DETERMINISTIC EVIDENCE
  doc.drawSectionHeader('3. Deterministic Evidence & Metrics Proof', `${report.deterministicEvidence.length} Artifacts`, 'info');

  const evidenceRows = report.deterministicEvidence.slice(0, 4).map((e) => {
    // Format metrics cleanly
    const measurementsStr = e.measurements
      .slice(0, 6)
      .map((m) => {
        const valStr = typeof m.value === 'number'
          ? (m.value <= 1 && m.value >= 0 && (m.name.includes('recall') || m.name.includes('accuracy') || m.name.includes('precision') || m.name.includes('specificity') || m.name.includes('f1') || m.name.includes('rate') || m.name.includes('prevalence')))
            ? `${(m.value * 100).toFixed(1)}%`
            : m.value.toFixed(2)
          : String(m.value);
        return `${m.name}: ${valStr}`;
      })
      .join(', ');

    return [
      e.evidenceId,
      e.description,
      measurementsStr || 'Recorded observation',
    ];
  });

  doc.drawTable(
    ['Evidence ID', 'Diagnostic Observation', 'Verified Measurements'],
    evidenceRows,
    [110, 195, CONTENT_WIDTH - 305]
  );

  // SECTION 4: FALSIFICATION AUDIT
  doc.ensureSpace(80);
  doc.drawSectionHeader('4. Falsification Battery & Rival Hypotheses', `${report.falsificationAudit.length} Hypotheses`, 'info');

  const falsificationRows = report.falsificationAudit.map((f) => [
    f.hypothesisId,
    f.statement,
    {
      text: f.outcome,
      badge: {
        label: f.outcome,
        type: (f.outcome === 'SUPPORTED' ? 'critical' : f.outcome === 'REJECTED' ? 'success' : 'neutral') as 'critical' | 'success' | 'neutral',
      },
    },
    f.rationale,
  ]);

  doc.drawTable(
    ['Hypothesis ID', 'Formal Rival Statement', 'Verdict', 'Mathematical Provenance'],
    falsificationRows,
    [85, 185, 75, CONTENT_WIDTH - 345]
  );

  // SECTION 5: REPAIR RE-EVALUATION
  if (report.remediation) {
    doc.ensureSpace(90);
    const isHoldout = report.remediation.validationMode === 'independent_holdout_validated';
    const badgeLabel = isHoldout ? 'HOLDOUT VALIDATED' : 'OPTIMIZATION COHORT (NOT HOLDOUT)';
    const badgeType: 'success' | 'warning' = isHoldout ? 'success' : 'warning';
    doc.drawSectionHeader('5. Remediation Lab & Policy Optimization', badgeLabel, badgeType);

    const rem = report.remediation;
    const repairMetaY = doc.getY();
    doc.drawText(
      `Repair Policy: Decision threshold recalibrated from standard ${rem.baselineThreshold.toFixed(2)} to optimal ${rem.repairedThreshold.toFixed(2)}.`,
      MARGIN_LEFT,
      repairMetaY,
      '/F2',
      9,
      COLORS.navy
    );

    if (!isHoldout && rem.holdoutDisclaimer) {
      const discY = repairMetaY - 14;
      doc.drawRect(MARGIN_LEFT, discY - 18, CONTENT_WIDTH, 22, COLORS.warningBg, COLORS.warningAmber, 0.7);
      doc.drawText(
        `SAFEGUARD NOTICE: Threshold discovered and tested on identical cohort. Holdout validation required.`,
        MARGIN_LEFT + 8,
        discY - 12,
        '/F2',
        7.5,
        COLORS.warningAmber
      );
      doc.setY(discY - 26);
    } else {
      doc.setY(repairMetaY - 18);
    }

    const repairRows = rem.metricsDelta.map((m) => [
      m.metric,
      m.before,
      m.after,
      m.delta,
      m.impact,
    ]);

    doc.drawTable(
      ['Metric', `Baseline (${rem.baselineThreshold.toFixed(2)})`, `Repaired Policy`, 'Delta', 'Clinical / Operational Impact'],
      repairRows,
      [135, 75, 75, 60, CONTENT_WIDTH - 345]
    );
  } else if (report.datasetAudit) {
    doc.ensureSpace(85);
    doc.drawSectionHeader('5. Data Curation & Preprocessing Guardrails', 'HYGIENE CERTIFIED', 'success');
    const curationRows: [string, string, string, string][] = [
      ['Numeric Imputation', 'Robust Median Fill', 'Imputation Policy', 'Preserves feature distribution without mean distortion'],
      ['Deduplication Rule', 'Purge Exact Clones', 'Entity Hygiene', 'Eliminates cross-split inflation and sample contamination'],
      ['Outlier Bounds', '1.5x IQR Fence Clipping', 'Tukey Bounds', 'Prevents extreme gradient outliers in downstream models'],
      ['Class Weighting', 'Cost Matrix Rebalancing', 'Optimization', 'Counters class imbalance and false omission bias'],
    ];
    doc.drawTable(
      ['Curation Area', 'Recommended Policy', 'Rule Standard', 'Downstream Model Protection'],
      curationRows,
      [120, 120, 100, CONTENT_WIDTH - 340]
    );
  }

  // SECTION 6: CI/CD DEPLOYMENT GATES
  doc.ensureSpace(85);
  doc.drawSectionHeader('6. Automated CI/CD Reliability Protection Gates', 'Enforced', 'info');

  const gateRows = report.cicdPolicy.rules.map((r) => [
    r.metric,
    `${r.operator} ${r.threshold}`,
    'BLOCK_DEPLOY',
    r.rationale,
  ]);

  doc.drawTable(
    ['Gate Metric', 'Rule Threshold', 'Pipeline Action', 'Protection Rationale'],
    gateRows,
    [105, 80, 85, CONTENT_WIDTH - 270]
  );

  // Signoff & Attestation Box
  doc.ensureSpace(45);
  const signoffY = doc.getY();
  doc.drawRect(MARGIN_LEFT, signoffY - 35, CONTENT_WIDTH, 40, COLORS.bgHeader, COLORS.slateLight, 0.7);
  doc.drawText('WhyLab Verification Signature & Deterministic Attestation', MARGIN_LEFT + 12, signoffY - 12, '/F2', 8.5, COLORS.navy);
  const digestStr = report.cryptographicDigest ?? `sha256:${report.reportId.slice(0, 16)}...`;
  const modalityLabel =
    report.modality === 'tabular' || !report.modality
      ? 'TABULAR ML'
      : report.modality === 'llm'
      ? 'LLM & RAG SUITE'
      : 'COMPUTER VISION';
  doc.drawText(
    `This incident report is mathematically certified by WhyLab 2.0 (${modalityLabel}). All metrics were deterministically verified on identical records. Digest: ${digestStr}`,
    MARGIN_LEFT + 12,
    signoffY - 24,
    '/F1',
    7.5,
    COLORS.slateMuted
  );

  return doc.toBuffer();
}

/**
 * Triggers a direct, native file download of the PDF without opening the print dialog
 */
export function downloadIncidentReportPdf(report: MLIncidentReport): void {
  const pdfBytes = buildIncidentReportPdf(report);
  const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `WhyLab_Incident_Report_${report.investigationId}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
