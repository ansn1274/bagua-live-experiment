import { NextRequest, NextResponse } from "next/server";
import { getSnapshotClient, readSnapshotForVersion, readSnapshotVersion, sanitizeSnapshot, writeSnapshot } from "../../../lib/serverSnapshot";
import type { CloudSnapshot } from "../../../lib/types";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const client = getSnapshotClient();
  if (!client) {
    return NextResponse.json({ ok: false, reason: "supabase_not_configured" });
  }

  try {
    const participantId = request.nextUrl.searchParams.get("pid");
    const knownVersion = request.nextUrl.searchParams.get("version");
    const version = await readSnapshotVersion(client);
    if (knownVersion && knownVersion === version) {
      return NextResponse.json({ ok: true, unchanged: true, version });
    }
    const snapshot = await readSnapshotForVersion(client, version);
    return NextResponse.json({ ok: true, snapshot: sanitizeSnapshot(snapshot, participantId), version });
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
    const body = await request.json() as { snapshot?: CloudSnapshot; mode?: "participant" | "admin" };
    if (!body.snapshot) {
      return NextResponse.json({ ok: false, reason: "missing_snapshot" }, { status: 400 });
    }
    await writeSnapshot(client, body.snapshot, body.mode === "admin" ? "admin" : "participant");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: "snapshot_write_failed", detail: String(error) }, { status: 500 });
  }
}
