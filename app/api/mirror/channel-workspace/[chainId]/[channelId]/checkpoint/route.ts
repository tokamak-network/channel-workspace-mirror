import { NextResponse } from "next/server";
import { latestCheckpointBlobUrl } from "@/lib/route-lookup";

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
  const url = await latestCheckpointBlobUrl(chainId, channelId);
  if (!url) {
    return NextResponse.json({ error: "Mirror checkpoint not found" }, { status: 404 });
  }
  return redirectToBlob(url);
}

function redirectToBlob(url: string) {
  const response = NextResponse.redirect(url, 307);
  response.headers.set("cache-control", "no-store");
  return response;
}
