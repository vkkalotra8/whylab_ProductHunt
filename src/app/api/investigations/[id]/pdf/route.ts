import { NextResponse } from 'next/server';
import { getInvestigation } from '@/core/investigation/store';
import { generateIncidentReport } from '@/server/export/incident-report';
import { buildIncidentReportPdf } from '@/server/export/pdf-generator';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const inv = getInvestigation(id);
  if (!inv) {
    return NextResponse.json({ error: 'Investigation not found' }, { status: 404 });
  }

  const report = generateIncidentReport(inv);
  const pdfBytes = buildIncidentReportPdf(report);

  return new Response(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="WhyLab_Incident_Report_${id}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
