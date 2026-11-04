import fs from "node:fs";
import { monitorHealthy } from "./lib/incident-notification.mjs";
const site = "https://reading-blush-zeta.vercel.app";
let healthy = false;
let errorId = null;
for (let attempt = 1; attempt <= 4; attempt++) {
  try {
    const r = await fetch(site + "/api/health?deep=1", {
        signal: AbortSignal.timeout(10000),
        cache: "no-store",
      }),
      d = await r.json();
    errorId =
      typeof d.errorId === "string" && /^[a-f0-9-]{36}$/i.test(d.errorId)
        ? d.errorId
        : null;
    const m = await fetch(site + "/api/monitor", {
        signal: AbortSignal.timeout(10000),
        cache: "no-store",
      }),
      s = await m.json();
    healthy =
      r.ok &&
      d.configured === true &&
      d.status === "ok" &&
      d.checks?.database === true &&
      d.checks?.authentication === true &&
      m.ok &&
      monitorHealthy(s.monitor);
    if (healthy) break;
  } catch {}
  if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 10000));
}
const result = {
  service: "bookforest",
  healthy,
  errorId: healthy ? null : errorId,
  checkedAt: new Date().toISOString(),
};
fs.writeFileSync("availability-result.json", JSON.stringify(result));
console.log(JSON.stringify(result));
process.exitCode = healthy ? 0 : 1;
