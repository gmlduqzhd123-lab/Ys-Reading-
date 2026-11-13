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
const fastActivity=`case when e.consent_status='verified' and e.account_active and not e.must_change_password then greatest(
 (select r.updated_at from public.learning_record_index r where r.kind='reading' and r.classroom_id=e.classroom_id and r.student_id=e.student_id order by r.updated_at desc limit 1),
 (select r.updated_at from public.learning_record_index r where r.kind='writing' and r.classroom_id=e.classroom_id and r.student_id=e.student_id order by r.updated_at desc limit 1),
 (select r.updated_at from public.learning_record_index r where r.kind='draft' and r.classroom_id=e.classroom_id and r.student_id=e.student_id order by r.updated_at desc limit 1)) else null end last_activity`;
const priorActivity="recent_activity as materialized(select r.classroom_id,r.student_id,max(r.updated_at) last_activity from public.learning_record_index r join classes c on c.id=r.classroom_id group by r.classroom_id,r.student_id), ";
const sql = `begin;set local statement_timeout='15s';
insert into public.reading_logs(classroom_id,student_id,book,read_on,status,thought) select '${f.classroom}','${f.mobile.id}',jsonb_build_object('title','CI-SCALE-'||n),'2025-01-01'::date+(n%365),'reading',repeat('합성 누적 자료입니다. ',30) from generate_series(1,30000)n;
analyze public.reading_logs;create temp table scale_metrics(scenario text,ms numeric,total integer,returned integer);grant all on scale_metrics to authenticated;
do $baseline$declare d text;begin d:=pg_get_functiondef('public.teacher_overview(uuid,integer)'::regprocedure);d:=replace(d,${quote(fastActivity)},'ra.last_activity');if position('ra.last_activity' in d)=0 then raise exception 'BASELINE_ANCHOR_MISSING';end if;d:=replace(d,'students as materialized(select e.*,',${quote(priorActivity)}||'students as materialized(select e.*,');d:=replace(d,'from roster e)','from roster e left join recent_activity ra using(classroom_id,student_id))');d:=replace(d,'public.teacher_overview(','pg_temp.overview_before_v05(');execute d;end $baseline$;
set local role authenticated;
do $$declare started timestamptz;r jsonb;baseline jsonb;q text;label text;begin perform set_config('request.jwt.claim.sub','${f.accounts[1].id}',true);perform set_config('request.jwt.claims',${quote(JSON.stringify(claims))},true);
for q,label in select * from(values('','all'),('CI-SCALE-23456','selective'),('NO-SCALE-MATCH-UNIQUE','none'))x(q,label) loop started:=clock_timestamp();r:=public.record_search('reading','${f.classroom}',null,q,null,null,'',1);if(label='all' and(r->>'total')::integer<30000)or(label='selective' and(r->>'total')::integer<>1)or(label='none' and(r->>'total')::integer<>0)then raise exception 'SCALE_RESULT_MISMATCH';end if;insert into scale_metrics values(label,round(extract(epoch from(clock_timestamp()-started))*1000),(r->>'total')::integer,jsonb_array_length(r->'rows'));end loop;
started:=clock_timestamp();baseline:=pg_temp.overview_before_v05('${f.classroom}',1);insert into scale_metrics values('overview_before',round(extract(epoch from(clock_timestamp()-started))*1000),null,jsonb_array_length(baseline->'students'));
started:=clock_timestamp();r:=public.teacher_overview('${f.classroom}',1);insert into scale_metrics values('overview',round(extract(epoch from(clock_timestamp()-started))*1000),null,jsonb_array_length(r->'students'));if r<>baseline then raise exception 'OVERVIEW_RESULT_MISMATCH';end if;
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
