import { NextResponse } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
export async function GET() {
  try {
    const c = getSupabaseConfig();
    if (!c) throw Error("UNAVAILABLE");
    const r = await fetch(c.url + "/rest/v1/rpc/service_backup_health", {
      method: "POST",
      headers: { apikey: c.key, "Content-Type": "application/json" },
      body: "{}",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) throw Error("UNAVAILABLE");
    return NextResponse.json(await r.json(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { healthy: false, code: "BACKUP_CHECK_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
