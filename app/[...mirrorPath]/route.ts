import { NextResponse } from "next/server";
import { blobUrlForPublicPath } from "@/lib/route-lookup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    mirrorPath: string[];
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { mirrorPath } = await context.params;
  const publicPath = mirrorPath.join("/");
  const url = await blobUrlForPublicPath(publicPath);
  if (!url) {
    return NextResponse.json({ error: "Mirror artifact not found" }, { status: 404 });
  }
  const response = NextResponse.redirect(url, 307);
  response.headers.set("cache-control", "no-store");
  return response;
}
