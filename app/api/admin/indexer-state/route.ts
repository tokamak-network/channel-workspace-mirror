import { NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { getIndexerRunState } from "@/lib/indexer/config";
import { DEFAULT_OBSERVER_CHANNEL } from "@/lib/observer/config";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const channelSlug = url.searchParams.get("channel") ?? DEFAULT_OBSERVER_CHANNEL.slug;
  const state = await getIndexerRunState(channelSlug);
  return NextResponse.json({ ok: true, state });
}
