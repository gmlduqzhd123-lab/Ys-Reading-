import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  describe,
  it,
  expect,
} from "vitest";
let db: PGlite;
const owner = "10000000-0000-4000-8000-000000000001",
  other = "10000000-0000-4000-8000-000000000002";
const one = async (sql: string, args: unknown[] = []) =>
  (await db.query<Record<string, any>>(sql, args)).rows[0];
async function actor(id: string) {
  await db.exec("reset role;set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
}
const claim = async () =>
  (await one("select public.complete_operator_email_setup() v")).v;
describe("operator email reservation: verified identity only", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(
      `create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb not null default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;`,
    );
    for (const f of readdirSync(resolve("supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.exec(readFileSync(resolve("supabase/migrations", f), "utf8"));
    await db.query(
      "insert into auth.users(id,email) values($1,'owner@example.com'),($2,'other@example.com')",
      [owner, other],
    );
    await db.exec(
      "insert into private.operator_email_invitations(email,display_name,expires_at) values('owner@example.com','테스트 운영자',now()+interval '7 days')",
    );
  });
  beforeEach(async () => {
    await db.exec("begin");
  });
  afterEach(async () => {
    await db.exec("rollback;reset role");
  });
  afterAll(async () => {
    await db?.close();
  });
  it("does not grant the invited email before Auth confirmation", async () => {
    await actor(owner);
    expect((await claim()).claimed).toBe(false);
    await db.exec("reset role");
    expect((await one("select count(*)::int n from private.operators")).n).toBe(
      0,
    );
  });
  it("does not trust metadata claiming the invited email", async () => {
    await db.query(
      "update auth.users set email_confirmed_at=now(),raw_user_meta_data=$1 where id=$2",
      [{ email: "owner@example.com", operator: true, role: "teacher" }, other],
    );
    await actor(other);
    expect((await claim()).claimed).toBe(false);
  });
  it("claims once after actual Auth email verification and is retry safe", async () => {
    await db.query(
      "update auth.users set email_confirmed_at=now() where id=$1",
      [owner],
    );
    await actor(owner);
    expect((await claim()).claimed).toBe(true);
    expect((await claim()).claimed).toBe(true);
    await db.exec("reset role");
    expect((await one("select count(*)::int n from private.operators")).n).toBe(
      1,
    );
    expect(
      (
        await one(
          "select count(*)::int n from private.operations_audit where event='operator_email_verified'",
        )
      ).n,
    ).toBe(1);
    expect(
      await one("select role,consent_status from public.profiles where id=$1", [
        owner,
      ]),
    ).toMatchObject({ role: "teacher", consent_status: "pending" });
  });
  it("does not restore a role after the owner revokes it", async () => {
    await db.query(
      "update auth.users set email_confirmed_at=now() where id=$1",
      [owner],
    );
    await actor(owner);
    await claim();
    await db.exec("reset role");
    await db.query("delete from private.operators where user_id=$1", [owner]);
    await actor(owner);
    expect((await claim()).claimed).toBe(false);
  });
  it("rejects an expired invitation", async () => {
    await db.query(
      "update auth.users set email_confirmed_at=now() where id=$1",
      [owner],
    );
    await db.exec(
      "update private.operator_email_invitations set expires_at=now()-interval '1 second'",
    );
    await actor(owner);
    expect((await claim()).claimed).toBe(false);
  });
  it("blocks direct invitation edits and anonymous claims", async () => {
    await actor(other);
    await expect(
      db.query(
        "insert into private.operator_email_invitations values('other@example.com','test',now())",
      ),
    ).rejects.toThrow(/permission denied/);
    await db.exec("rollback;begin;set role anon");
    await expect(claim()).rejects.toThrow(/permission denied/);
  });
});
