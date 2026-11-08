import { createClient } from "@supabase/supabase-js";
export type ServiceHealth = {
  configured: boolean;
  status: "ok" | "degraded";
  checkedAt: string;
  checks: { database: boolean; authentication: boolean };
  diagnostics: { stage: string; databaseMs: number; authenticationMs: number };
};
export async function checkService(
  config: { url: string; key: string } | null,
): Promise<ServiceHealth> {
  let database = false,
    authentication = false;
  let databaseMs = 0, authenticationMs = 0, stage = "configuration";
  if (config) {
    const c = createClient(config.url, config.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await Promise.allSettled([
      (async () => {
        const started = performance.now();
        try {
        const r = await c
          .rpc("service_probe")
          .abortSignal(AbortSignal.timeout(5000));
        database = !r.error && r.data === true;
        if (!database) stage = r.error?.code === "PGRST003" ? "database_pool" : "database";
        } catch { stage = "database_transport"; }
        finally { databaseMs = Math.min(60000, Math.round(performance.now() - started)); }
      })(),
      (async () => {
        const started = performance.now();
        try {
        const r = await fetch(config.url + "/auth/v1/health", {
          headers: { apikey: config.key },
          signal: AbortSignal.timeout(5000),
          cache: "no-store",
        });
        authentication = r.ok;
        } catch { authentication = false; }
        finally { authenticationMs = Math.min(60000, Math.round(performance.now() - started)); }
      })(),
    ]);
  }
  stage = database && authentication ? "ok" : !config ? "configuration" : !database ? stage : "authentication";
  return {
    configured: !!config,
    status: database && authentication ? "ok" : "degraded",
    checkedAt: new Date().toISOString(),
    checks: { database, authentication },
    diagnostics: { stage, databaseMs, authenticationMs },
  };
}
