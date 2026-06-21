import { NextRequest, NextResponse } from "next/server";
import { getSnapshotClient, readSnapshot, sanitizeSnapshot, writeSnapshot } from "../../../lib/serverSnapshot";
import type { CloudSnapshot } from "../../../lib/types";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const client = getSnapshotClient();
  if (!client) {
    return NextResponse.json({ ok: false, reason: "supabase_not_configured" });
  }

  try {
    const participantId = request.nextUrl.searchParams.get("pid");
    const snapshot = await readSnapshot(client);
    return NextResponse.json({ ok: true, snapshot: sanitizeSnapshot(snapshot, participantId) });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: "snapshot_read_failed", detail: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const client = getSnapshotClient();
  if (!client) {
    return NextResponse.json({ ok: false, reason: "supabase_not_configured" });
  }

  try {
    const body = await request.json() as { snapshot?: CloudSnapshot };
    if (!body.snapshot) {
      return NextResponse.json({ ok: false, reason: "missing_snapshot" }, { status: 400 });
    }
    const snapshot = await writeSnapshot(client, body.snapshot);
    return NextResponse.json({ ok: true, snapshot: sanitizeSnapshot(snapshot) });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: "snapshot_write_failed", detail: String(error) }, { status: 500 });
  }
}
