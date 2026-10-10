import { NextRequest, NextResponse } from 'next/server';
import { listInvestigations, saveInvestigation } from '@/core/investigation/store';
import type { Investigation } from '@/core/domain/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const list = listInvestigations();
    return NextResponse.json({
      investigations: list,
      count: list.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to query investigations';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      investigation?: Investigation;
      csvContent?: string;
    };

    if (!body || !body.investigation || !body.investigation.id) {
      return NextResponse.json(
        { error: 'Valid investigation payload is required.' },
        { status: 400 }
      );
    }

    saveInvestigation(body.investigation, body.csvContent);

    return NextResponse.json({
      success: true,
      id: body.investigation.id,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to persist investigation';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
