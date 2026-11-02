import { NextResponse } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
export async function GET() {
  const config = getSupabaseConfig();
  if (!config)
    return NextResponse.json(
      { monitor: null },
      { headers: { "Cache-Control": "no-store" } },
    );
  try {
    const r = await fetch(config.url + "/rest/v1/rpc/service_monitor_status", {
      method: "POST",
      headers: { apikey: config.key, "Content-Type": "application/json" },
      body: "{}",
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) throw Error("UNAVAILABLE");
    return NextResponse.json(
      { monitor: await r.json() },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { monitor: null },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
