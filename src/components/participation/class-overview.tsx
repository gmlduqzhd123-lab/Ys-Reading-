"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import type { ClassOverview } from "@/lib/classroom-insights";
import { searchHref } from "@/lib/classroom-insights";
import { formatOperationsDate } from "@/lib/operations";
import { markClassNotices } from "@/app/hub/insights-actions";
const labels: Record<string, string> = {
  writing: "새 글·재제출",
  reading: "완독 확인",
  role: "역할 신청·완료 보고",
  plaza: "광장 게시 신청",
  exhibition: "전시 참여 신청",
};
export function ClassOverviewPanel({
  data,
  classroom,
  classes,
  canReview = true,
  owns = true,
}: {
  data: ClassOverview;
  classroom: string;
  classes: { id: string; name: string }[];
  canReview?: boolean;
  owns?: boolean;
}) {
  const [notice, setNotice] = useState(""),
    [busy, start] = useTransition();
  const totals = data.classes.reduce(
    (a, c) => ({
      students: a.students + c.students,
      ready: a.ready + c.ready,
      missing: a.missing + c.missing,
      overdue: a.overdue + c.overdue,
      submitted: a.submitted + c.submitted,
      revision: a.revision + c.revision,
      reading: a.reading + c.reading,
    }),
    {
      students: 0,
      ready: 0,
      missing: 0,
      overdue: 0,
      submitted: 0,
      revision: 0,
      reading: 0,
    },
  );
  const href = (page: number) =>
    `/hub?tab=overview&classroom=${classroom}&page=${page}`;
  return (
    <section className="insights-page">
      <div className="hub-row">
        <div>
          <span className="eyebrow">CLASSROOM AT A GLANCE</span>
          <h2>우리 반 현황·알림</h2>
        </div>
        <Link href="/status" className="button button-outline">
          연결 점검·기록 보관
        </Link>
      </div>
      <p>
        배정된 활동과 최신 제출 버전을 집계합니다. 미제출은 학생별 활동 수이며
        성취도나 학교 출결을 뜻하지 않아요.
      </p>
      <div className="button-row">
        <Link href="/start" className="button button-primary">
          우리 반 시작하기
        </Link>
        {canReview && (
          <Link href="/hub?tab=review" className="button button-outline">
            학생 기록 확인
          </Link>
        )}
        {owns && (
          <Link href="/hub?tab=packs" className="button button-outline">
            수업 꾸러미
          </Link>
        )}
      </div>
      <form action="/hub" className="hub-inline">
        <input type="hidden" name="tab" value="overview" />
        <label className="field">
          담당 학급
          <select name="classroom" defaultValue={classroom}>
            <option value="">모든 담당 학급</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button className="button button-primary">현황 보기</button>
        <Link href="/hub?tab=overview" className="text-link">
          전체 학급
        </Link>
      </form>
      <div className="insight-metrics">
        {[
          ["참여 준비", `${totals.ready} / ${totals.students}명`],
          ["미제출 활동", `${totals.missing}건`],
          ["기한 지난 미제출", `${totals.overdue}건`],
          ["새 글 확인", `${totals.submitted}건`],
          ["고쳐쓰기 기다림", `${totals.revision}건`],
          ["완독 확인", `${totals.reading}건`],
        ].map(([l, n]) => (
          <div key={l}>
            <strong>{n}</strong>
            <span>{l}</span>
          </div>
        ))}
      </div>
      <p className="form-help">
        집계 시각 {formatOperationsDate(data.asOf)} · 화면을 다시 열거나 ‘새
        활동·피드백 불러오기’로 갱신해 주세요.
      </p>
      <section className="panel">
        <h3>책숲 알림 · 읽지 않음 {data.unread}건</h3>
        <p>
          현재 처리할 활동 {data.alertTotal}건 중 최근 알림 50건을 표시합니다.
          읽음 표시는 활동의 완료·승인을 대신하지 않습니다.
        </p>
        {notice && (
          <p role="status" className="notice">
            {notice}
          </p>
        )}
        <div className="button-row">
          {data.classes
            .filter((c) => c.unread > 0)
            .map((c) => (
              <button
                disabled={busy}
                className="button button-outline"
                key={c.id}
                onClick={() =>
                  start(async () => {
                    try {
                      setNotice(
                        (await markClassNotices(c.id, data.asOf)).message,
                      );
                    } catch {
                      setNotice("연결을 확인하고 다시 시도해 주세요.");
                    }
                  })
                }
              >
                {c.name} 알림 읽음 표시
              </button>
            ))}
        </div>
        {!data.alerts.length && (
          <p className="hub-empty">지금 확인할 새 활동이 없어요.</p>
        )}
        <ul className="insight-alerts">
          {data.alerts.map((a) => (
            <li key={a.kind + a.id}>
              <span
                className={a.unread ? "status-pill submitted" : "status-pill"}
              >
                {a.unread ? "새 알림" : "읽음"}
              </span>
              <div>
                <strong>
                  {a.student_name} · {labels[a.kind]}
                </strong>
                <small>
                  {data.classes.find((c) => c.id === a.classroom_id)?.name} ·{" "}
                  {formatOperationsDate(a.at)}
                </small>
              </div>
              <Link
                className="text-link"
                href={
                  a.kind === "role"
                    ? "/hub?tab=economy"
                    : a.kind === "plaza"
                      ? "/hub?tab=plaza"
                      : a.kind === "exhibition"
                        ? "/hub?tab=exhibitions"
                        : searchHref({
                            kind: a.kind as "writing" | "reading",
                            classroom: a.classroom_id,
                            student: a.student_id,
                            status:
                              a.kind === "writing" ? "submitted" : "completed",
                          })
                }
              >
                기록 확인 →
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel">
        <h3>학생별 이어보기</h3>
        <p>
          참여 준비 전 학생은 활동 수를 0으로 표시합니다. 도움의 필요성은
          선생님이 직접 확인해 주세요.
        </p>
        <div className="table-scroll">
          <table className="insight-table">
            <thead>
              <tr>
                <th>학생·학급</th>
                <th>참여 상태</th>
                <th>미제출 / 기한 지남</th>
                <th>고쳐쓰기</th>
                <th>최근 학습 기록</th>
                <th>이동</th>
              </tr>
            </thead>
            <tbody>
              {data.students.map((s) => (
                <tr key={s.classroom_id + s.student_id}>
                  <td>
                    {s.display_name}
                    <small>
                      {data.classes.find((c) => c.id === s.classroom_id)?.name}
                    </small>
                  </td>
                  <td>
                    {!s.account_active
                      ? "이용 중지"
                      : s.must_change_password
                        ? "첫 비밀번호 변경"
                        : s.consent_status !== "verified"
                          ? "동의 확인 대기"
                          : "참여 가능"}
                  </td>
                  <td>
                    {s.missing} / {s.overdue}
                  </td>
                  <td>{s.revision}</td>
                  <td>
                    {s.last_activity
                      ? formatOperationsDate(s.last_activity)
                      : "아직 없음"}
                  </td>
                  <td>
                    <Link
                      href={searchHref({
                        classroom: s.classroom_id,
                        student: s.student_id,
                      })}
                    >
                      기록 찾기
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <nav className="hub-row" aria-label="학생 현황 페이지">
          {data.page > 1 && <Link href={href(data.page - 1)}>이전 학생</Link>}
          <span>
            {data.studentTotal}명 · {data.page}페이지
          </span>
          {data.page * data.pageSize < data.studentTotal && (
            <Link href={href(data.page + 1)}>다음 학생</Link>
          )}
        </nav>
      </section>
    </section>
  );
}
