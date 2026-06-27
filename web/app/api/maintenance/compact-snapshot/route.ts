import { NextResponse } from "next/server";
import { compactStoredSnapshot, getSnapshotClient } from "../../../../lib/serverSnapshot";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST() {
  const client = getSnapshotClient();
  if (!client) {
    return NextResponse.json({ ok: false, reason: "supabase_not_configured" }, { status: 503 });
  }

  try {
    const result = await compactStoredSnapshot(client);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const detail = error instanceof Error ? error.message : JSON.stringify(error);
    return NextResponse.json({ ok: false, reason: "snapshot_compaction_failed", detail }, { status: 500 });
  }
}
