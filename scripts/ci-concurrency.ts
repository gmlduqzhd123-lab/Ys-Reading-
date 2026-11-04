import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
if (process.env.GITHUB_ACTIONS !== "true" || process.env.BOOKFOREST_E2E !== "1")
  throw Error("ISOLATED_CI_ONLY");
const f = JSON.parse(fs.readFileSync("e2e/.runtime/fixtures.json", "utf8"));
if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(f.url))
  throw Error("LOCAL_TEST_PROJECT_REQUIRED");
const cfg = JSON.parse(
  execFileSync("npx", ["--no-install", "supabase", "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }),
);
const admin = createClient(f.url, cfg.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const classroomIds = [f.classroom, randomUUID(), randomUUID()],
  assignmentIds = [f.assignment, randomUUID(), randomUUID()];
const users: { id: string; email: string; password: string }[] = [];
const studentCount = 90;
for (let i = 0; i < studentCount; i++) {
  const email = "ci.load." + randomUUID() + "@example.com",
    password = "Load-CI-Only-" + randomUUID() + "aA!";
  const r = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "CI 동시사용 " + (i + 1) },
  });
  if (r.error || !r.data.user) throw Error("CI_LOAD_ACCOUNT_CREATE");
  users.push({ id: r.data.user.id, email, password });
}
const sql =
  classroomIds
    .slice(1)
    .map(
      (id, i) =>
        `insert into public.classrooms(id,name,teacher_id) values('${id}','CI 동시 학급 ${i + 2}','${f.accounts[1].id}');insert into public.assignments(id,classroom_id,mission_id,mission_snapshot) select '${assignmentIds[i + 1]}','${id}',mission_id,mission_snapshot from public.assignments where id='${f.assignment}';`,
    )
    .join("") +
  "update public.profiles set consent_status='verified' where id in (" +
  users.map((x) => "'" + x.id + "'").join(",") +
  ");insert into public.enrollments(classroom_id,student_id) values " +
  users
    .map((x, i) => "('" + classroomIds[i % 3] + "','" + x.id + "')")
    .join(",") +
  ";insert into public.reading_logs(classroom_id,student_id,book,read_on,status,thought) select e.classroom_id,e.student_id,'{\"title\":\"CI 과거 도서\"}'::jsonb,'2025-01-01'::date+g*10,'completed','기간별 조회용 합성 기록' from public.enrollments e cross join generate_series(1,30)g where e.student_id in (" +
  users.map((x) => "'" + x.id + "'").join(",") +
  ");";
execFileSync(
  "docker",
  [
    "exec",
    "-i",
    "supabase_db_bookforest",
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-q",
  ],
  { input: sql, stdio: ["pipe", "pipe", "pipe"] },
);
const date = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Seoul",
}).format(new Date());
function valid(r: { error: unknown; status?: number }, label: string) {
  if (!r.error) return;
  const error = r.error as { code?: string; message?: string };
  // Only error classifications belong in CI logs, never payloads or record text.
  const code = String(error.code ?? "UNKNOWN")
    .replace(/[^A-Za-z0-9_]/g, "")
    .slice(0, 40);
  const reason = /^BF_[A-Z0-9_]+$/.test(error.message ?? "")
    ? error.message
    : "";
  throw Error([label, code, r.status ?? 0, reason].join(":"));
}
const durations = await Promise.all(
  users.map(async (u, i) => {
    const c = createClient(f.url, f.key, {
        auth: { persistSession: false, autoRefreshToken: false },
      }),
      started = performance.now();
    valid(
      await c.auth.signInWithPassword({ email: u.email, password: u.password }),
      "CI_LOAD_LOGIN",
    );
    const request = randomUUID(),
      payload = {
        classroomId: classroomIds[i % 3],
        book: { title: "CI 동시사용 책", author: "합성 자료" },
        readOn: date,
        status: "completed",
        thought: "동시 요청에서 보존할 합성 생각 " + i,
      };
    const reading = await c.rpc("hub_command", {
      p_command: "reading_save",
      p_payload: payload,
      p_request_id: request,
    });
    valid(reading, "CI_LOAD_READING");
    const again = await c.rpc("hub_command", {
      p_command: "reading_save",
      p_payload: payload,
      p_request_id: request,
    });
    valid(again, "CI_LOAD_RETRY");
    if (reading.data.id !== again.data.id) throw Error("CI_LOAD_DUPLICATE");
    const submit = randomUUID(),
      title = "CI 동시 제출 " + i,
      body =
        "함께 읽고 생각을 나누었습니다. 이 글은 동시 사용 검사를 위한 합성 문장입니다.";
    const args = {
      p_assignment_id: assignmentIds[i % 3],
      p_title: title,
      p_body: body,
      p_request_id: submit,
    };
    const [a, b] = await Promise.all([
      c.rpc("submit_work", args),
      c.rpc("submit_work", args),
    ]);
    valid(a, "CI_LOAD_SUBMIT");
    valid(b, "CI_LOAD_SUBMIT_RETRY");
    if (a.data.id !== b.data.id) throw Error("CI_LOAD_SUBMISSION_DUPLICATE");
    const attendance = {
      p_command: "attendance",
      p_payload: { classroomId: classroomIds[i % 3] },
      p_request_id: randomUUID(),
    };
    valid(await c.rpc("hub_command", attendance), "CI_LOAD_ATTENDANCE");
    valid(await c.rpc("hub_command", attendance), "CI_LOAD_ATTENDANCE_RETRY");
    const own = await c.from("reading_logs").select("student_id");
    valid(own, "CI_LOAD_RLS");
    if (own.data?.some((x) => x.student_id !== u.id))
      throw Error("CI_LOAD_TENANT_LEAK");
    await c.auth.signOut();
    valid(
      await c.auth.signInWithPassword({ email: u.email, password: u.password }),
      "CI_LOAD_RELOGIN",
    );
    return performance.now() - started;
  }),
);
const ids = users.map((x) => x.id);
const readings = await admin
    .from("reading_logs")
    .select("id")
    .eq("book->>title", "CI 동시사용 책")
    .in("student_id", ids),
  submissions = await admin
    .from("submissions")
    .select("id")
    .in("student_id", ids),
  events = await admin
    .from("activity_events")
    .select("id")
    .eq("kind", "attendance")
    .in("student_id", ids);
for (const r of [readings, submissions, events])
  if (r.error || r.data.length !== studentCount)
    throw Error("CI_LOAD_PERSISTENCE_MISMATCH");
durations.sort((a, b) => a - b);
const p95 = Math.round(durations[Math.ceil(durations.length * 0.95) - 1]);
if (p95 > 60000) throw Error("CI_LOAD_LATENCY_BUDGET");
console.log(
  JSON.stringify({
    environment: "isolated-github-runner",
    concurrentStudents: studentCount,
    classrooms: 3,
    historicalReadings: studentCount * 30,
    readings: studentCount,
    submissions: studentCount,
    attendance: studentCount,
    duplicateRecords: 0,
    foreignRecords: 0,
    flowP95Ms: p95,
    schoolHardwareVerified: false,
  }),
);
