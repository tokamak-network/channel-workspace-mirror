import { NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { createIncident, listAdminIncidents, type IncidentInput } from "@/lib/observer/incidents";
import { DEFAULT_OBSERVER_CHANNEL } from "@/lib/observer/config";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const channelSlug = url.searchParams.get("channel") ?? DEFAULT_OBSERVER_CHANNEL.slug;
    const incidents = await listAdminIncidents(channelSlug);
    return NextResponse.json({ ok: true, incidents });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json() as IncidentInput;
    const incident = await createIncident(body);
    return NextResponse.json({ ok: true, incident });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
