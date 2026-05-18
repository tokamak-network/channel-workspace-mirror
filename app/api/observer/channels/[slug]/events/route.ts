import { NextResponse } from "next/server";
import { getObserverEvents } from "@/lib/observer/queries";

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? "100");
  const events = await getObserverEvents(slug, {
    group: url.searchParams.get("group") ?? undefined,
    event: url.searchParams.get("event") ?? undefined,
    limit: Number.isFinite(limit) ? limit : 100,
  });
  if (!events) {
    return NextResponse.json({ error: "Observer channel not found" }, { status: 404 });
  }
  return NextResponse.json({ events });
}
