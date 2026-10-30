// Import a downloaded Google Web OAuth client file without printing its secrets.
// Usage: node scripts/configure-google.mjs <client-json-path> <expected-project-id>
import { readFile, writeFile, rename, stat } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { Buffer } from "node:buffer";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export function prepareGoogleConfig(
  raw,
  expectedProject,
  callback,
  existingKey,
  makeKey = () => randomBytes(32).toString("base64"),
) {
  const c = raw?.web;
  if (!c || c.project_id !== expectedProject || !expectedProject)
    throw new Error("GOOGLE_PROJECT_MISMATCH");
  if (
    !/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(c.client_id ?? "") ||
    !/^[A-Za-z0-9_-]{20,256}$/.test(c.client_secret ?? "")
  )
    throw new Error("GOOGLE_CLIENT_INVALID");
  if (!Array.isArray(c.redirect_uris) || !c.redirect_uris.includes(callback))
    throw new Error("GOOGLE_CALLBACK_MISMATCH");
  if (
    c.auth_uri !== "https://accounts.google.com/o/oauth2/auth" &&
    c.auth_uri !== "https://accounts.google.com/o/oauth2/v2/auth"
  )
    throw new Error("GOOGLE_AUTH_ENDPOINT_INVALID");
  if (c.token_uri !== "https://oauth2.googleapis.com/token")
    throw new Error("GOOGLE_TOKEN_ENDPOINT_INVALID");
  const key = existingKey || makeKey();
  if (
    !/^[A-Za-z0-9+/]{43}=$/.test(key) ||
    Buffer.from(key, "base64").length !== 32
  )
    throw new Error("GOOGLE_ENCRYPTION_KEY_INVALID");
  return {
    GOOGLE_DRIVE_CLIENT_ID: c.client_id,
    GOOGLE_DRIVE_CLIENT_SECRET: c.client_secret,
    GOOGLE_TOKEN_ENCRYPTION_KEY: key,
  };
}
export function updateEnvText(previous, values) {
  let text = previous;
  for (const [key, value] of Object.entries(values)) {
    const pattern = new RegExp("^" + key + "=.*$", "m");
    text = pattern.test(text)
      ? text.replace(pattern, () => `${key}=${value}`)
      : text.replace(/\s*$/, "") + `\n${key}=${value}\n`;
  }
  return text;
}
async function main() {
  const [file, expectedProject] = process.argv.slice(2);
  if (!file || !expectedProject)
    throw new Error("USAGE_CLIENT_JSON_PATH_AND_PROJECT_ID_REQUIRED");
  if ((await stat(file)).size > 65536)
    throw new Error("GOOGLE_CLIENT_FILE_TOO_LARGE");
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const envFile = resolve(root, ".env.local");
  process.loadEnvFile(envFile);
  const app = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "");
  if (
    app.username ||
    app.password ||
    app.search ||
    app.hash ||
    !(
      app.protocol === "https:" ||
      (app.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(app.hostname))
    )
  )
    throw new Error("APP_URL_INVALID");
  const callback = new URL("/api/google/callback", app.origin).toString();
  const raw = JSON.parse((await readFile(file, "utf8")).replace(/^\uFEFF/, ""));
  const values = prepareGoogleConfig(
    raw,
    expectedProject,
    callback,
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY,
  );
  const previous = await readFile(envFile, "utf8");
  const temporary = envFile + ".bookforest.tmp";
  await writeFile(temporary, updateEnvText(previous, values), { mode: 0o600 });
  await rename(temporary, envFile);
  console.log(
    JSON.stringify({
      ok: true,
      projectId: expectedProject,
      callback,
      configured: true,
    }),
  );
}
if (
  typeof process !== "undefined" &&
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((e) => {
    console.error(
      e instanceof Error && /^[A-Z_]+$/.test(e.message)
        ? e.message
        : "GOOGLE_CONFIGURATION_FAILED",
    );
    process.exitCode = 1;
  });
