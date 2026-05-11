import { NextResponse } from "next/server";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "channel-workspace-mirror",
    version: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
  });
}
