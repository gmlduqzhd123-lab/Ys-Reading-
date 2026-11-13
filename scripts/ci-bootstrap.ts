import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID,randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { missions } from "../src/lib/missions";
import { totp } from "../e2e/totp";
if (process.env.GITHUB_ACTIONS !== "true") throw Error("ISOLATED_CI_ONLY");
const config = JSON.parse(
  execFileSync("npx", ["--no-install", "supabase", "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }),
);
const url = config.API_URL,
  key = config.ANON_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(url))
  throw Error("LOCAL_TEST_PROJECT_REQUIRED");
let workerReady = false;
for (let attempt = 0; attempt < 40; attempt++) {
  try {
    const r = await fetch(url + "/functions/v1/account-operations");
    if (r.status === 405) {
      workerReady = true;
      break;
    }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 1500));
}
if (!workerReady) throw Error("CI_WORKER_NOT_READY");
const admin = createClient(url, config.SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  }),
  password = "Bookforest-CI-Only-482!aA",
  nextPassword = "Bookforest-CI-Next-837!aA";
async function result<R extends { data: unknown; error: unknown }>(
  r: R,
  label: string,
): Promise<R["data"]> {
  if (r.error) {
    const e = r.error as { code?: string; status?: number };
    throw Error(
      label +
        ":" +
        String(e.code ?? "unknown")
          .replace(/[^a-zA-Z0-9_]/g, "")
          .slice(0, 80) +
        ":" +
        (e.status ?? 0),
    );
  }
  return r.data;
}
const accounts = [];
for (const kind of ["operator", "teacher"]) {
  const email = `ci.${kind}.${randomUUID()}@example.com`,
    r = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: "CI " + kind },
    });
  if (r.error || !r.data.user) throw Error("CI_AUTH_CREATE");
  accounts.push({ kind, email, password, id: r.data.user.id });
}
const ids = accounts.map((x) => "'" + x.id + "'").join(",");
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
  {
    input: `update public.profiles set role='teacher',consent_status='verified' where id in (${ids});select public.bootstrap_operator('${accounts[0].id}');`,
    stdio: ["pipe", "pipe", "pipe"],
  },
);
const seeded = await admin.from("missions").upsert(
  missions.map((m) => ({
    id: m.id,
    slug: m.slug,
    title: m.title,
    theme: m.theme,
    grade_band: m.grade_band,
    prompt: m.prompt,
    description: m.description,
    minutes: m.minutes,
    requires_revision: m.requires_revision,
    steps: m.steps,
    kind: m.kind,
  })),
);
if (seeded.error) throw Error("CI_MISSION_SEED");
const teacher = createClient(url, key, { auth: { persistSession: false } });
await result(
  await teacher.auth.signInWithPassword({ email: accounts[1].email, password }),
  "CI_TEACHER_LOGIN",
);
const cls = await result(
  await teacher.rpc("create_classroom", { p_name: "CI 검증 학급" }),
  "CI_CLASS_CREATE",
);
await result(
  await teacher.rpc("growth_term_command", {
    p_command: "configure",
    p_payload: {
      classroomId: cls.id,
      revision: 0,
      year: 2026,
      semester: 2,
      grade: 3,
    },
    p_request_id: randomUUID(),
  }),
  "CI_TERM",
);
const assignment = await result(
  await teacher.rpc("assign_mission", {
    p_classroom_id: cls.id,
    p_mission_id: missions.find(
      (m) => !m.requires_revision && m.kind === "writing",
    )!.id,
  }),
  "CI_ASSIGN",
);
const loginId = "ci" + randomUUID().replaceAll("-", "").slice(0, 12);
async function edge(client: typeof teacher, input: unknown) {
  const session = (await client.auth.getSession()).data.session!;
  const r = await fetch(url + "/functions/v1/account-operations", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + session.access_token,
      apikey: key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const data = await r.json();
  if (!r.ok || !data.ok) throw Error("CI_EDGE_" + (data.code ?? "FAILED"));
  return data;
}
await edge(teacher, {
  kind: "create_students",
  requestId: randomUUID(),
  classroomId: cls.id,
  students: [{ loginId, name: "CI 새싹", password }],
});
const roster = await result(
  await teacher.rpc("operations_workspace", {
    p_classroom: cls.id,
    p_filters: {},
  }),
  "CI_ROSTER",
);
const studentId = roster.students[0].id;
const student = createClient(url, key, { auth: { persistSession: false } });
await result(
  await student.auth.signInWithPassword({
    email: loginId + "@students.bookforest.invalid",
    password,
  }),
  "CI_STUDENT_LOGIN",
);
await edge(student, {
  kind: "change_password",
  requestId: randomUUID(),
  currentPassword: password,
  password: nextPassword,
});
const date = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Seoul",
}).format(new Date());
await result(
  await teacher.rpc("operations_command", {
    p_command: "consent_request",
    p_payload: {
      studentId,
      classroomId: cls.id,
      method: "paper",
      reference: "CI-SYNTHETIC-CONSENT",
      confirmedOn: date,
    },
    p_request_id: randomUUID(),
  }),
  "CI_CONSENT",
);
await result(
  await teacher.rpc("hub_command", {
    p_command: "shop_create",
    p_payload: {
      classroomId: cls.id,
      name: "CI 별 상품",
      price: 3,
      stock: 10,
      kind: "privilege",
    },
    p_request_id: randomUUID(),
  }),
  "CI_SHOP",
);
const operator = createClient(url, key, { auth: { persistSession: false } });
await result(
  await operator.auth.signInWithPassword({
    email: accounts[0].email,
    password,
  }),
  "CI_OPERATOR_LOGIN",
);
const enrollment = await operator.auth.mfa.enroll({
  factorType: "totp",
  friendlyName: "CI only",
});
if (enrollment.error) throw Error("CI_MFA_ENROLL");
await result(
  await operator.auth.mfa.challengeAndVerify({
    factorId: enrollment.data.id,
    code: totp(enrollment.data.totp.secret),
  }),
  "CI_MFA_VERIFY",
);
fs.mkdirSync("e2e/.runtime", { recursive: true, mode: 0o700 });
const mobileLogin = "mobile" + randomUUID().replaceAll("-", "").slice(0, 12);
const mobileUser = await admin.auth.admin.createUser({
  email: mobileLogin + "@students.bookforest.invalid",
  password: nextPassword,
  email_confirm: true,
  user_metadata: { display_name: "CI 모바일 학생" },
});
if (mobileUser.error || !mobileUser.data.user) throw Error("CI_MOBILE_ACCOUNT");
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
  {
    input: `update public.profiles set consent_status='verified',must_change_password=false where id='${mobileUser.data.user.id}';insert into public.enrollments(classroom_id,student_id) values('${cls.id}','${mobileUser.data.user.id}');`,
    stdio: ["pipe", "pipe", "pipe"],
  },
);
const workshopLogin='workshop'+randomUUID().replaceAll('-','').slice(0,12),workshopClass=randomUUID();
const workshopUser=await admin.auth.admin.createUser({email:workshopLogin+'@students.bookforest.invalid',password:nextPassword,email_confirm:true,user_metadata:{display_name:'CI 공방 학생'}});
if(workshopUser.error||!workshopUser.data.user)throw Error('CI_WORKSHOP_ACCOUNT');
execFileSync('docker',['exec','-i','supabase_db_bookforest','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-q'],{input:`update public.profiles set consent_status='verified',must_change_password=false where id='${workshopUser.data.user.id}';insert into public.classrooms(id,name,teacher_id,created_at) values('${workshopClass}','CI 수업 공방','${accounts[1].id}','2020-01-01');insert into public.enrollments(classroom_id,student_id) values('${workshopClass}','${workshopUser.data.user.id}');`,stdio:['pipe','pipe','pipe']});
const workshopTouch:Record<string,string>={};
for(const engine of ['android-chrome','webkit-mobile']){const id=randomUUID();workshopTouch[engine]=id;execFileSync('docker',['exec','-i','supabase_db_bookforest','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-q'],{input:`insert into public.classrooms(id,name,teacher_id,created_at) values('${id}','CI 모바일 공방','${accounts[1].id}','2019-01-01');insert into public.enrollments(classroom_id,student_id) values('${id}','${workshopUser.data.user.id}');`,stdio:['pipe','pipe','pipe']});}
fs.writeFileSync(
  "e2e/.runtime/fixtures.json",
  JSON.stringify({
    url,
    key,
    accounts,
    student: { loginId, password: nextPassword, id: studentId },
    mobile: {
      loginId: mobileLogin,
      password: nextPassword,
      id: mobileUser.data.user.id,
    },
    classroom: cls.id,
    workshopTouch,
    workshop:{classroom:workshopClass,student:{id:workshopUser.data.user.id,loginId:workshopLogin,password:nextPassword}},
    assignment: assignment.id,
    operatorSecret: enrollment.data.totp.secret,
  }),
  { mode: 0o600 },
);
execFileSync("docker",["exec","-i","supabase_db_bookforest","psql","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-q"],{input:`insert into public.reading_logs(classroom_id,student_id,book,read_on,status,thought) select '${cls.id}','${mobileUser.data.user.id}',jsonb_build_object('title','CI 묶음 기록 '||n),'2024-02-01'::date+(n-1),'reading','분할 내보내기 합성 자료' from generate_series(1,28)n;`,stdio:["pipe","pipe","pipe"]});
const budgetSecret=randomBytes(32).toString("hex");
console.log('::add-mask::'+budgetSecret);
const dbInfo=JSON.parse(execFileSync("docker",["inspect","supabase_db_bookforest"],{encoding:"utf8"}))[0];
const gateway=Object.values(dbInfo.NetworkSettings.Networks).map((v:any)=>String(v.Gateway)).find(v=>/^172\.[0-9.]+$/.test(v));
if(!gateway)throw Error("ISOLATED_WORKER_GATEWAY_REQUIRED");
execFileSync("docker",["exec","-i","supabase_db_bookforest","psql","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-q"],{input:`create extension if not exists pg_net with schema extensions; update private.zip_worker_config set url='http://${gateway}:3096/api/exports/worker' where singleton;`,stdio:["pipe","pipe","pipe"]});
execFileSync("docker",["exec","-i","supabase_db_bookforest","psql","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-q"],{input:`insert into private.api_request_keys values(true,decode('${budgetSecret}','hex')) on conflict(id) do update set secret=excluded.secret;`,stdio:["pipe","pipe","pipe"]});
if (process.env.GITHUB_ENV)
  fs.appendFileSync(
    process.env.GITHUB_ENV,
    `NEXT_PUBLIC_SUPABASE_URL=${url}\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${key}\nNEXT_PUBLIC_APP_URL=http://127.0.0.1:3096\nBOOKFOREST_E2E=1\nBOOKFOREST_LIMITER_SECRET=${budgetSecret}\n`,
  );
console.log(
  "Isolated CI fixtures ready. Production data and credentials were not used.",
);
