import { execFileSync } from "node:child_process";
import fs from "node:fs";
if (process.env.GITHUB_ACTIONS !== "true") throw Error("ISOLATED_CI_ONLY");
const originalConfig = fs.readFileSync("supabase/config.toml", "utf8");
if (!originalConfig.includes('project_id = "bookforest"'))
  throw Error("CI_CONFIG_SCOPE_REQUIRED");
// Only this disposable runner needs >30 sign-ins. Production limits are untouched.
fs.writeFileSync(
  "supabase/config.toml",
  originalConfig.replace(/^sign_in_sign_ups = 30$/m, "sign_in_sign_ups = 300"),
);
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
} finally {
  fs.writeFileSync("supabase/config.toml", originalConfig);
}
