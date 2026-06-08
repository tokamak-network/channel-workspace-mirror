import { NextResponse } from "next/server";
import { mirrorRedirectCacheHeader } from "@/lib/cache-policy";
import { latestDeltaBlobUrl } from "@/lib/route-lookup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    chainId: string;
    channelId: string;
    range: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { chainId, channelId, range } = await context.params;
  const url = await latestDeltaBlobUrl(chainId, channelId, range);
  if (!url) {
    return NextResponse.json({ error: "Mirror delta not found" }, { status: 404 });
  }
  return redirectToBlob(url);
}

function redirectToBlob(url: string) {
  const response = NextResponse.redirect(url, 307);
  response.headers.set("cache-control", mirrorRedirectCacheHeader());
  return response;
}
