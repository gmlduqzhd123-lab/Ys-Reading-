// This policy never reads OAuth tokens. A real project-scoped MCP call proves readiness.
const minute = 60000;
export const safeAgentCode = (value) => ["BACKUP_CREDENTIAL_EXPIRED","BACKUP_PERMISSION_DENIED","BACKUP_CREDENTIAL_INVALID","BACKUP_TRANSPORT_UNAVAILABLE","BACKUP_TRANSPORT_FAILED","BACKUP_RESPONSE_INVALID","OK","MCP_AUTH_REQUIRED","MCP_TIMEOUT","MCP_UNAVAILABLE","MCP_REQUEST_FAILED","MCP_TOOL_FAILED","MCP_RESPONSE_INVALID","PROJECT_SCOPE_MISMATCH","RECOVERY_KEY_MISSING","BACKUP_FAILED","BACKUP_RUN_FAILED","BACKUP_CODEX_UNAVAILABLE","SNAPSHOT_READ_FAILED","PRIVACY_CHECKPOINT_READ_FAILED","BACKUP_ALREADY_RUNNING"].includes(value) ? value : "BACKUP_FAILED";
export function backupDue(state, now, request) {
  if (request && Date.parse(request.requestedAt) <= now && now - Date.parse(request.requestedAt) < 86400000 && request.id !== state.completedRequest) return true;
  const verified = Date.parse(state.lastVerifiedAt);
  const kst = new Date(now + 9 * 3600000);
  let cutoff = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), 10);
  if (now < cutoff) cutoff -= 86400000;
  return !Number.isFinite(verified) || verified < cutoff || state.needsRecovery === true;
}
/** @returns {Promise<{skipped?: boolean, ok?: boolean, code?: string, backedUp?: boolean, reportDelivered?: boolean}>} */
export async function runBackupAgent({ state, now = Date.now(), request, save, report, probe, backup }) {
  const due = backupDue(state, now, request);
  const manual = request && request.id !== state.completedRequest && Date.parse(request.requestedAt) <= now && now - Date.parse(request.requestedAt) < 86400000;
  const newRequest = manual && request.id !== state.lastRequestSeen;
  if (!newRequest && Date.parse(state.nextCheckAt) > now && (!due || state.needsRecovery)) return { skipped: true };
  if (manual) state.lastRequestSeen = request.id;
  const persist = () => save(state);
  async function signal(status, code, phase) {
    state.state = status; state.code = code; state.checkedAt = new Date().toISOString();
    persist();
    try { await report(status, code, phase); state.reportDelivered = true; }
    catch { state.reportDelivered = false; }
    persist();
  }
  async function fail(error, phase) {
    const code = safeAgentCode(error?.message);
    state.failures = Math.min(10, (state.failures || 0) + 1);
    state.needsRecovery = true;
    state.nextCheckAt = new Date(now + (code === "MCP_AUTH_REQUIRED" ? 30 : Math.min(60, 15 * 2 ** (state.failures - 1))) * minute).toISOString();
    await signal(["MCP_AUTH_REQUIRED","BACKUP_CREDENTIAL_EXPIRED","BACKUP_PERMISSION_DENIED"].includes(code) ? "auth_required" : phase === "probe" ? "retry_wait" : "backup_failed", code, phase);
    return { ok: false, code };
  }
  try { await probe(); } catch (e) { return fail(e, "probe"); }
  state.failures = 0;
  await signal("ready", "OK", "probe");
  if (due) {
    state.needsRecovery = true;
    await signal("backing_up", "OK", "backup");
    try {
      const result = await backup();
      if (result?.ok !== true || result?.verified !== true) throw Error(result?.code || "BACKUP_RUN_FAILED");
      state.lastVerifiedAt = new Date().toISOString();
      state.needsRecovery = false;
      if (manual) state.completedRequest = request.id;
    } catch (e) { return fail(e, "backup"); }
    await signal("completed", "OK", "backup");
  }
  // If the independent channel was unreachable, retry delivery within 15 minutes.
  state.nextCheckAt = new Date(Date.now() + (state.reportDelivered ? 60 : 15) * minute).toISOString();
  persist();
  return { ok: true, backedUp: due, reportDelivered: state.reportDelivered };
}
