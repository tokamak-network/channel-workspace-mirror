import { NextResponse } from "next/server";
import { getDatabaseHealth } from "@/lib/db";

export const runtime = "nodejs";

function isAuthorized(request: Request) {
  const token = process.env.MIRROR_ADMIN_TOKEN;
  if (!token) {
    return false;
  }
  const authorization = request.headers.get("authorization") ?? "";
  return authorization === `Bearer ${token}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const db = await getDatabaseHealth();
  const checks = {
    database: db.ok,
    blobToken: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    adminToken: Boolean(process.env.MIRROR_ADMIN_TOKEN),
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
