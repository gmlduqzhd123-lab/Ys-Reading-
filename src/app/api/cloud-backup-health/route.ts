import { NextResponse } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
export async function GET() {
  const c = getSupabaseConfig(),
    headers = { "Cache-Control": "no-store" };
  try {
    if (!c) throw Error();
    const r = await fetch(c.url + "/rest/v1/rpc/service_cloud_backup_health", {
      method: "POST",
      headers: { apikey: c.key, "Content-Type": "application/json" },
      body: "{}",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) throw Error();
    return NextResponse.json(await r.json(), { headers });
  } catch {
    return NextResponse.json(
      { healthy: false, code: "CLOUD_CHECK_UNAVAILABLE" },
      { status: 503, headers },
    );
  }
}
