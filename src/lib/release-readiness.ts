import "server-only";
import { getSupabaseConfig } from "./supabase/config";
export async function releaseReadiness() {
  const config = getSupabaseConfig();
  if (!config) return { database: false, worker: false, passwordSafety: false };
  const read = async (url: string, body?: string) => {
    try {
      const r = await fetch(url, {
        method: body ? "POST" : "GET",
        headers: { apikey: config.key, "Content-Type": "application/json" },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      });
      return r.ok ? await r.json() : null;
    } catch {
      return null;
    }
  };
  const [db, w] = await Promise.all([
    read(config.url + "/rest/v1/rpc/service_release_contract", "{}"),
    read(config.url + "/functions/v1/account-operations?health=1"),
  ]);
  return {
    database:
      db?.protocol === 2 &&
      db.readingDrafts === true &&
      db.signedApiBudget === true &&
      db.monitorDiagnostics === true &&
      db.recoveryReadiness === true &&
      db.exportJobs === true,
    operations:db?.monitorRechecks===true&&db.cloudBackup===true&&db.batchExports===true&&db.learningSignals===true&&db.scopeCache===true&&db.coherentExports===true&&db.studentView===true,
    worker:
      w?.service === "bookforest-account-worker" &&
      typeof db?.minimumWorkerProtocol === "number" &&
      w.protocol >= db.minimumWorkerProtocol,
    passwordSafety: w?.passwordSafety === true,
    passwordSafetyEnabled: w?.passwordSafetyEnabled === true,
  };
}
