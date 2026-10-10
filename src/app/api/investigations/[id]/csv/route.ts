import { NextRequest, NextResponse } from 'next/server';
import { getInvestigationCsv } from '@/core/investigation/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const csv = getInvestigationCsv(id);

    if (!csv) {
      return NextResponse.json(
        { error: `Raw dataset CSV for investigation '${id}' was not found.` },
        { status: 404 }
      );
    }

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `inline; filename="dataset-${id}.csv"`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error retrieving dataset CSV';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
