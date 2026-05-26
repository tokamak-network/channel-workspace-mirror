import { NextResponse } from "next/server";
import { blobUrlForPublicPath } from "@/lib/route-lookup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOT_MIRROR_PATHS = new Set(["favicon.ico", "sitemap.xml"]);

type RouteContext = {
  params: Promise<{
    mirrorPath: string[];
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { mirrorPath } = await context.params;
  const publicPath = mirrorPath.join("/");
  if (publicPath === "robots.txt") {
    return new Response("User-agent: *\nAllow: /\n", {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  if (NOT_MIRROR_PATHS.has(publicPath)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const url = await blobUrlForPublicPath(publicPath);
  if (!url) {
    return NextResponse.json({ error: "Mirror artifact not found" }, { status: 404 });
  }
  const response = NextResponse.redirect(url, 307);
  response.headers.set("cache-control", "no-store");
  return response;
}
