import { NextRequest, NextResponse } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { sameOrigin } from "@/lib/request-origin";
import { consumeApiBudget } from "@/lib/api-budget";
const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
};
export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request))
      return NextResponse.json(
        { code: "SHARE_UNAVAILABLE" },
        { status: 403, headers },
      );
    const raw = await request.text();
    if (raw.length > 1000)
      return NextResponse.json(
        { code: "SHARE_UNAVAILABLE" },
        { status: 400, headers },
      );
    const v = JSON.parse(raw);
    if (typeof v.token !== "string" || !/^[a-f0-9]{64}$/.test(v.token))
      return NextResponse.json(
        { code: "SHARE_UNAVAILABLE" },
        { status: 404, headers },
      );
    const budget = await consumeApiBudget(
      "health",
      "family:" +
        (request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown"),
    );
    if (!budget.allowed)
      return NextResponse.json(
        { code: "SHARE_RETRY" },
        {
          status: budget.unavailable ? 503 : 429,
          headers: { ...headers, "Retry-After": String(budget.retryAfter) },
        },
      );
    const config = getSupabaseConfig();
    if (!config)
      return NextResponse.json(
        { code: "SHARE_RETRY" },
        { status: 503, headers },
      );
    const r = await fetch(config.url + "/rest/v1/rpc/family_portfolio", {
      method: "POST",
      headers: { apikey: config.key, "Content-Type": "application/json" },
      body: JSON.stringify({ p_token: v.token }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok)
      return NextResponse.json(
        { code: "SHARE_UNAVAILABLE" },
        { status: 404, headers },
      );
    return NextResponse.json(await r.json(), { headers });
  } catch {
    return NextResponse.json(
      { code: "SHARE_UNAVAILABLE" },
      { status: 404, headers },
    );
  }
}
