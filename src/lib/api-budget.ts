import "server-only";
import { createHmac } from "node:crypto";
import { getSupabaseConfig } from "./supabase/config";
export async function consumeApiBudget(
  scope: "health" | "books",
  subject: string,
) {
  const key = process.env.BOOKFOREST_LIMITER_SECRET,
    config = getSupabaseConfig();
  if (!key || !/^[a-f0-9]{64}$/.test(key) || !config)
    return { allowed: false, retryAfter: 60, unavailable: true };
  const now = Date.now(),
    digest = createHmac("sha256", Buffer.from(key, "hex"))
      .update(
        new Date(now).toISOString().slice(0, 10) +
          ":" +
          scope +
          ":" +
          subject.slice(0, 200),
      )
      .digest("hex");
  const payload = JSON.stringify({
      scope,
      subject: digest,
      at: Math.floor(now / 1000),
    }),
    signature = createHmac("sha256", Buffer.from(key, "hex"))
      .update(payload)
      .digest("hex");
  try {
    const response = await fetch(
      config.url + "/rest/v1/rpc/consume_api_budget",
      {
        method: "POST",
        headers: { apikey: config.key, "Content-Type": "application/json" },
        body: JSON.stringify({ p_payload: payload, p_signature: signature }),
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      },
    );
    const r = await response.json();
    if (!response.ok || typeof r.allowed !== "boolean")
      throw Error("BUDGET_UNAVAILABLE");
    return {
      allowed: r.allowed,
      retryAfter: r.allowed ? 0 : 60,
      unavailable: false,
    };
  } catch {
    return { allowed: false, retryAfter: 60, unavailable: true };
  }
}
