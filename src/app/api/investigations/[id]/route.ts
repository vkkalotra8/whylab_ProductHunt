import { NextRequest, NextResponse } from 'next/server';
import { getInvestigation, deleteInvestigation } from '@/core/investigation/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const inv = getInvestigation(id);

    if (!inv) {
      return NextResponse.json(
        { error: `Investigation '${id}' was not found.` },
        { status: 404 }
      );
    }

    return NextResponse.json({ investigation: inv });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error retrieving investigation';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deleted = deleteInvestigation(id);

    return NextResponse.json({ success: deleted, id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error deleting investigation';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
