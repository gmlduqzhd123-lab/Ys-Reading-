import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
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
const t = "10000000-0000-4000-8000-000000000001",
  other = "10000000-0000-4000-8000-000000000002",
  s = "20000000-0000-4000-8000-000000000001",
  peer = "20000000-0000-4000-8000-000000000002",
  outsider = "20000000-0000-4000-8000-000000000003",
  c = "30000000-0000-4000-8000-000000000001",
  c2 = "30000000-0000-4000-8000-000000000002",
  mission = "40000000-0000-4000-8000-000000000001",
  a = "50000000-0000-4000-8000-000000000001";
async function actor(id: string) {
  await db.exec("reset role;set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
}
async function one(sql: string, args: unknown[] = []): Promise<any> {
  return (await db.query(sql, args)).rows[0];
}
async function rpc(name: string, args: unknown[] = []) {
  const placeholders = args.map((_, i) => "$" + (i + 1)).join(",");
  try{return (await one(`select public.${name}(${placeholders}) value`, args)).value;}
  catch(e){console.error("Isolated RPC failure",name,(e as {where?:string}).where);throw e;}
}
async function reject(sql: string, args: unknown[], message: string) {
  await db.exec("savepoint rejected");
  let error;
  try {
    await db.query(sql, args);
  } catch (e) {
    error = e;
  }
  await db.exec("rollback to savepoint rejected;release savepoint rejected");
  expect(String(error)).toContain(message);
}
async function reading(
  title = "어린 왕자",
  day = "2026-01-01",
  classroom = c,
  student = s,
) {
  await db.exec("reset role");
  return (
    await one(
      "insert into public.reading_logs(classroom_id,student_id,book,read_on,status,thought,question) values($1,$2,jsonb_build_object('title',$3::text),$4,'completed','함께 배웠어요','왜 그랬을까요?') returning id",
      [classroom, student, title, day],
    )
  ).id;
}
async function search(
  kind = "",
  classroom: string | null = null,
  student: string | null = null,
  q = "",
  from: string | null = null,
  to: string | null = null,
  status = "",
  page = 1,
) {
  return rpc("record_search", [
    kind,
    classroom,
    student,
    q,
    from,
    to,
    status,
    page,
  ]);
}
describe("Server-side classroom insights, notices and complete record search", () => {
  it("rechecks membership eligibility between queries after introducing the scope cache",async()=>{
    await reading();await actor(t);expect((await search("reading",c)).total).toBe(1);
    await db.exec("reset role");await db.query("update public.profiles set account_active=false where id=$1",[s]);
    await actor(t);expect((await search("reading",c)).total).toBe(0);
    await db.exec("reset role");await db.query("update public.profiles set account_active=true,consent_status='verified' where id=$1",[s]);
    await actor(t);expect((await search("reading",c)).total).toBe(1);
  });
  it("freezes authorized batch IDs, resumes parts and denies another owner",async()=>{
    for(let n=0;n<28;n++)await reading("묶음 "+n);
    await reading("다른 학급 비공개","2026-01-01",c2,outsider);
    await actor(t);
    const id=await rpc("start_export_batch",["학기 작품집","reading","docx",false,c,null,null]);
    const part=await rpc("export_batch_state",[id,0,false,null]);expect(part.parts).toBe(2);expect(part.ids).toHaveLength(25);
    await reject("select public.export_batch_state($1,0,true,null)",[id],"BF_EXPORT_NOT_GENERATED");
    await rpc("register_export_receipt",["reading",part.ids,"docx","학기 작품집",null,part.requestId]);
    await rpc("export_batch_state",[id,0,true,null]);
    expect((await rpc("export_batch_state")).find((x:any)=>x.id===id).done).toBe(1);
    expect((await rpc("export_batch_state",[id,1,false,null])).ids).toHaveLength(3);
    await actor(other);await reject("select public.export_batch_state($1,0,false,null)",[id],"BF_FORBIDDEN");
  });
  it("signals new own learning records without leaking another classroom",async()=>{
    await actor(s);const initial=await rpc("learning_change_token",[c]);
    await reading("다른 학급 비공개","2026-01-01",c2,outsider);
    await actor(s);expect(await rpc("learning_change_token",[c])).toBe(initial);
    await reading();await actor(s);expect(await rpc("learning_change_token",[c])).not.toBe(initial);
  });
  it("retains private unsubmitted drafts for the student alone", async () => {
    await actor(s);
    await one(
      "select * from public.save_draft($1,'개인 초안','아직 제출하지 않은 생각이에요.',0)",
      [a],
    );
    expect((await search("draft")).total).toBe(1);
    await actor(t);
    expect((await search("draft")).total).toBe(0);
    expect(
      (await rpc("class_learning_archive", [c])).records.some(
        (r: any) => r.kind === "draft",
      ),
    ).toBe(false);
  });
  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } });
    await db.exec(
      `create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;`,
    );
    for (const f of readdirSync(resolve("supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.exec(readFileSync(resolve("supabase/migrations", f), "utf8"));
    for (const id of [t, other, s, peer, outsider])
      await db.query("insert into auth.users(id) values($1)", [id]);
    await db.query(
      "update public.profiles set role='teacher' where id=any($1::uuid[])",
      [[t, other]],
    );
    await db.exec("update public.profiles set consent_status='verified'");
    await db.query(
      "insert into public.classrooms(id,name,teacher_id) values($1,'첫 반',$2),($3,'다른 반',$4)",
      [c, t, c2, other],
    );
    await db.query(
      "insert into public.enrollments(classroom_id,student_id) values($1,$2),($1,$3),($4,$5)",
      [c, s, peer, c2, outsider],
    );
    await db.query(
      "insert into public.missions(id,slug,title,theme,grade_band,prompt,description,minutes) values($1,'insight-test','생각','empathy','3-4','생각해요','질문해요',10)",
      [mission],
    );
    await db.query(
      "insert into public.assignments(id,classroom_id,mission_id,mission_snapshot,due_at) select $1,$2,id,to_jsonb(m),now()-interval '1 day' from public.missions m where id=$3",
      [a, c, mission],
    );
  });
  beforeEach(async () => {
    await db.exec("begin");
  });
  it("freezes batch content but immediately revokes frozen access after consent, membership and deletion changes",async()=>{
    const id=await reading("고정할 책");await actor(t);
    const batch=await rpc("start_export_snapshot",["묶음","reading","docx",false,c,null,null,"all"]);
    expect((await rpc("export_batch_content",[batch,0])).bundle.entries[0].title).toBe("고정할 책");
    await db.exec("reset role");await db.query("update public.reading_logs set thought='나중에 바뀐 생각' where id=$1",[id]);
    await actor(t);expect((await rpc("export_batch_content",[batch,0])).bundle.entries[0].body).toBe("함께 배웠어요");
    await actor(other);await reject("select public.export_batch_content($1,0)",[batch],"BF_FORBIDDEN");
    await db.exec("reset role");await db.query("update public.profiles set consent_status='pending' where id=$1",[s]);
    await actor(t);await reject("select public.export_batch_content($1,0)",[batch],"BF_EXPORT_ACCESS_CHANGED");
    await db.exec("reset role");await db.query("update public.profiles set consent_status='verified' where id=$1",[s]);await db.query("update public.enrollments set active=false where student_id=$1",[s]);
    await actor(t);await reject("select public.export_batch_content($1,0)",[batch],"BF_EXPORT_ACCESS_CHANGED");
    await db.exec("reset role");await db.query("update public.enrollments set active=true where student_id=$1",[s]);await db.query("delete from public.reading_logs where id=$1",[id]);
    await actor(t);await reject("select public.export_batch_content($1,0)",[batch],"BF_EXPORT_ACCESS_CHANGED");
  });
  it("limits class display configuration to the owner teacher",async()=>{
    await actor(s);await reject("select public.set_class_student_view($1,true,'guided')",[c],"BF_FORBIDDEN");
    await actor(other);await reject("select public.set_class_student_view($1,true,'guided')",[c],"BF_FORBIDDEN");
    await actor(t);await rpc("set_class_student_view",[c,true,"guided"]);
    expect(await one("select simple_student_view,reading_guidance from public.classrooms where id=$1",[c])).toMatchObject({simple_student_view:true,reading_guidance:"guided"});
  });
  it("selects latest immutable writing versions and reviewed records before snapshot creation",async()=>{
    await actor(s);const first=await one("select * from public.submit_work($1,'첫 글','처음 생각한 충분한 문장입니다.',$2)",[a,randomUUID()]);
    await actor(t);await one("select * from public.review_work($1,'다듬어 보세요.','revision_requested')",[first.id]);
    await actor(s);const latest=await one("select * from public.submit_work($1,'두 번째 글','친구 생각을 더해 다듬은 충분한 문장입니다.',$2)",[a,randomUUID()]);
    await actor(t);const batch=await rpc("start_export_snapshot",["최신","writing","csv",false,c,null,null,"latest"]);
    expect((await rpc("export_batch_content",[batch,0])).ids).toEqual([latest.id]);
    await reject("select public.start_export_snapshot('완료','writing','csv',false,$1,null,null,'completed')",[c],"BF_INVALID_INPUT");
    await one("select * from public.review_work($1,'완성했어요.','completed')",[latest.id]);
    const done=await rpc("start_export_snapshot",["완료","writing","csv",false,c,null,null,"completed"]);
    expect((await rpc("export_batch_content",[done,0])).ids).toEqual([latest.id]);
  });
  afterEach(async () => {
    await db.exec("rollback;reset role");
  });
  afterAll(async () => {
    await db?.close();
  });
  it("revokes anonymous searches and notice writes, but exposes a boolean probe", async () => {
    await db.exec("set role anon");
    expect(await rpc("service_probe")).toBe(true);
    await reject("select public.record_search()", [], "permission denied");
    await reject("select public.teacher_overview()", [], "permission denied");
    await reject(
      "select * from public.teacher_notice_reads",
      [],
      "permission denied",
    );
  });
  it("keeps search records private to their student and assigned teacher", async () => {
    await reading();
    await reading("같은 반 친구", "2026-01-01", c, peer);
    await reading("다른 반 책", "2026-01-01", c2, outsider);
    await actor(s);
    expect((await search()).rows).toHaveLength(1);
    await reject("select public.record_search('', $1)", [c2], "BF_FORBIDDEN");
    await actor(t);
    expect((await search()).total).toBe(2);
    await actor(other);
    expect((await search()).total).toBe(1);
  });
  it("searches older records beyond 1,000 with exact counts and stable pagination", async () => {
    await db.exec("reset role");
    await db.query(
      "insert into public.reading_logs(classroom_id,student_id,book,read_on,status,thought) select $1,$2,jsonb_build_object('title','오래된 책 '||n),'2020-01-01','completed','함께 생각해요' from generate_series(1,1031) n",
      [c, s],
    );
    await actor(t);
    const page = await search("reading", c, s, "오래된 책", null, null, "", 42);
    expect(page.total).toBe(1031);
    expect(page.rows).toHaveLength(6);
    expect(
      await search("reading", c, s, "오래된 책", null, null, "", 42),
    ).toEqual(page);
  });
  it("treats %, underscore and backslash as literal search text", async () => {
    await reading("성장 100%_완료\\기록");
    await reading("성장 100점 완료");
    await actor(t);
    expect((await search("", null, null, "100%_")).total).toBe(1);
    expect((await search("", null, null, "\\기록")).total).toBe(1);
  });
  it("applies dates, student, kind and status before pagination", async () => {
    await reading("첫날", "2026-01-01");
    await reading("다음날", "2026-01-02");
    await reading("친구 기록", "2026-01-02", c, peer);
    await actor(t);
    const found = await search(
      "reading",
      c,
      s,
      "",
      "2026-01-02",
      "2026-01-02",
      "completed",
    );
    expect(found.total).toBe(1);
    expect(found.rows[0].title).toBe("다음날");
  });
  it("rejects invalid date ranges, query sizes and pages", async () => {
    await actor(t);
    await reject(
      "select public.record_search('bogus')",
      [],
      "BF_INVALID_INPUT",
    );
    await reject(
      "select public.record_search('',null,null,$1)",
      ["x".repeat(101)],
      "BF_INVALID_INPUT",
    );
    await reject(
      "select public.record_search('',null,null,'','2026-02-01','2026-01-01')",
      [],
      "BF_INVALID_INPUT",
    );
    await reject(
      "select public.record_search('',null,null,'',null,null,'',0)",
      [],
      "BF_INVALID_INPUT",
    );
  });
  it("counts only the latest submitted version in teacher overview", async () => {
    await actor(s);
    const v1 = await one(
      "select * from public.submit_work($1,'첫 글','친구 마음을 생각했어요.',$2)",
      [a, randomUUID()],
    );
    await actor(t);
    await one(
      "select * from public.review_work($1,'근거를 더해요.','revision_requested')",
      [v1.id],
    );
    await actor(s);
    await one(
      "select * from public.submit_work($1,'고친 글','책 속 장면을 근거로 친구의 마음을 생각했어요.',$2)",
      [a, randomUUID()],
    );
    await actor(t);
    const o = await rpc("teacher_overview");
    expect(o.classes[0]).toMatchObject({
      students: 2,
      submitted: 1,
      revision: 0,
      missing: 1,
      overdue: 1,
    });
    expect(o.alerts.filter((x: any) => x.kind === "writing")).toHaveLength(1);
    expect((await search("writing")).total).toBe(2);
  });
  it("keeps unread watermarks monotonic without completing the pending activity", async () => {
    await reading();
    await actor(t);
    const o = await rpc("teacher_overview");
    expect(o.unread).toBe(1);
    await rpc("teacher_notices_read", [c, o.asOf]);
    await rpc("teacher_notices_read", [c, "2020-01-01T00:00:00Z"]);
    const next = await rpc("teacher_overview");
    expect(next.unread).toBe(0);
    expect(next.alertTotal).toBe(1);
    await reject(
      "select public.teacher_notices_read($1,now()+interval '1 day')",
      [c],
      "BF_INVALID_INPUT",
    );
  });
  it("makes a later role completion report unread again", async () => {
    await db.exec("reset role");
    const j = await one(
      "insert into public.class_jobs(classroom_id,title,description,reward,capacity) values($1,'책 소개','소개해요',7,1) returning id",
      [c],
    );
    const app = await one(
      "insert into public.job_applications(job_id,student_id,status,updated_at) values($1,$2,'pending','2020-01-01') returning id",
      [j.id, s],
    );
    await actor(t);
    const o = await rpc("teacher_overview");
    await rpc("teacher_notices_read", [c, o.asOf]);
    expect((await rpc("teacher_overview")).unread).toBe(0);
    await db.exec("reset role");
    await db.query(
      "update public.job_applications set status='submitted',report='배운 점을 보고해요',updated_at=clock_timestamp() where id=$1",
      [app.id],
    );
    await actor(t);
    expect((await rpc("teacher_overview")).unread).toBe(1);
  });
  it("rejects student overview and another teacher's notices", async () => {
    await actor(s);
    await reject("select public.teacher_overview()", [], "BF_FORBIDDEN");
    await actor(other);
    await reject("select public.teacher_overview($1)", [c], "BF_FORBIDDEN");
    await reject(
      "select public.teacher_notices_read($1,now())",
      [c],
      "BF_FORBIDDEN",
    );
    expect(
      (await rpc("teacher_overview")).classes.map((x: any) => x.id),
    ).toEqual([c2]);
  });
  it("does not expose withdrawn students' records in search or archives", async () => {
    await reading();
    await db.exec("reset role");
    await db.query(
      "update public.profiles set consent_status='pending' where id=$1",
      [s],
    );
    await actor(t);
    expect((await search()).total).toBe(0);
    expect((await rpc("class_learning_archive", [c])).records).toHaveLength(0);
    await actor(s);
    await reject("select public.record_search()", [], "BF_FORBIDDEN");
  });
  it("archives only the assigned class and never authentication credentials", async () => {
    await reading();
    await reading("다른 반 책", "2026-01-01", c2, outsider);
    await actor(t);
    const archive = await rpc("class_learning_archive", [c]);
    expect(archive.records).toHaveLength(1);
    expect(archive.classroom.id).toBe(c);
    expect(JSON.stringify(archive)).not.toMatch(
      /encrypted_password|access_token|login_id/,
    );
    await reject(
      "select public.class_learning_archive($1)",
      [c2],
      "BF_FORBIDDEN",
    );
    await actor(s);
    await reject(
      "select public.class_learning_archive($1)",
      [c],
      "BF_FORBIDDEN",
    );
  });
  it("does not grant direct notice mutations or any view mutation", async () => {
    await actor(t);
    await reject(
      "insert into public.teacher_notice_reads values($1,$2,now())",
      [t, c],
      "permission denied",
    );
    expect(
      (
        await one(
          "select has_table_privilege('authenticated','public.learning_record_index','delete') allowed",
        )
      ).allowed,
    ).toBe(false);
    await reject(
      "delete from public.learning_record_index",
      [],
      "cannot delete from view",
    );
  });
});
