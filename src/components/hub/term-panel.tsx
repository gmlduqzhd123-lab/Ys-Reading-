"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  nextPeriod,
  termLabel,
  type TermState,
  type TermClass,
} from "@/lib/growth-terms";
import { formatOperationsDate } from "@/lib/operations";
import { GrowthTermForm } from "./growth-term-form";
import { Empty, Field, Panel, string } from "./shared";
function PeriodFields({
  year,
  semester,
  grade,
}: {
  year: number;
  semester: number;
  grade: number | null;
}) {
  return (
    <div className="term-period-fields">
      <Field
        name="year"
        label="학년도"
        type="number"
        min={2000}
        max={2100}
        defaultValue={year}
      />
      <label className="field">
        학기
        <select name="semester" defaultValue={semester}>
          <option value="1">1학기</option>
          <option value="2">2학기</option>
        </select>
      </label>
      <label className="field">
        학년
        <select name="grade" defaultValue={grade ?? ""}>
          <option value="">지정하지 않음</option>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              {n}학년
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
const confirmation = (text: string) => (
  <label className="term-check">
    <input name="confirmed" type="checkbox" required />
    {text}
  </label>
);
export function TermPanel({
  state,
  teacher,
}: {
  state: TermState;
  teacher: boolean;
}) {
  const router = useRouter(),
    [notice, setNotice] = useState("");
  const c = state.classes.find((c) => c.id === state.selected);
  const currentYear = Number(
    new Intl.DateTimeFormat("en", {
      year: "numeric",
      timeZone: "Asia/Seoul",
    }).format(new Date(state.asOf)),
  );
  const common = (f: FormData) => ({
    classroomId: c!.id,
    revision: c!.term_revision,
    confirmed: f.get("confirmed") === "on",
  });
  const defaults =
    c?.academic_year && c.semester
      ? nextPeriod(c.academic_year, c.semester)
      : { year: currentYear, semester: 1 };
  const done = (message: string) => () => setNotice(message);
  return (
    <div className="term-page">
      <Panel
        title={
          teacher ? "학기를 마무리하고, 다음 책숲으로" : "나의 학기 이야기"
        }
      >
        <p>
          글과 독서 기록은 그때의 학급에 남고, 나의 계정·경험치·장식은 다음
          학기로 이어집니다. 학급 화폐는 새 학급에서 따로 시작해요.
        </p>
        {notice && (
          <p role="status" className="notice">
            {notice}
          </p>
        )}
        {!state.classes.length ? (
          <Empty>아직 연결된 학급이 없어요. 학급 연결부터 시작해 주세요.</Empty>
        ) : (
          <label className="field">
            살펴볼 학급
            <select
              aria-label="학기 관리 학급"
              value={state.selected ?? ""}
              onChange={(e) =>
                router.push(`/hub?tab=terms&classroom=${e.target.value}`)
              }
            >
              {state.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {termLabel(c)} ·{" "}
                  {c.term_state === "archived" ? "보관" : "진행 중"}
                  {!teacher && !c.participating ? " · 참여 확인 대기" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        {c && (
          <div className="term-summary">
            <span className={`term-state ${c.term_state}`}>
              {c.term_state === "archived" ? "보관된 학기" : "진행 중인 학기"}
            </span>
            <h3>{c.name}</h3>
            <p>
              {termLabel(c)}
              {c.grade_level ? ` · ${c.grade_level}학년` : ""}
            </p>
            <div className="button-row">
              <Link
                className="button button-outline"
                href={`/hub?tab=search&classroom=${c.id}`}
              >
                이 학급 기록 검색
              </Link>
              <Link className="button button-outline" href="/hub?tab=exports">
                기록·글 내보내기
              </Link>
              {teacher && (
                <Link
                  className="paper-text-link"
                  href={`/operations?classroom=${c.id}`}
                >
                  계정·동의 확인
                </Link>
              )}
            </div>
            {c.term_state === "archived" && (
              <p>
                조회·내보내기는 계속할 수 있어요. 학습 기록과 화폐는 변경되지
                않도록 보관됩니다.
              </p>
            )}
            {!teacher && !c.participating && (
              <p className="notice">
                새 학급 참여 확인을 기다리고 있어요. 선생님께 참여 동의 확인과
                ‘이 학급에서 시작’을 요청해 주세요.
              </p>
            )}
          </div>
        )}
      </Panel>
      {teacher && c && (
        <>
          {c.term_state === "open" && !state.promotions.length && (
            <Panel title="학년도·학기 설정">
              <GrowthTermForm
                command="configure"
                payload={(f) => ({
                  ...common(f),
                  year: Number(f.get("year")),
                  semester: Number(f.get("semester")),
                  grade: string(f, "grade"),
                })}
                label="학기 정보 저장"
              >
                <PeriodFields
                  year={c.academic_year ?? currentYear}
                  semester={c.semester ?? 1}
                  grade={c.grade_level}
                />
                <p className="form-help">
                  기존 학급은 학기 정보가 비어 있어요. 실제 운영한 학년도·학기를
                  확인해 저장해 주세요.
                </p>
              </GrowthTermForm>
            </Panel>
          )}
          <Panel title="마무리 전 확인">
            <div className="term-counts">
              {state.pending &&
                Object.entries(state.pending).map(([key, n]) => (
                  <div key={key}>
                    <strong>{n}</strong>
                    <span>
                      {
                        {
                          orders: "지급·취소 대기 주문",
                          writing: "확인 전 제출 글",
                          revision: "고쳐쓰기 중인 글",
                          reading: "확인 전 독서 기록",
                          roles: "미완료 역할 활동",
                          contests: "결과 미공개 글쓰기 활동",
                        }[key]
                      }
                    </span>
                  </div>
                ))}
            </div>
            <p>
              미지급 주문은 먼저 지급하거나 취소해야 합니다. 나머지 미완료
              활동은 현재 상태 그대로 보관되며, 자동으로 평가하거나 보상하지
              않아요.
            </p>
            <Link href="/hub?tab=economy" className="paper-text-link">
              경제 교실에서 주문 정리하기 →
            </Link>
            {c.term_state === "open" ? (
              <GrowthTermForm
                command="archive"
                payload={common}
                label="학기 종료·보관"
                disabled={
                  !c.academic_year || !c.semester || !!state.pending?.orders
                }
                onSuccess={done(
                  "학기를 보관했어요. 다음 학기 진급을 준비할 수 있습니다.",
                )}
              >
                {confirmation(
                  "기록과 지갑이 보관되고, 이 학급의 새 활동·구매·보상이 멈추는 것을 확인했습니다.",
                )}
                <p className="form-help">
                  기존 초대 코드는 종료됩니다. 잘못 종료한 경우 학기를 다시 열
                  수 있어요.
                </p>
              </GrowthTermForm>
            ) : (
              <details>
                <summary>학기를 다시 열어야 하나요?</summary>
                <GrowthTermForm
                  command="reopen"
                  payload={common}
                  label="학기 다시 열기"
                  onSuccess={done(
                    "학기를 다시 열었어요. 필요한 경우 초대 코드를 새로 발급해 주세요.",
                  )}
                >
                  {confirmation(
                    "이 학급에서 다시 활동·구매·보상을 변경할 수 있도록 엽니다.",
                  )}
                  <p>
                    기존 기록과 지갑을 그대로 이어갑니다. 종료된 초대 코드는
                    새로 발급해 주세요.
                  </p>
                </GrowthTermForm>
              </details>
            )}
          </Panel>
          {c.term_state === "archived" && (
            <Panel title="다음 학기·진급 준비">
              <p>
                선택한 학생의 기존 계정을 새 학급에 연결합니다.
                과제·글·화폐·그룹은 복사하지 않습니다. 새 담임으로 인계하려면
                학급 준비 후 운영자에게 ‘학급 인계’를 요청해 주세요.
              </p>
              <GrowthTermForm
                key={c.id + ":" + c.term_revision}
                command="promote"
                payload={(f) => ({
                  ...common(f),
                  name: string(f, "name"),
                  year: Number(f.get("year")),
                  semester: Number(f.get("semester")),
                  grade: string(f, "grade"),
                  students: f.getAll("students").map(String),
                })}
                label="선택한 학생으로 새 학급 준비"
                disabled={
                  !state.roster.some(
                    (s) => s.active && s.account_active && !s.deletion_pending,
                  )
                }
                onSuccess={(r) => {
                  setNotice(
                    "새 학급을 준비했어요. 학급을 선택하고 참여 동의 승인 후 학생별로 시작해 주세요.",
                  );
                  if (r.targetClassId)
                    router.push(`/hub?tab=terms&classroom=${r.targetClassId}`);
                }}
              >
                <Field name="name" label="새 학급 이름" maxLength={80} />
                <PeriodFields
                  year={defaults.year}
                  semester={defaults.semester}
                  grade={
                    c.grade_level === 6
                      ? null
                      : c.grade_level === null
                        ? null
                        : Math.min(
                            6,
                            c.grade_level +
                              (defaults.year >
                              (c.academic_year ?? defaults.year)
                                ? 1
                                : 0),
                          )
                  }
                />
                <fieldset className="term-student-selection">
                  <legend>진급할 학생 선택 · 한 번에 최대 100명</legend>
                  {state.roster.map((s) => (
                    <label key={s.student_id} className="term-check">
                      <input
                        type="checkbox"
                        name="students"
                        value={s.student_id}
                        disabled={
                          !s.active || !s.account_active || s.deletion_pending
                        }
                      />
                      {s.display_name}
                      {!s.active ? " · 참여 중지" : ""}
                      {!s.account_active ? " · 계정 중지" : ""}
                      {s.deletion_pending ? " · 삭제 처리 중" : ""}
                    </label>
                  ))}
                </fieldset>
                {state.rosterTotal > state.roster.length && (
                  <p className="notice">
                    현재 {state.rosterTotal}명 중 {state.roster.length}명이
                    표시됩니다. 큰 학급은 운영자에게 분할 진행을 요청해 주세요.
                  </p>
                )}
                {confirmation(
                  "학생 명단과 다음 학기를 확인했습니다. 새 학급에서 참여 동의 승인 후 학생별로 시작하겠습니다.",
                )}
              </GrowthTermForm>
            </Panel>
          )}
          {c.term_state === "open" &&
            state.roster.some((s) => s.membership_id) && (
              <Panel title="진급한 학생의 참여 시작">
                <p>
                  새 학급의 동의 자료 등록 → 운영자 승인 → 선생님의 참여 시작
                  순서입니다. 학생 비밀번호는 바뀌지 않아요. 시작 이후 비밀번호
                  재발급은 이 학급의 담임이 담당합니다.
                </p>
                <Link
                  className="button button-outline"
                  href={`/operations?classroom=${c.id}`}
                >
                  참여 동의 자료 등록·승인 확인
                </Link>
                <div className="term-roster">
                  {state.roster
                    .filter((s) => s.membership_id)
                    .map((s) => (
                      <article key={s.student_id}>
                        <div>
                          <strong>{s.display_name}</strong>
                          <p>
                            {s.active && s.confirmed
                              ? "참여 중"
                              : s.consent_ready
                                ? "동의 승인 완료 · 시작 확인 필요"
                                : "이 학급의 동의 승인 대기"}
                            {s.must_change_password
                              ? " · 첫 비밀번호 변경 필요"
                              : ""}
                          </p>
                        </div>
                        {!(s.active && s.confirmed) && (
                          <GrowthTermForm
                            command="activate"
                            payload={() => ({
                              classroomId: c.id,
                              id: s.membership_id,
                            })}
                            label={`${s.display_name} · 이 학급에서 시작`}
                            disabled={
                              !s.consent_ready ||
                              !s.account_active ||
                              s.deletion_pending
                            }
                            onSuccess={done(
                              "학생의 새 학급 참여를 시작했어요.",
                            )}
                          />
                        )}
                      </article>
                    ))}
                </div>
              </Panel>
            )}
        </>
      )}
      {!!state.promotions.length && (
        <Panel title="이어지는 학기">
          <div className="term-roster">
            {state.promotions.map((p) => (
              <article key={p.id}>
                <div>
                  <strong>
                    {p.source_name} → {p.target_name}
                  </strong>
                  <p>
                    {p.academic_year}학년도 {p.semester}학기
                    {teacher
                      ? ` · 준비 ${p.prepared}명 · 시작 ${p.activated}명`
                      : ""}
                  </p>
                </div>
                {(!teacher || p.owned_target) && (
                  <Link
                    className="button button-outline"
                    href={`/hub?tab=terms&classroom=${p.target_classroom_id}`}
                  >
                    새 학급 보기
                  </Link>
                )}
              </article>
            ))}
          </div>
        </Panel>
      )}
      {teacher && !!state.events.length && (
        <Panel title="학기 운영 이력">
          {state.events.map((e, i) => (
            <p key={`${e.created_at}:${i}`}>
              {(
                {
                  configured: "학기 정보 설정",
                  archived: "학기 보관",
                  reopened: "학기 다시 열기",
                  promoted: "다음 학급 준비",
                  activated: "학생 참여 시작",
                } as Record<string, string>
              )[e.kind] ?? e.kind}{" "}
              · {formatOperationsDate(e.created_at)}
            </p>
          ))}
        </Panel>
      )}
    </div>
  );
}
