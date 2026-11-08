import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
if (process.env.GITHUB_ACTIONS !== "true" || process.env.BOOKFOREST_E2E !== "1")
  throw Error("ISOLATED_CI_ONLY");
const f = JSON.parse(fs.readFileSync("e2e/.runtime/fixtures.json", "utf8"));
if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(f.url))
  throw Error("LOCAL_TEST_PROJECT_REQUIRED");
const user = createClient(f.url, f.key, { auth: { persistSession: false } }),
  login = await user.auth.signInWithPassword({
    email: f.accounts[1].email,
    password: f.accounts[1].password,
  });
if (login.error || !login.data.session) throw Error("SCALE_LOGIN_FAILED");
const claims = JSON.parse(
    Buffer.from(
      login.data.session.access_token.split(".")[1],
      "base64url",
    ).toString(),
  ),
  quote = (s: string) => "'" + s.replaceAll("'", "''") + "'";
const sql = `begin;set local statement_timeout='15s';
insert into public.reading_logs(classroom_id,student_id,book,read_on,status,thought) select '${f.classroom}','${f.mobile.id}',jsonb_build_object('title','CI-SCALE-'||n),'2025-01-01'::date+(n%365),'reading',repeat('합성 누적 자료입니다. ',30) from generate_series(1,30000)n;
analyze public.reading_logs;create temp table scale_metrics(scenario text,ms numeric,total integer,returned integer);grant all on scale_metrics to authenticated;set local role authenticated;
do $$declare started timestamptz;r jsonb;q text;label text;begin perform set_config('request.jwt.claim.sub','${f.accounts[1].id}',true);perform set_config('request.jwt.claims',${quote(JSON.stringify(claims))},true);
for q,label in select * from(values('','all'),('CI-SCALE-23456','selective'),('NO-SCALE-MATCH-UNIQUE','none'))x(q,label) loop started:=clock_timestamp();r:=public.record_search('reading','${f.classroom}',null,q,null,null,'',1);if(label='all' and(r->>'total')::integer<30000)or(label='selective' and(r->>'total')::integer<>1)or(label='none' and(r->>'total')::integer<>0)then raise exception 'SCALE_RESULT_MISMATCH';end if;insert into scale_metrics values(label,round(extract(epoch from(clock_timestamp()-started))*1000),(r->>'total')::integer,jsonb_array_length(r->'rows'));end loop;
started:=clock_timestamp();r:=public.teacher_overview('${f.classroom}',1);insert into scale_metrics values('overview',round(extract(epoch from(clock_timestamp()-started))*1000),null,jsonb_array_length(r->'students'));
end $$;reset role;select jsonb_build_object('engine','isolated-native-PostgreSQL','syntheticRecords',30000,'metrics',(select jsonb_agg(to_jsonb(x)) from scale_metrics x));rollback;`;
const output = execFileSync(
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
    "-Atq",
  ],
  {
    input: sql,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 120000,
    maxBuffer: 100000,
  },
);
const result = JSON.parse(output.trim());
if (result.metrics.some((m: { ms: number }) => m.ms > 10000))
  throw Error("SCALE_LATENCY_BUDGET_EXCEEDED");
console.log(JSON.stringify(result));
