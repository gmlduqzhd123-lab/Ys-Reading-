import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { prepareBackup } from "./lib/operator-restore.mjs";
import { encryptBackup } from "./lib/operator-vault.mjs";
import { wrapRecoveryKey } from "./lib/recovery-key.mjs";
import { totp } from "../e2e/totp";
if (process.env.GITHUB_ACTIONS !== "true" || process.env.BOOKFOREST_E2E !== "1")
  throw Error("ISOLATED_CI_ONLY");
const fixture = JSON.parse(
  fs.readFileSync("e2e/.runtime/fixtures.json", "utf8"),
);
if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(fixture.url))
  throw Error("LOCAL_TEST_PROJECT_REQUIRED");
const dbContainer = "supabase_db_bookforest",
  authContainer = "supabase_auth_bookforest",
  restContainer = "supabase_rest_bookforest",
  targetDb = "bookforest_restore_drill";
const authClone = "bookforest-recovery-auth",
  restClone = "bookforest-recovery-rest";
function docker(args: string[], input?: Buffer | string) {
  return execFileSync("docker", args, {
    input,
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120000,
  });
}
function sql(query: string, database = "postgres") {
  return docker([
    "exec",
    "-i",
    dbContainer,
    "psql",
    "-U",
    "postgres",
    "-d",
    database,
    "-v",
    "ON_ERROR_STOP=1",
    "-At",
    "-c",
    query,
  ])
    .toString()
    .trim();
}
let stage = "snapshot",
  created = false;
const startedClones: string[] = [],
  envFiles: string[] = [];
try {
  const snapshot = JSON.parse(sql("select private.operator_snapshot()::text"));
  const files = fs
    .readdirSync("supabase/migrations")
    .filter((n) => n.endsWith(".sql"))
    .sort()
    .map((name) => ({
      name,
      sql: fs.readFileSync("supabase/migrations/" + name, "utf8"),
    }));
  const backup = prepareBackup(snapshot, files),
    directory = path.resolve("e2e/.runtime/portable-recovery");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const key = randomBytes(32),
    passphrase = randomUUID() + randomUUID();
  fs.writeFileSync(
    path.join(directory, "backup.bfbak"),
    encryptBackup(backup, key),
    { mode: 0o600 },
  );
  fs.writeFileSync(
    path.join(directory, "recovery.bfkey"),
    wrapRecoveryKey(key, passphrase),
    { mode: 0o600 },
  );
  const portable = spawnSync(
    process.execPath,
    ["scripts/operator-recovery-kit.mjs", "verify"],
    {
      input: JSON.stringify({ directory, passphrase }),
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 120000,
    },
  );
  if (portable.status !== 0) throw Error("PORTABLE_VERIFY_FAILED");
  const receipt = JSON.parse(portable.stdout.trim());
  if (!receipt.verified || !receipt.portableKeyVerified)
    throw Error("PORTABLE_VERIFY_FAILED");
  stage = "native-restore";
  if (
    sql("select count(*) from pg_database where datname='" + targetDb + "'") !==
    "0"
  )
    throw Error("RESTORE_TARGET_NOT_EMPTY");
  sql("create database " + targetDb + " template template0");
  created = true;
  sql(
    "create schema if not exists extensions;create extension if not exists pgcrypto with schema extensions",
    targetDb,
  );
  const dump = docker([
    "exec",
    dbContainer,
    "pg_dump",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-Fc",
    "--no-owner",
    "--schema=public",
    "--schema=private",
    "--schema=auth",
  ]);
  docker(
    [
      "exec",
      "-i",
      dbContainer,
      "pg_restore",
      "-U",
      "postgres",
      "-d",
      targetDb,
      "--clean",
      "--if-exists",
      "--no-owner",
      "--exit-on-error",
    ],
    dump,
  );
  const countSql =
    "select jsonb_build_object('profiles',(select count(*) from public.profiles),'reading',(select count(*) from public.reading_logs),'submissions',(select count(*) from public.submissions),'ledger',(select count(*) from public.economy_ledger),'staff',(select count(*) from private.classroom_staff))::text";
  if (sql(countSql) !== sql(countSql, targetDb))
    throw Error("NATIVE_RESTORE_COUNT_MISMATCH");
  // A recovery is a fresh login, never a continuation of old sessions.
  sql(
    "truncate auth.sessions cascade;grant usage,create on schema auth to supabase_auth_admin;grant all on all tables in schema auth to supabase_auth_admin;grant all on all sequences in schema auth to supabase_auth_admin;",
    targetDb,
  );
  const config = JSON.parse(
    execFileSync("npx", ["--no-install", "supabase", "status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
  async function clone(
    source: string,
    name: string,
    dbKey: string,
    port: number,
    internalPort: number,
  ) {
    const info = JSON.parse(docker(["inspect", source]).toString())[0];
    const network = Object.keys(info.NetworkSettings.Networks)[0];
    if (
      !network ||
      !String(info.Config.Image).includes(
        source.includes("_auth_") ? "gotrue" : "postgrest",
      )
    )
      throw Error("CLONE_SCOPE_REQUIRED");
    const env: string[] = info.Config.Env;
    const existing = env.find((x) => x.startsWith(dbKey + "="));
    if (!existing) throw Error("CLONE_DATABASE_CONFIG_REQUIRED");
    const dbUrl = new URL(existing.slice(dbKey.length + 1));
    if (dbUrl.pathname !== "/postgres")
      throw Error("CLONE_SOURCE_DATABASE_REQUIRED");
    dbUrl.pathname = "/" + targetDb;
    const vars = env.filter((x) => !x.startsWith(dbKey + "="));
    vars.push(dbKey + "=" + dbUrl.toString());
    const envFile = path.resolve("e2e/.runtime/" + name + ".env");
    fs.writeFileSync(envFile, vars.join("\n"), { mode: 0o600 });
    envFiles.push(envFile);
    docker([
      "run",
      "-d",
      "--name",
      name,
      "--network",
      network,
      "-p",
      "127.0.0.1:" + port + ":" + internalPort,
      "--env-file",
      envFile,
      info.Config.Image,
    ]);
    startedClones.push(name);
  }
  stage = "independent-services";
  await clone(authContainer, authClone, "GOTRUE_DB_DATABASE_URL", 55431, 9999);
  await clone(restContainer, restClone, "PGRST_DB_URI", 55432, 3000);
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch("http://127.0.0.1:55431/health");
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready) throw Error("RESTORED_AUTH_NOT_READY");
  const authFetch: typeof fetch = (input, init) =>
    fetch(String(input).replace("/auth/v1/", "/"), init);
  const restored = createClient("http://127.0.0.1:55431", config.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: authFetch },
  });
  stage = "restored-login";
  const signed = await restored.auth.signInWithPassword({
    email: fixture.student.loginId + "@students.bookforest.invalid",
    password: fixture.student.password,
  });
  if (signed.error || !signed.data.session)
    throw Error("RESTORED_PASSWORD_LOGIN_FAILED");
  const headers = {
    Authorization: "Bearer " + signed.data.session.access_token,
    apikey: config.ANON_KEY,
  };
  stage = "restored-rls";
  const read = await fetch(
      "http://127.0.0.1:55432/reading_logs?select=id,student_id",
      { headers },
    ),
    rows = await read.json();
  if (
    !read.ok ||
    !Array.isArray(rows) ||
    rows.length !== 1 ||
    rows.some((x) => x.student_id !== fixture.student.id)
  )
    throw Error("RESTORED_RLS_FAILED");
  const anon = await fetch("http://127.0.0.1:55432/reading_logs?select=id", {
    headers: { apikey: config.ANON_KEY },
  });
  if (anon.ok && (await anon.json()).length !== 0)
    throw Error("RESTORED_ANON_EXPOSED");
  stage = "restored-mfa";
  const op = createClient("http://127.0.0.1:55431", config.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: authFetch },
  });
  const login = await op.auth.signInWithPassword({
    email: fixture.accounts[0].email,
    password: fixture.accounts[0].password,
  });
  if (login.error) throw Error("RESTORED_OPERATOR_LOGIN_FAILED");
  const factors = await op.auth.mfa.listFactors(),
    factor = factors.data?.totp.find((x) => x.status === "verified");
  if (!factor) throw Error("RESTORED_MFA_MISSING");
  const mfa = await op.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code: totp(fixture.operatorSecret),
  });
  if (mfa.error) throw Error("RESTORED_MFA_FAILED");
  console.log(
    JSON.stringify({
      environment: "isolated-github-runner",
      portableEncryptedBackup: true,
      independentDatabase: true,
      restoredAuthPassword: true,
      restoredMfa: true,
      restoredStudentRls: true,
      anonymousDenied: true,
      productionBackupTransferred: false,
    }),
  );
} catch {
  console.error(
    "CI_RECOVERY_FAILED_" + stage.toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
  );
  process.exitCode = 1;
} finally {
  for (const name of startedClones.reverse()) {
    try {
      docker(["rm", "-f", name]);
    } catch {}
  }
  for (const file of envFiles) {
    try {
      fs.unlinkSync(file);
    } catch {}
  }
  if (created) {
    try {
      sql("drop database " + targetDb + " with (force)");
    } catch {
      process.exitCode = 1;
    }
  }
}
