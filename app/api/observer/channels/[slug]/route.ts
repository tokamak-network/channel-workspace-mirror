import { NextResponse } from "next/server";
import { getObserverDashboard } from "@/lib/observer/queries";

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const dashboard = await getObserverDashboard(slug, {
    includeIncidents: true,
    listMode: "none",
  });
  if (!dashboard) {
    return NextResponse.json({ error: "Observer channel not found" }, { status: 404 });
  }
  return NextResponse.json(dashboard);
}
