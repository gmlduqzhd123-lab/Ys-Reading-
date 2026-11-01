import { createClient } from "@supabase/supabase-js";
export type ServiceHealth = {
  configured: boolean;
  status: "ok" | "degraded";
  checkedAt: string;
  checks: { database: boolean; authentication: boolean };
};
export async function checkService(
  config: { url: string; key: string } | null,
): Promise<ServiceHealth> {
  let database = false,
    authentication = false;
  if (config) {
    const c = createClient(config.url, config.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await Promise.allSettled([
      (async () => {
        const r = await c
          .rpc("service_probe")
          .abortSignal(AbortSignal.timeout(5000));
        database = !r.error && r.data === true;
      })(),
      (async () => {
        const r = await fetch(config.url + "/auth/v1/health", {
          headers: { apikey: config.key },
          signal: AbortSignal.timeout(5000),
          cache: "no-store",
        });
        authentication = r.ok;
      })(),
    ]);
  }
  return {
    configured: !!config,
    status: database && authentication ? "ok" : "degraded",
    checkedAt: new Date().toISOString(),
    checks: { database, authentication },
  };
}
