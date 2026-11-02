import { execFileSync } from "node:child_process";
if (process.env.GITHUB_ACTIONS !== "true") throw Error("ISOLATED_CI_ONLY");
try {
  execFileSync(
    "npx",
    [
      "--no-install",
      "supabase",
      "start",
      "-x",
      "studio,imgproxy,logflare,vector,supavisor,realtime,storage-api,postgres-meta,mailpit",
    ],
    { stdio: "pipe", timeout: 600000, maxBuffer: 8 * 1024 * 1024 },
  );
  console.log("Isolated Supabase Auth, Postgres and Edge runtime started.");
} catch (e) {
  const detail = String(e.stderr ?? "")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/sb_(secret|publishable)_[A-Za-z0-9_-]+/g, "[redacted]");
  console.error(detail.slice(-3500));
  process.exitCode = 1;
}
