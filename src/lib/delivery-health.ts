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
  lastSuccessAt?: string | null;
  refreshCode?: string;
  source: "operator-pc" | "server-github";
}
export async function deliveryHealth(pendingRun?: number): Promise<DeliveryHealth> {
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
  const freshLocal =
    local?.configured &&
    Number.isFinite(observed) &&
    observed <= now + 60000 &&
    now - observed < 45 * 60000;
  if (
    local && freshLocal &&
    (!pendingRun || (local.runId ?? 0) >= pendingRun) &&
    local.code !== "GITHUB_CHECK_RUNNING" &&
    !["DELIVERY_MONITOR_STALE", "GITHUB_STATUS_UNAVAILABLE", "GITHUB_RATE_LIMITED"].includes(local.code)
  )
    return { ...local, source: "operator-pc" };
  // The PC may intentionally be off. Public GitHub metadata supplies a second
  // observer; a missing PC heartbeat alone must not invent a delivery failure.
  // Cache only fixed-repository public metadata, never authenticated user data.
  const readToken = process.env.BOOKFOREST_GITHUB_ACTIONS_READ_TOKEN;
  const result = await probeGithubDelivery({
    now,
    fetcher: (url, options) =>
      fetch(url, {
        ...options,
        headers: { ...options?.headers, ...(readToken ? { Authorization: `Bearer ${readToken}` } : {}) },
        cache: "force-cache",
        next: { revalidate: pendingRun || local?.code === "GITHUB_CHECK_RUNNING" ? 20 : 300 },
      }),
  });
  const knownRun = Math.max(pendingRun ?? 0, freshLocal && local?.code === "GITHUB_CHECK_RUNNING" ? local.runId ?? 0 : 0);
  const previousRun = result.runId !== null && result.runId < knownRun;
  const refreshCode = knownRun && result.runId === null ? result.code : undefined;
  const lastSuccessAt = [result.notifiedAt, local?.lastSuccessAt, local?.notifiedAt]
    .filter((value): value is string => !!value && Number.isFinite(Date.parse(value)) && Date.parse(value) <= now + 60000)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
  const code = previousRun || refreshCode ? "GITHUB_CHECK_RUNNING" : result.code;
  return {
    configured: true,
    healthy: code === "OK",
    code,
    checkedAt: new Date().toISOString(),
    observedAt: new Date(now).toISOString(),
    notifiedAt: previousRun ? null : result.notifiedAt,
    lastSuccessAt,
    ...(refreshCode ? { refreshCode } : {}),
    runId: knownRun ? Math.max(knownRun, result.runId ?? 0) : result.runId,
    source: "server-github",
  };
}
