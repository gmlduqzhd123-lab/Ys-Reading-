import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import {
  defaultVault,
  vaultKey,
  encryptBackup,
  decryptBackup,
  projectRef,
} from "./operator-vault.mjs";
import { acquireBackupLock } from "./backup-lock.mjs";
export const machineFile = "backup-machine.bfcredential";
export const newMachineToken = () => "bfm1_" + randomBytes(32).toString("hex");
export const machineTokenHash = (t) =>
  createHash("sha256").update(t).digest("hex");
export function saveMachine(directory, key, value) {
  const file = path.join(directory, machineFile);
  fs.writeFileSync(file + ".tmp", encryptBackup(value, key), { mode: 0o600 });
  fs.renameSync(file + ".tmp", file);
}
export function machineTransport(
  credential,
  {
    fetcher = fetch,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  } = {},
) {
  const url = `https://${projectRef}.supabase.co`;
  if (
    credential?.projectRef !== projectRef ||
    credential.url !== url ||
    !/^[a-f0-9-]{36}$/i.test(credential.id ?? "") ||
    !/^bfm1_[a-f0-9]{64}$/.test(credential.token ?? "") ||
    !credential.apiKey
  )
    throw Error("BACKUP_CREDENTIAL_INVALID");
  const operations = new Set([
    "health",
    "rotate",
    "snapshot",
    "privacy",
    "attempt",
    "receipt",
    "cloud-latest",
    "cloud-download",
    "cloud-verified",
    "cloud-config",
    "cloud-register",
    "copy-receipt",
  ]);
  async function request(operation, payload = {}) {
    if (!operations.has(operation)) throw Error("BACKUP_OPERATION_FORBIDDEN");
    for (let attempt = 0; attempt < 3; attempt++) {
      let r;
      try {
        r = await fetcher(url + "/rest/v1/rpc/backup_machine_request", {
          method: "POST",
          headers: {
            apikey: credential.apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            p_project: projectRef,
            p_credential: credential.id,
            p_token: credential.token,
            p_operation: operation,
            p_payload: payload,
          }),
          redirect: "error",
          cache: "no-store",
          signal: AbortSignal.timeout(55000),
        });
      } catch {
        if (attempt === 2) throw Error("BACKUP_TRANSPORT_UNAVAILABLE");
      }
      if (r?.ok) {
        try {
          return await r.json();
        } catch {
          throw Error("BACKUP_RESPONSE_INVALID");
        }
      }
      if (r && ![408, 429, 500, 502, 503, 504].includes(r.status))
        throw Error(
          r.status === 401 || r.status === 403
            ? "BACKUP_PERMISSION_DENIED"
            : "BACKUP_REQUEST_REJECTED",
        );
      if (attempt === 2) throw Error("BACKUP_TRANSPORT_FAILED");
      await sleep(500 * 2 ** attempt);
    }
  }
  return {
    mode: "machine",
    request,
    async call(tool) {
      if (tool !== "get_project_url") throw Error("BACKUP_OPERATION_FORBIDDEN");
      const h = await request("health");
      if (
        h?.protocol !== 1 ||
        h.projectRef !== projectRef ||
        h.mode !== "machine"
      )
        throw Error("PROJECT_SCOPE_MISMATCH");
      return { url };
    },
    close() {},
  };
}
export async function rotateMachineCredential(
  credential,
  { save, now = Date.now(), fetcher = fetch, force = false },
) {
  if (credential.pendingToken) {
    const pending = { ...credential, token: credential.pendingToken };
    try {
      await machineTransport(pending, { fetcher }).call("get_project_url");
      credential = pending;
      delete credential.pendingToken;
      credential.rotatedAt = new Date(now).toISOString();
      await save(credential);
      return credential;
    } catch (e) {
      if (e.message !== "BACKUP_PERMISSION_DENIED") throw e;
    }
  }
  if (
    credential.pendingToken ||
    force ||
    now - Date.parse(credential.rotatedAt) > 30 * 86400000
  ) {
    const token = credential.pendingToken ?? newMachineToken();
    credential = { ...credential, pendingToken: token };
    await save(credential);
    await machineTransport(credential, { fetcher }).request("rotate", {
      nextHash: machineTokenHash(token),
    });
    credential = {
      ...credential,
      token,
      rotatedAt: new Date(now).toISOString(),
    };
    delete credential.pendingToken;
    await save(credential);
  }
  return credential;
}
// Crash-safe rotation: persist both keys before changing the server. The previous
// key has a bounded grace period; revocation applies to both immediately.
export async function openBackupAccess({
  directory = defaultVault(),
  now = Date.now(),
  fetcher = fetch,
  rotate = false,
} = {}) {
  const key = vaultKey(directory, { create: false }),
    file = path.join(directory, machineFile);
  if (!fs.existsSync(file)) throw Error("BACKUP_CREDENTIAL_INVALID");
  let credential = decryptBackup(fs.readFileSync(file, "utf8"), key),
    release;
  try {
    const due =
      credential.pendingToken ||
      rotate ||
      now - Date.parse(credential.rotatedAt) > 30 * 86400000;
    if (due) {
      release = acquireBackupLock(
        path.join(directory, "machine-rotation.lock"),
      );
      credential = decryptBackup(fs.readFileSync(file, "utf8"), key);
      credential = await rotateMachineCredential(credential, {
        save: (v) => saveMachine(directory, key, v),
        now,
        fetcher,
        force: rotate,
      });
    }
    const client = machineTransport(credential, { fetcher });
    fs.writeFileSync(
      path.join(directory, "machine-auth-status.json"),
      JSON.stringify({
        mode: "machine",
        mcpRequired: false,
        rotatedAt: credential.rotatedAt,
        checkedAt: new Date().toISOString(),
      }),
      { mode: 0o600 },
    );
    return client;
  } finally {
    release?.();
  }
}
