import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
export async function runtimeDb(before?: string) {
  const db = new PGlite();
  await db.exec(
    `create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}',encrypted_password text);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz not null default clock_timestamp());create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}')$$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text);`,
  );
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql") && (!before || f < before))
    .sort()) {
    await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
    await db.query(
      "insert into supabase_migrations.schema_migrations values($1,$2)",
      [file.split("_")[0], file.replace(/^\d+_/, "").replace(/\.sql$/, "")],
    );
  }
  return db;
}
export async function asUser(db: PGlite, id: string, aal = "aal2") {
  await db.exec("reset role;set role authenticated");
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
    [
      id,
      JSON.stringify({
        sub: id,
        aal,
        amr: [{ method: "totp", timestamp: Math.floor(Date.now() / 1000) }],
      }),
    ],
  );
}
export async function forbidden(db: PGlite, fn: () => Promise<unknown>) {
  await db.exec("savepoint denied");
  let error;
  try {
    await fn();
  } catch (e) {
    error = e;
  }
  await db.exec("rollback to savepoint denied;release savepoint denied");
  return String(error);
}
