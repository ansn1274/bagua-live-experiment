import { NextRequest, NextResponse } from "next/server";
import { findParticipantByRecovery, getSnapshotClient, readSnapshot } from "../../../lib/serverSnapshot";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const client = getSnapshotClient();
  if (!client) {
    return NextResponse.json({ ok: false, reason: "supabase_not_configured" });
  }

  try {
    const body = await request.json() as { codeOrId?: string };
    if (!body.codeOrId?.trim()) {
      return NextResponse.json({ ok: false, reason: "missing_code" }, { status: 400 });
    }
    const snapshot = await readSnapshot(client);
    const participant = findParticipantByRecovery(snapshot, body.codeOrId);
    if (!participant) {
      return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, participant });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: "recover_failed", detail: String(error) }, { status: 500 });
  }
}
