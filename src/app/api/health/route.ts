import { NextResponse } from "next/server";
import { isSupabaseConfigured, getSupabaseConfig } from "@/lib/supabase/config";
import { checkService } from "@/lib/service-health";

export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get("deep") === "1") {
    const status = await checkService(getSupabaseConfig());
    const errorId = status.status === "ok" ? null : crypto.randomUUID();
    if (errorId)
      console.error(
        JSON.stringify({
          event: "bookforest_health_error",
          errorId,
          checks: status.checks,
          at: status.checkedAt,
        }),
      );
    return NextResponse.json(
      { service: "bookforest", version: "0.1.0", ...status, errorId },
      {
        status: status.status === "ok" ? 200 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
  return NextResponse.json(
    {
      service: "bookforest",
      version: "0.1.0",
      configured: isSupabaseConfigured(),
    },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
}
