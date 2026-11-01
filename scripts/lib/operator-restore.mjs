import { PGlite } from "@electric-sql/pglite";
import { digest, canonical, projectRef } from "./operator-vault.mjs";
const ident = (s) => '"' + s.replaceAll('"', '""') + '"',
  literal = (s) => "'" + s.replaceAll("'", "''") + "'";
const table = (s, t) => ident(s) + "." + ident(t),
  role = (s) => (s === "PUBLIC" ? "PUBLIC" : ident(s));
const sortRows = (rows) =>
  rows
    .slice()
    .sort((a, b) =>
      canonical(a) < canonical(b) ? -1 : canonical(a) > canonical(b) ? 1 : 0,
    );
export function prepareBackup(input, files) {
  const snapshot = structuredClone(input);
  if (
    snapshot.format !== "bookforest-instance-snapshot" ||
    snapshot.version !== 1
  )
    throw Error("SNAPSHOT_FORMAT_INVALID");
  for (const name of Object.keys(snapshot.data))
    snapshot.data[name] = sortRows(snapshot.data[name]);
  const migrations = snapshot.migrations.map((m) => {
    const f = files.find((f) => f.name === m.version + "_" + m.name + ".sql");
    if (!f) throw Error("MIGRATION_SOURCE_MISSING");
    return { ...f, sha256: digest(f.sql) };
  });
  return {
    format: "bookforest-operator-backup",
    version: 1,
    projectRef,
    createdAt: new Date().toISOString(),
    snapshot,
    migrations,
    sha256: digest(snapshot),
  };
}
export async function verifyRestore(backup) {
  if (
    backup.format !== "bookforest-operator-backup" ||
    backup.version !== 1 ||
    backup.projectRef !== projectRef ||
    digest(backup.snapshot) !== backup.sha256 ||
    backup.migrations.some((m) => digest(m.sql) !== m.sha256)
  )
    throw Error("BACKUP_MANIFEST_INVALID");
  const db = new PGlite();
  let stage = "schema";
  try {
    await db.exec(
      "create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;grant usage on schema public,auth to anon,authenticated,service_role;",
    );
    for (const e of backup.snapshot.schema.enums ?? [])
      await db.exec(
        `create type ${table(e.schema, e.name)} as enum (${e.values.map(literal).join(",")})`,
      );
    const columns = backup.snapshot.schema.columns;
    const authTables = [
      ...new Set(
        columns.filter((c) => c.schema === "auth").map((c) => c.table),
      ),
    ];
    for (const name of authTables) {
      const fields = columns
        .filter((c) => c.schema === "auth" && c.table === name)
        .map(
          (c) =>
            `${ident(c.name)} ${c.type}${c.generated ? ` generated always as (${c.expression}) stored` : ""}${c.notNull ? " not null" : ""}`,
        );
      await db.exec(`create table ${table("auth", name)}(${fields.join(",")})`);
    }
    for (const c of backup.snapshot.schema.constraints ?? [])
      if (c.schema === "auth" && ["p", "u"].includes(c.type))
        await db.exec(
          `alter table ${table(c.schema, c.table)} add constraint ${ident(c.name)} ${c.definition}`,
        );
    await db.exec(
      "create function auth.uid() returns uuid language sql stable as $$select nullif(coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),current_setting('request.jwt.claims',true)::jsonb->>'sub'),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}')$$;grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;",
    );
    for (const m of backup.migrations) await db.exec(m.sql);
    // Reapply the actual source's app functions and grants, including reviewed
    // operator changes; Supabase-managed Auth service configuration is separate.
    for (const f of backup.snapshot.schema.functions ?? [])
      await db.exec(f.definition);
    await db.exec("set session_replication_role=replica;set timezone='UTC'");
    stage = "data";
    const tables = Object.keys(backup.snapshot.data);
    if (tables.some((n) => !/^(auth|public|private)\.[a-z0-9_]+$/.test(n)))
      throw Error("TABLE_SCOPE_INVALID");
    await db.exec(
      "truncate " +
        tables.map((n) => n.split(".").map(ident).join(".")).join(",") +
        " cascade",
    );
    for (const name of tables) {
      const [schema, t] = name.split("."),
        rows = backup.snapshot.data[name];
      const fields = columns
        .filter((c) => c.schema === schema && c.table === t && !c.generated)
        .map((c) => c.name);
      for (let i = 0; i < rows.length; i += 100)
        await db.query(
          `insert into ${table(schema, t)}(${fields.map(ident).join(",")}) select ${fields.map(ident).join(",")} from jsonb_populate_recordset(null::${table(schema, t)},$1::jsonb)`,
          [JSON.stringify(rows.slice(i, i + 100))],
        );
    }
    await db.exec("set session_replication_role=origin");
    stage = "relations";
    for (const c of backup.snapshot.schema.constraints ?? [])
      if (c.type === "f") {
        const name = "restore_check_" + digest(c).slice(0, 20);
        await db.exec(
          `alter table ${table(c.schema, c.table)} add constraint ${ident(name)} ${c.definition};alter table ${table(c.schema, c.table)} drop constraint ${ident(name)}`,
        );
      }
    stage = "permissions";
    for (const t of backup.snapshot.schema.tables ?? []) {
      const name = table(t.schema, t.name);
      await db.exec(
        `alter table ${name} ${t.rls ? "enable" : "disable"} row level security;alter table ${name} ${t.force ? "force" : "no force"} row level security;revoke all on ${name} from public,anon,authenticated,service_role`,
      );
      for (const grant of t.acl)
        await db.exec(
          `grant ${grant.privilege} on ${name} to ${role(grant.role)}`,
        );
    }
    for (const f of backup.snapshot.schema.functions ?? []) {
      await db.exec(
        `revoke all on function ${f.signature} from public,anon,authenticated,service_role`,
      );
      for (const grant of f.acl)
        await db.exec(
          `grant ${grant.privilege} on function ${f.signature} to ${role(grant.role)}`,
        );
    }
    const current = (
      await db.query(
        "select * from pg_policies where schemaname in ('public','private')",
      )
    ).rows;
    for (const p of current)
      await db.exec(
        `drop policy ${ident(p.policyname)} on ${table(p.schemaname, p.tablename)}`,
      );
    for (const p of backup.snapshot.schema.policies ?? [])
      await db.exec(
        `create policy ${ident(p.policyname)} on ${table(p.schemaname, p.tablename)} as ${p.permissive} for ${p.cmd} to ${p.roles.map(role).join(",")}${p.qual ? ` using (${p.qual})` : ""}${p.with_check ? ` with check (${p.with_check})` : ""}`,
      );
    stage = "comparison";
    let rowCount = 0;
    for (const name of tables) {
      const [s, t] = name.split("."),
        source = backup.snapshot.data[name],
        restored = (
          await db.query(
            `select to_jsonb(x) v from ${table(s, t)} x order by to_jsonb(x)::text`,
          )
        ).rows.map((r) => r.v);
      if (digest(sortRows(restored)) !== digest(source))
        throw Error("ROW_CONTENT_MISMATCH");
      rowCount += restored.length;
    }
    await db.exec("set role anon");
    for (const name of ["reading_logs", "submissions", "economy_ledger"]) {
      let denied = false;
      try {
        const r = await db.query(`select * from public.${name} limit 1`);
        denied = !r.rows.length;
      } catch {
        denied = true;
      }
      if (!denied) throw Error("ANONYMOUS_DATA_EXPOSED");
    }
    await db.exec("reset role");
    return {
      verified: true,
      engine: "PGlite PostgreSQL",
      tables: tables.length,
      rows: rowCount,
      foreignKeys: (backup.snapshot.schema.constraints ?? []).filter(
        (c) => c.type === "f",
      ).length,
      policies: backup.snapshot.schema.policies.length,
      functions: backup.snapshot.schema.functions.length,
      checkedAt: new Date().toISOString(),
      digest: backup.sha256,
    };
  } catch (error) {
    const code = String(error.code ?? error.message ?? "RESTORE_FAILED");
    throw Error(
      `RESTORE_${stage.toUpperCase()}_${/^[A-Z0-9_]+$/.test(code) ? code : "FAILED"}`,
    );
  } finally {
    await db.close();
  }
}
