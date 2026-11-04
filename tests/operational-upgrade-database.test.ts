import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { runtimeDb, asUser } from "./helpers/runtime-db";
it("upgrades existing published immutable reports without changing their source or visibility", async () => {
  const db = await runtimeDb("20261104000000"),
    t = randomUUID(),
    s = randomUUID(),
    c = randomUUID();
  try {
    await db.exec("begin");
    for (const id of [t, s])
      await db.query("insert into auth.users(id) values($1)", [id]);
    await db.query("update public.profiles set role='teacher' where id=$1", [
      t,
    ]);
    await db.exec("update public.profiles set consent_status='verified'");
    await db.query(
      "insert into public.classrooms(id,teacher_id,name) values($1,$2,'기존 학급')",
      [c, t],
    );
    await db.query(
      "insert into public.enrollments(classroom_id,student_id) values($1,$2)",
      [c, s],
    );
    await asUser(db, t);
    await db.query(
      "select public.create_growth_report($1,$2,null,null,'{}','기존 보고서','기존 의견',true,true,0,$3)",
      [c, s, randomUUID()],
    );
    await db.exec("reset role");
    const before = (
      await db.query<{ snapshot: unknown }>(
        "select snapshot from public.term_reports",
      )
    ).rows[0].snapshot;
    for (const suffix of [
      "operational_release_state.sql",
      "report_review_lifecycle.sql",
      "scoped_classroom_collaboration.sql",
    ]) {
      const file = readdirSync("supabase/migrations").find((n) =>
        n.endsWith("_" + suffix),
      )!;
      await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
    }
    const after = (
      await db.query<{
        snapshot: unknown;
        review_state: string;
        published_at: unknown;
      }>("select snapshot,review_state,published_at from public.term_reports")
    ).rows[0];
    expect(after.snapshot).toEqual(before);
    expect(after.review_state).toBe("published");
    expect(after.published_at).toBeTruthy();
    await asUser(db, s);
    expect(
      (await db.query("select id from public.term_reports")).rows,
    ).toHaveLength(1);
    await db.exec("reset role;set role anon");
    expect(
      (
        await db.query<{ v: unknown }>(
          "select public.service_release_contract() v",
        )
      ).rows[0].v,
    ).toMatchObject({ protocol: 2, reportReview: true, scopedStaff: true });
  } finally {
    await db.close();
  }
}, 20000);
