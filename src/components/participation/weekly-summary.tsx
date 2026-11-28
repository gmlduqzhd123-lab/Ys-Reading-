import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { weekStart, type WeeklySummary } from "@/lib/weekly-summary";
import { formatOperationsDate } from "@/lib/operations";
export async function TeacherWeeklySummary({
  classroom,
  week,
}: {
  classroom: string;
  week?: string;
}) {
  let from;
  try {
    from = weekStart(week);
  } catch {
    from = weekStart();
  }
  let data: WeeklySummary | null = null;
  try {
    const c = await createClient(),
      r = await c
        .rpc("teacher_weekly_summary", {
          p_classroom: classroom || null,
          p_from: from,
        })
        .abortSignal(AbortSignal.timeout(5000));
    if (!r.error) data = r.data;
  } catch {}
  if (!data)
    return (
      <section className="panel">
        <h2>교사 주간 학습 요약</h2>
        <p role="status">
          주간 요약을 읽지 못했어요. 담당 학급과 조회 기간을 확인해 주세요.
        </p>
      </section>
    );
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10),
    lower = new Date(today + "T00:00:00Z"),
    upper = new Date(today + "T00:00:00Z");
  lower.setUTCDate(lower.getUTCDate() - 730);
  upper.setUTCDate(upper.getUTCDate() + 7);
  const min = lower.toISOString().slice(0, 10),
    max = upper.toISOString().slice(0, 10);
  const d = data,
    move = (days: number) => {
      const date = new Date(d.from + "T00:00:00Z");
      date.setUTCDate(date.getUTCDate() + days);
      return (
        "/hub?" +
        new URLSearchParams({
          tab: "overview",
          classroom,
          week: date.toISOString().slice(0, 10),
        })
      );
    };
  return (
    <section className="panel">
      <h2>교사 주간 학습 요약</h2>
      <form action="/hub" className="hub-inline">
        <input type="hidden" name="tab" value="overview" />
        <input type="hidden" name="classroom" value={classroom} />
        <label className="field">
          살펴볼 주의 날짜
          <input
            type="date"
            name="week"
            min={min}
            max={max}
            defaultValue={d.from}
          />
        </label>
        <button className="button button-outline">주간 요약 조회</button>
      </form>
      <p>
        {d.from} ~ {d.until} · 현재 참여·동의 기준 대상 {d.eligibleStudents}명 ·
        이번 주 기록 참여 {d.totals.participants}명
      </p>
      <div className="today-actions">
        <div>
          <strong>{d.totals.reading}</strong>
          <span>독서 기록 · 전주 {d.previous.reading}건</span>
        </div>
        <div>
          <strong>{d.totals.writing}</strong>
          <span>제출한 글의 판 · 전주 {d.previous.writing}건</span>
        </div>
        <div>
          <strong>{d.totals.revision}</strong>
          <span>두 번째 이후 고쳐쓴 판</span>
        </div>
        <div>
          <strong>{d.totals.feedback}</strong>
          <span>교사가 남긴 피드백</span>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table>
          <caption>날짜별 독서·글쓰기·피드백</caption>
          <thead>
            <tr>
              <th scope="col">한국 날짜</th>
              <th scope="col">독서 기록</th>
              <th scope="col">글의 제출판</th>
              <th scope="col">피드백</th>
            </tr>
          </thead>
          <tbody>
            {d.days.map((x) => (
              <tr key={x.day}>
                <th scope="row">{x.day}</th>
                <td>{x.reading}</td>
                <td>{x.writing}</td>
                <td>{x.feedback}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="button-row">
        {move(-7).split("week=")[1] >= min && (
          <Link className="button button-outline" href={move(-7)}>
            이전 주
          </Link>
        )}
        {move(7).split("week=")[1] <= max && (
          <Link className="button button-outline" href={move(7)}>
            다음 주
          </Link>
        )}
      </div>
      <h3>지금 7일 이상 교사 확인을 기다리는 글 {d.pendingCount}건</h3>
      {d.pending.length ? (
        d.pending.map((x) => (
          <p key={x.id}>
            {x.display_name} · {formatOperationsDate(x.created_at)} ·{" "}
            <Link
              href={
                "/hub?" +
                new URLSearchParams({
                  tab: "search",
                  kind: "writing",
                  classroom: x.classroom_id,
                  student: x.student_id,
                })
              }
            >
              이 학생의 원기록 확인
            </Link>
          </p>
        ))
      ) : (
        <p>현재 오래 대기한 확인 요청이 없습니다.</p>
      )}
      <p className="form-help">
        독서는 기록한 독서 날짜, 글·피드백은 작성 시각을 한국 날짜로 집계합니다.
        글의 각 제출판을 세며, 이 수치를 성적이나 학교 출결로 판정하지 않습니다.
        위 대기 목록은 현재 최신 제출본 기준이며 최대 20건을 먼저 표시합니다.
      </p>
    </section>
  );
}
