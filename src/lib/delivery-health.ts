import "server-only";
import { getSupabaseConfig } from "./supabase/config";
import { probeGithubDelivery } from "../../scripts/lib/delivery-monitor.mjs";
export interface DeliveryHealth {
  configured: boolean;
  healthy: boolean;
  code: string;
  checkedAt: string;
  observedAt: string | null;
  notifiedAt: string | null;
  runId: number | null;
  source: "operator-pc" | "server-github";
}
export async function deliveryHealth(): Promise<DeliveryHealth> {
  const now = Date.now();
  let local: DeliveryHealth | null = null;
  try {
    const c = getSupabaseConfig();
    if (c) {
      const r = await fetch(c.url + "/rest/v1/rpc/service_delivery_health", {
        method: "POST",
        headers: { apikey: c.key, "Content-Type": "application/json" },
        body: "{}",
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (r.ok) local = await r.json();
    }
  } catch {}
  const observed = Date.parse(local?.observedAt ?? "");
  if (
    local?.configured &&
    Number.isFinite(observed) &&
    observed <= now + 60000 &&
    now - observed < 45 * 60000
  )
    return { ...local, source: "operator-pc" };
  // The PC may intentionally be off. Public GitHub metadata supplies a second
  // observer; a missing PC heartbeat alone must not invent a delivery failure.
  // Cache only fixed-repository public metadata, never authenticated user data.
  const result = await probeGithubDelivery({
    now,
    fetcher: (url, options) =>
      fetch(url, {
        ...options,
        cache: "force-cache",
        next: { revalidate: 300 },
      }),
  });
  return {
    configured: true,
    healthy: result.code === "OK",
    code: result.code,
    checkedAt: new Date().toISOString(),
    observedAt: new Date(now).toISOString(),
    notifiedAt: result.notifiedAt,
    runId: result.runId,
    source: "server-github",
  };
}
