import { NextResponse } from "next/server";
import { hasAdminToken, isAdminAuthorized } from "@/lib/admin-auth";
import { getDatabaseHealth } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const db = await getDatabaseHealth();
  const checks = {
    database: db.ok,
    blobToken: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    adminToken: hasAdminToken(),
  };
  const ok = Object.values(checks).every(Boolean);

  return NextResponse.json(
    {
      ok,
      checks,
      databaseError: db.ok ? null : db.error,
    },
    { status: ok ? 200 : 503 },
  );
}
