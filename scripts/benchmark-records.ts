import { runtimeDb, asUser } from "../tests/helpers/runtime-db";
if (!process.argv.includes("--local-synthetic"))
  throw Error("LOCAL_SYNTHETIC_FLAG_REQUIRED");
const db = await runtimeDb(),
  t = "10000000-0000-4000-8000-000000000001",
  s = "20000000-0000-4000-8000-000000000001",
  c = "30000000-0000-4000-8000-000000000001";
try {
  await db.query("insert into auth.users(id) values($1),($2)", [t, s]);
  await db.query("update public.profiles set role='teacher' where id=$1", [t]);
  await db.exec("update public.profiles set consent_status='verified'");
  await db.query(
    "insert into public.classrooms(id,name,teacher_id) values($1,'합성 성능 교실',$2)",
    [c, t],
  );
  await db.query(
    "insert into public.enrollments(classroom_id,student_id) values($1,$2)",
    [c, s],
  );
  await db.query(
    "insert into public.reading_logs(classroom_id,student_id,book,read_on,status,thought) select $1,$2,jsonb_build_object('title','합성 도서 '||n),'2025-01-01'::date+(n%365),'reading',repeat('누적 기록 성능 검사용 문장입니다. ',30)||n from generate_series(1,30000)n",
    [c, s],
  );
  await db.exec("analyze public.reading_logs;begin");
  await asUser(db, t);
  const metrics = [];
  for (const query of ["", "도서 23456", "없는검색어"]) {
    const started = performance.now(),
      r = await db.query<{ v: any }>(
        "select public.record_search('reading',$1,null,$2,null,null,'',1) v",
        [c, query],
      );
    metrics.push({
      scenario: query
        ? query === "없는검색어"
          ? "no-match"
          : "selective"
        : "all",
      ms: Math.round(performance.now() - started),
      total: r.rows[0].v.total,
      returned: r.rows[0].v.rows.length,
    });
  }
  console.log(
    JSON.stringify({
      engine: "local-PGlite",
      syntheticRecords: 30000,
      metrics,
    }),
  );
  await db.exec("rollback");
} finally {
  await db.close();
}
