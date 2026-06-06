import { NextResponse } from "next/server";
import { getCachedObserverCostConfig, getCachedObserverEvents } from "@/lib/observer/cached-queries";

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? "100");
  const costConfig = await getCachedObserverCostConfig(slug);
  const events = await getCachedObserverEvents(slug, {
    group: url.searchParams.get("group") ?? undefined,
    event: url.searchParams.get("event") ?? undefined,
    limit: Math.min(Number.isFinite(limit) ? limit : 100, costConfig.eventListLimit),
  }, costConfig);
  if (!events) {
    return NextResponse.json({ error: "Observer channel not found" }, { status: 404 });
  }
  return NextResponse.json({ events }, {
    headers: {
      "Cache-Control": `public, s-maxage=${costConfig.apiCacheTtlSeconds}, stale-while-revalidate=${costConfig.apiCacheTtlSeconds}`,
    },
  });
}
