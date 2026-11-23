import fs from "node:fs";
import path from "node:path";
import { defaultVault, vaultKey, projectRef } from "./lib/operator-vault.mjs";
import { acquireBackupLock } from "./lib/backup-lock.mjs";
import { openBackupAccess as operatorTransport } from "./lib/backup-machine.mjs";
import {
  readAgent,
  reportAgent,
  reportDelivery,
} from "./lib/backup-agent-channel.mjs";
import { probeGithubDelivery } from "./lib/delivery-monitor.mjs";
import { inspectBackupTask } from "./lib/backup-task-inspector.mjs";
import {
  probeBackupAccess,
  runBackupWatchdog,
} from "./lib/backup-watchdog.mjs";
const directory = defaultVault();
let release;
try {
  release = acquireBackupLock(path.join(directory, "agent.lock"));
  const key = vaultKey(directory, { create: false }),
    agent = readAgent(directory, key),
    file = path.join(directory, "agent-state.json");
  let state = {};
  try {
    state = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {}
  const result = await runBackupWatchdog({
    state,
    task: inspectBackupTask(),
    probe: () => probeBackupAccess(operatorTransport, projectRef),
    save: (value) => {
      fs.writeFileSync(file + ".tmp", JSON.stringify(value), { mode: 0o600 });
      fs.renameSync(file + ".tmp", file);
    },
    report: (status, code, phase) =>
      reportAgent(directory, key, agent, status, code, phase),
  });
  if (fs.existsSync(path.join(directory, "delivery-monitor-enabled.json"))) {
    const deliveryFile = path.join(directory, "delivery-status.json");
    let previous;
    try { previous = JSON.parse(fs.readFileSync(deliveryFile, "utf8")); } catch {}
    const token = process.env.BOOKFOREST_GITHUB_ACTIONS_READ_TOKEN;
    const delivery = await probeGithubDelivery(token ? {
      fetcher: (url, options) => fetch(url, { ...options, headers: { ...options.headers, Authorization: "Bearer " + token } }),
    } : {});
    const lastSuccessAt = delivery.notifiedAt ?? previous?.lastSuccessAt ?? previous?.notifiedAt ?? null;
    let delivered = false;
    try {
      await reportDelivery(directory, key, agent, { ...delivery, notifiedAt: lastSuccessAt });
      delivered = true;
    } catch {}
    fs.writeFileSync(
      deliveryFile,
      JSON.stringify({
        ...delivery,
        lastSuccessAt,
        delivered,
        checkedAt: new Date().toISOString(),
      }),
      { mode: 0o600 },
    );
  }
  fs.writeFileSync(
    path.join(directory, "watchdog-status.json"),
    JSON.stringify(result),
    { mode: 0o600 },
  );
  console.log(JSON.stringify(result));
  process.exitCode = result.monitorOk ? 0 : 1;
} catch (error) {
  const code =
    error?.message === "BACKUP_ALREADY_RUNNING"
      ? "BACKUP_ALREADY_RUNNING"
      : "WATCHDOG_UNAVAILABLE";
  const result = {
    monitorOk: code === "BACKUP_ALREADY_RUNNING",
    skipped: code === "BACKUP_ALREADY_RUNNING",
    code,
    checkedAt: new Date().toISOString(),
  };
  try {
    fs.writeFileSync(
      path.join(directory, "watchdog-status.json"),
      JSON.stringify(result),
      { mode: 0o600 },
    );
  } catch {}
  console.log(JSON.stringify(result));
  process.exitCode = result.monitorOk ? 0 : 1;
} finally {
  release?.();
}
