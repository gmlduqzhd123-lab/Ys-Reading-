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
const owner = createClient(f.url, f.key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
function checked<T extends { data: unknown; error: unknown }>(
  r: T,
  code: string,
): NonNullable<T["data"]> {
  if (r.error || r.data === null || r.data === undefined) throw Error(code);
  return r.data as NonNullable<T["data"]>;
}
checked(
  await owner.auth.signInWithPassword({
    email: f.accounts[1].email,
    password: f.accounts[1].password,
  }),
  "CI_STAFF_OWNER_LOGIN",
);
const accounts: {
  id: string;
  email: string;
  password: string;
  kind: string;
}[] = [];
for (const kind of ["review", "students"]) {
  const email = "ci.delegate." + randomUUID() + "@example.com",
    password = "Delegate-CI-" + randomUUID() + "aA!";
  const data = checked(
    await admin.auth.admin.createUser({ email, password, email_confirm: true }),
    "CI_STAFF_CREATE",
  );
  if (!data.user) throw Error("CI_STAFF_CREATE");
  accounts.push({ id: data.user.id, email, password, kind });
}
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
    input:
      "update public.profiles set role='teacher',consent_status='verified' where id in (" +
      accounts.map((x) => "'" + x.id + "'").join(",") +
      ");",
    stdio: ["pipe", "pipe", "pipe"],
  },
);
async function command(client: typeof owner, name: string, payload: unknown) {
  return checked(
    await client.rpc("collaboration_command", {
      p_command: name,
      p_payload: payload,
      p_request_id: randomUUID(),
    }),
    "CI_STAFF_COMMAND",
  );
}
const clients = [];
for (const account of accounts) {
  const inv = await command(owner, "invite", {
    kind: "classroom",
    classroom: f.classroom,
    target: account.id,
    permissions: [account.kind],
  });
  const client = createClient(f.url, f.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  checked(
    await client.auth.signInWithPassword({
      email: account.email,
      password: account.password,
    }),
    "CI_STAFF_LOGIN",
  );
  await command(client, "accept", { code: inv.code });
  clients.push(client);
}
const [reviewer, studentAdmin] = clients;
const submitted = checked(
  await reviewer
    .from("submissions")
    .select("id,student_id")
    .eq("status", "submitted")
    .limit(1),
  "CI_STAFF_READ",
);
if (submitted.length !== 1) throw Error("CI_STAFF_REVIEW_TARGET");
const reviewArgs = {
  p_submission_id: submitted[0].id,
  p_body: "합성 작품의 근거와 표현을 확인했습니다.",
  p_decision: "completed",
};
checked(await reviewer.rpc("review_work", reviewArgs), "CI_STAFF_REVIEW");
checked(await reviewer.rpc("review_work", reviewArgs), "CI_STAFF_REVIEW_RETRY");
const events = checked(
  await admin
    .from("activity_events")
    .select("id")
    .eq("student_id", submitted[0].student_id)
    .eq("kind", "mission"),
  "CI_STAFF_REWARD",
);
if (events.length !== 1) throw Error("CI_STAFF_DUPLICATE_REWARD");
const hidden = checked(
  await studentAdmin.from("reading_logs").select("id"),
  "CI_STAFF_ADMIN_READ",
);
if (hidden.length) throw Error("CI_STAFF_ADMIN_BODY_EXPOSED");
const hiddenWriting = checked(
  await studentAdmin.from("submissions").select("id"),
  "CI_STAFF_ADMIN_WRITING",
);
if (hiddenWriting.length) throw Error("CI_STAFF_ADMIN_WRITING_EXPOSED");
async function edge(input: unknown) {
  const session = (await studentAdmin.auth.getSession()).data.session!;
  const r = await fetch(f.url + "/functions/v1/account-operations", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + session.access_token,
      apikey: f.key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  return { status: r.status, data: await r.json() };
}
const loginId = "delegate" + randomUUID().replaceAll("-", "").slice(0, 16),
  password = "Issued-CI-" + randomUUID() + "aA!";
const input = {
  kind: "create_students",
  classroomId: f.classroom,
  students: [{ loginId, name: "CI 위임 발급", password }],
  requestId: randomUUID(),
};
const issued = await edge(input);
if (!issued.data.ok) throw Error("CI_STAFF_EDGE_ISSUANCE");
const rows = checked(
  await admin.from("profiles").select("id").eq("display_name", "CI 위임 발급"),
  "CI_STAFF_ISSUED_PROFILE",
);
if (rows.length !== 1) throw Error("CI_STAFF_ISSUED_PROFILE");
const student = createClient(f.url, f.key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
checked(
  await student.auth.signInWithPassword({
    email: loginId + "@students.bookforest.invalid",
    password,
  }),
  "CI_STAFF_ISSUED_LOGIN",
);
const foreign = checked(
  await owner.rpc("create_classroom", { p_name: "CI 다른 위임 범위" }),
  "CI_STAFF_FOREIGN_CLASS",
);
const denied = await edge({
  ...input,
  classroomId: foreign.id,
  requestId: randomUUID(),
  students: [
    {
      loginId: "wrong" + randomUUID().replaceAll("-", "").slice(0, 16),
      name: "CI 거부",
      password,
    },
  ],
});
if (denied.data.ok) throw Error("CI_STAFF_CROSS_CLASS");
const state = checked(
  await owner.rpc("collaboration_state", {
    p_classroom: f.classroom,
    p_page: 1,
  }),
  "CI_STAFF_CURRENT",
);
const membership = state.staff.find(
  (x: { id: string }) => x.id === accounts[1].id,
);
await command(owner, "revoke_staff", {
  classroom: f.classroom,
  target: accounts[1].id,
  revision: membership.revision,
});
const revoked = await edge({
  ...input,
  requestId: randomUUID(),
  students: [
    {
      loginId: "revoked" + randomUUID().replaceAll("-", "").slice(0, 16),
      name: "CI 회수",
      password,
    },
  ],
});
if (revoked.data.ok) throw Error("CI_STAFF_REVOKED_WRITE");
console.log(
  JSON.stringify({
    environment: "isolated-github-runner",
    delegatedWritingReview: true,
    oneRewardForRetry: true,
    scopedStudentIssuance: true,
    issuedAccountLogin: true,
    studentAdminCannotReadWriting: true,
    crossClassDenied: true,
    revocationDenied: true,
  }),
);
