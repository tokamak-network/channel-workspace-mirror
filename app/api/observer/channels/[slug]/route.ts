import { NextResponse } from "next/server";
import { getCachedObserverCostConfig, getCachedObserverDashboard } from "@/lib/observer/cached-queries";
import { apiDashboardOptions } from "@/lib/observer/request-options";

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const costConfig = await getCachedObserverCostConfig(slug);
  const dashboard = await getCachedObserverDashboard(slug, apiDashboardOptions(costConfig), costConfig, "api");
  if (!dashboard) {
    return NextResponse.json({ error: "Observer channel not found" }, { status: 404 });
  }
  return NextResponse.json(dashboard, {
    headers: cacheHeaders(costConfig.apiCacheTtlSeconds),
  });
}

function cacheHeaders(ttlSeconds: number) {
  return {
    "Cache-Control": `public, s-maxage=${ttlSeconds}, stale-while-revalidate=${ttlSeconds}`,
  };
}
