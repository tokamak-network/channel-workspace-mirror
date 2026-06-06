import { NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin-auth";
import {
  getIndexerRuntimeConfig,
  updateIndexerRuntimeConfig,
  type IndexerRuntimeConfigInput,
} from "@/lib/indexer/config";
import { DEFAULT_OBSERVER_CHANNEL } from "@/lib/observer/config";
import { resolveObserverCostConfig } from "@/lib/observer/cost-config";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const channelSlug = url.searchParams.get("channel") ?? DEFAULT_OBSERVER_CHANNEL.slug;
  const config = await getIndexerRuntimeConfig(channelSlug);
  const resolvedObserverCostConfig = resolveObserverCostConfig(config);
  return NextResponse.json({ ok: true, config, resolvedObserverCostConfig });
}

export async function PUT(request: Request) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json() as IndexerRuntimeConfigInput & { channelSlug?: string };
    const channelSlug = body.channelSlug ?? DEFAULT_OBSERVER_CHANNEL.slug;
    const config = await updateIndexerRuntimeConfig(channelSlug, body);
    const resolvedObserverCostConfig = resolveObserverCostConfig(config);
    return NextResponse.json({ ok: true, config, resolvedObserverCostConfig });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
