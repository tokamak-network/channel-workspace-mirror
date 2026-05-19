import { NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { updateIncident, type IncidentInput } from "@/lib/observer/incidents";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = await request.json() as IncidentInput;
    const incident = await updateIncident(id, body);
    return NextResponse.json({ ok: true, incident });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
