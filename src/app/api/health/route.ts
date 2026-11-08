import { NextResponse } from "next/server";
import { isSupabaseConfigured, getSupabaseConfig } from "@/lib/supabase/config";
import { checkService } from "@/lib/service-health";
import { releaseIdentity } from "@/lib/release";
import {consumeApiBudget} from "@/lib/api-budget";

export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get("deep") === "1") {
    const client=request.headers.get("x-real-ip")??request.headers.get("x-vercel-forwarded-for")??"unknown";
    const budget=await consumeApiBudget("health",client);
    if(!budget.allowed)return NextResponse.json({service:"bookforest",...releaseIdentity(),configured:isSupabaseConfigured(),status:"degraded",checkedAt:new Date().toISOString(),checks:{database:false,authentication:false},diagnostics:{stage:budget.unavailable?"application":"rate_limit",databaseMs:0,authenticationMs:0},errorId:crypto.randomUUID()},{status:budget.unavailable?503:429,headers:{"Cache-Control":"no-store","Retry-After":String(budget.retryAfter)}});
    let status;
    try { status = await checkService(getSupabaseConfig()); }
    catch { status = { configured: isSupabaseConfigured(), status: "degraded", checkedAt: new Date().toISOString(), checks: {database: false, authentication: false}, diagnostics: {stage: "application", databaseMs: 0, authenticationMs: 0} }; }
    const errorId = status.status === "ok" ? null : crypto.randomUUID();
    if (errorId)
      console.error(
        JSON.stringify({
          event: "bookforest_health_error",
          errorId,
          checks: status.checks,
          at: status.checkedAt,
          diagnostics: status.diagnostics,
          release: releaseIdentity(),
        }),
      );
    return NextResponse.json(
      { service: "bookforest", ...releaseIdentity(), ...status, errorId },
      {
        status: status.status === "ok" ? 200 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
  return NextResponse.json(
    {
      service: "bookforest",
      ...releaseIdentity(),
      configured: isSupabaseConfigured(),
    },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
}
