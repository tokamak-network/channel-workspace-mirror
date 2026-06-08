import { NextResponse } from "next/server";
import { mirrorRedirectCacheHeader } from "@/lib/cache-policy";
import { latestManifestBlobUrl } from "@/lib/route-lookup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    chainId: string;
    channelId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { chainId, channelId } = await context.params;
  const url = await latestManifestBlobUrl(chainId, channelId);
  if (!url) {
    return NextResponse.json({ error: "Mirror manifest not found" }, { status: 404 });
  }
  return redirectToBlob(url);
}

function redirectToBlob(url: string) {
  const response = NextResponse.redirect(url, 307);
  response.headers.set("cache-control", mirrorRedirectCacheHeader());
  return response;
}
