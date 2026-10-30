"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  accountOperation,
  deletionPreview,
  operationsCommand,
} from "@/app/operations/actions";
import {
  operationLabels,
  formatOperationsDate,
  statusLabels,
  type OperationsState,
} from "@/lib/operations";
import type { AccountInput } from "../../supabase/functions/_shared/account-worker";

function password() {
  return `Aa7!${Array.from(crypto.getRandomValues(new Uint8Array(18)), (v) => v.toString(16).padStart(2, "0")).join("")}`;
}
function credentials(
  rows: { loginId: string; name: string; password: string }[],
) {
  const cell = (s: string) =>
    `"${s.replace(/"/g, '""').replace(/^[=+\-@\t\r]/, "'$&")}"`;
  const csv =
    "\ufeff" +
    [
      ["아이디", "이름", "초기 비밀번호"],
      ...rows.map((s) => [s.loginId, s.name, s.password]),
    ]
      .map((r) => r.map(cell).join(","))
      .join("\r\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "책숲-초기계정.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function OperationsPanel({
  state,
  asOf,
}: {
  state: OperationsState;
  asOf: string;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [message, setMessage] = useState("");
  const [classId, setClassId] = useState(state.classes[0]?.id ?? "");
  const cls = state.classes.find((c) => c.id === classId);
  const students = state.students.filter((s) => s.classroom_id === classId);
  const [batch, setBatch] = useState<AccountInput | null>(null);
  const [completed, setCompleted] = useState(0);
  const [reset, setReset] = useState<{
    input: AccountInput;
    name: string;
    loginId: string;
    done: boolean;
  } | null>(null);
  const [preview, setPreview] = useState<{
    id: string;
    data: NonNullable<Awaited<ReturnType<typeof deletionPreview>>["data"]>;
  } | null>(null);
  const command = (name: string, payload: Record<string, unknown>) =>
    start(async () => {
      setMessage("");
      const r = await operationsCommand(name, payload, crypto.randomUUID());
      setMessage(r.message);
      if (r.ok) {
        setPreview(null);
        router.refresh();
      }
    });
  const name = (id: string) =>
    state.students.find((s) => s.id === id)?.display_name ??
    state.teachers.find((s) => s.id === id)?.display_name ??
    id;
  const chooseStudent = (
    <select name="studentId" required>
      <option value="">학생 선택</option>
      {students.map((s) => (
        <option key={s.id} value={s.id}>
          {s.display_name}
        </option>
      ))}
    </select>
  );
  const teachers = (
    <select name="teacherId" required>
      {state.teachers
        .filter((t) => t.account_active)
        .map((t) => (
          <option key={t.id} value={t.id}>
            {t.display_name}
          </option>
        ))}
    </select>
  );
  return (
    <div className="operations-page">
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">CLASSROOM CARE</span>
          <h1>학생 계정·기록 관리</h1>
          <p>발급부터 참여 확인, 보관과 인계까지 한곳에서 관리해요.</p>
        </div>
        <Link className="button button-outline" href="/hub?tab=manage">
          학급 초대·연결
        </Link>
      </div>
      <div className="notice">
        {state.operator
          ? "운영자 권한으로 확인하고 있습니다. 동의 근거와 삭제 범위를 확인한 뒤 승인해 주세요."
          : "담당 학급의 학생만 관리할 수 있습니다. 동의 확인과 영구 삭제는 운영자 심사를 거칩니다."}
      </div>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <label className="ops-class-picker">
        담당 학급
        <select
          value={classId}
          disabled={busy || Boolean(batch)}
          onChange={(e) => {
            setClassId(e.target.value);
            setReset(null);
            setPreview(null);
          }}
        >
          <option value="" disabled>
            학급을 선택해 주세요
          </option>
          {state.classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {!cls && <p>먼저 ‘학급 초대·연결’에서 학급을 만들어 주세요.</p>}
      {cls && (
        <>
          <section className="ops-card">
            <h2>학생 계정 한 번에 발급</h2>
            <p>
              한 줄에 <strong>아이디, 이름</strong>을 입력해 주세요. 한 번에
              30명까지 준비할 수 있어요.
            </p>
            <p className="muted">
              아이디는 영문 소문자·숫자로 시작하는 4~32자(밑줄·하이픈 사용
              가능)입니다. 실명 대신 학급 별칭을 사용할 수 있어요. 계정 발급은
              보호자 동의 확인과 별개입니다.
            </p>
            {!batch ? (
              <form
                className="ops-form"
                action={(fd) => {
                  const rows = String(fd.get("students") ?? "")
                    .split(/\r?\n/)
                    .map((x) => x.trim())
                    .filter(Boolean)
                    .map((line) => {
                      const [loginId, ...parts] = line.split(",");
                      return {
                        loginId: loginId.trim(),
                        name: parts.join(",").trim(),
                        password: password(),
                      };
                    });
                  if (
                    rows.length < 1 ||
                    rows.length > 30 ||
                    rows.some(
                      (s) =>
                        !/^[a-z0-9][a-z0-9_-]{3,31}$/.test(s.loginId) ||
                        !s.name ||
                        s.name.length > 40,
                    ) ||
                    new Set(rows.map((s) => s.loginId)).size !== rows.length
                  ) {
                    setMessage(
                      "아이디 형식, 이름, 중복 입력과 인원(1~30명)을 확인해 주세요.",
                    );
                    return;
                  }
                  setBatch({
                    kind: "create_students",
                    requestId: crypto.randomUUID(),
                    classroomId: classId,
                    students: rows,
                  });
                  setCompleted(0);
                  setMessage("");
                }}
              >
                <label>
                  아이디와 이름
                  <textarea
                    name="students"
                    rows={5}
                    maxLength={2500}
                    placeholder={"forest01, 새싹\nforest02, 다람쥐"}
                    required
                    disabled={busy}
                  />
                </label>
                <button className="button button-primary" disabled={busy}>
                  발급 명단 준비
                </button>
              </form>
            ) : (
              <>
                <p>
                  {batch.students?.length}명 준비 · {completed}명 발급 완료
                </p>
                <p>
                  초기 비밀번호는 이 화면을 떠나면 다시 볼 수 없습니다. 완료
                  계정 안내표를 내려받아 학생에게 안전하게 전달해 주세요. 학생은
                  첫 로그인에서 비밀번호를 바꿉니다.
                </p>
                <div className="ops-table-wrap">
                  <table className="ops-table">
                    <thead>
                      <tr>
                        <th>아이디</th>
                        <th>이름</th>
                        <th>처리 상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batch.students?.map((s, i) => (
                        <tr key={s.loginId}>
                          <td>{s.loginId}</td>
                          <td>{s.name}</td>
                          <td>{i < completed ? "발급 완료" : "대기"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="ops-actions">
                  <button
                    className="button button-primary"
                    disabled={busy || completed === batch.students?.length}
                    onClick={() =>
                      start(async () => {
                        const r = await accountOperation(batch);
                        setCompleted(r.completed);
                        setMessage(r.message);
                        router.refresh();
                      })
                    }
                  >
                    {busy
                      ? "처리 중…"
                      : completed
                        ? "미완료 계정 다시 처리"
                        : "계정 발급 실행"}
                  </button>
                  <button
                    className="button button-outline"
                    disabled={!completed || busy}
                    onClick={() =>
                      credentials(batch.students!.slice(0, completed))
                    }
                  >
                    완료 계정 안내표 내려받기
                  </button>
                  <button
                    className="button button-outline"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "이 명단과 초기 비밀번호를 화면에서 지울까요? 안내표를 먼저 내려받아 주세요.",
                        )
                      ) {
                        setBatch(null);
                        setCompleted(0);
                      }
                    }}
                  >
                    명단 닫기
                  </button>
                </div>
              </>
            )}
          </section>
          <section className="ops-card">
            <h2>학생 명단과 계정 복구</h2>
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>학생·아이디</th>
                    <th>참여·계정 상태</th>
                    <th>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s.id}>
                      <td>
                        {s.display_name}
                        <br />
                        {s.login_id ?? "기존 계정"}
                      </td>
                      <td>
                        {s.consent_status === "verified"
                          ? "동의 확인"
                          : "동의 대기"}{" "}
                        · {s.account_active ? "이용 가능" : "정지"}
                        {s.must_change_password ? " · 비밀번호 변경 필요" : ""}
                        {!s.active ? " · 학급 연결 중지" : ""}
                      </td>
                      <td>
                        <div className="ops-actions">
                          <button
                            className="button button-outline"
                            disabled={busy}
                            onClick={() =>
                              setReset({
                                input: {
                                  kind: "reset_password",
                                  requestId: crypto.randomUUID(),
                                  classroomId: classId,
                                  studentId: s.id,
                                  password: password(),
                                },
                                name: s.display_name,
                                loginId: s.login_id ?? "기존 아이디",
                                done: false,
                              })
                            }
                          >
                            초기 비밀번호 재발급
                          </button>
                          <button
                            className="button button-outline"
                            disabled={
                              busy ||
                              state.deletions.some(
                                (r) =>
                                  r.student_id === s.id &&
                                  r.classroom_id === classId &&
                                  ["pending", "approved"].includes(r.status),
                              )
                            }
                            onClick={() => {
                              if (
                                window.confirm(
                                  `${s.display_name}의 이 학급 기록 삭제를 요청할까요? 운영자가 범위를 확인한 뒤 승인합니다.`,
                                )
                              )
                                command("deletion_request", {
                                  studentId: s.id,
                                  classroomId: classId,
                                });
                            }}
                          >
                            학급 기록 삭제 요청
                          </button>
                          {state.operator && (
                            <button
                              className="button button-outline"
                              disabled={busy}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    "계정 상태를 변경할까요? 기존 로그인은 무효화됩니다.",
                                  )
                                )
                                  command("account_status", {
                                    studentId: s.id,
                                    active: !s.account_active,
                                  });
                              }}
                            >
                              {s.account_active ? "계정 정지" : "계정 활성화"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!students.length && <p>등록된 학생이 없습니다.</p>}
            {reset && (
              <div className="ops-subpanel">
                <h3>{reset.name}의 비밀번호 재발급</h3>
                <p>
                  실행하면 기존 로그인이 무효화됩니다. 학생에게 새 초기
                  비밀번호를 전달해 주세요.
                </p>
                {reset.done ? (
                  <>
                    <p>
                      새 초기 비밀번호: <code>{reset.input.password}</code>
                    </p>
                    <button
                      className="button button-outline"
                      onClick={() =>
                        credentials([
                          {
                            loginId: reset.loginId,
                            name: reset.name,
                            password: reset.input.password!,
                          },
                        ])
                      }
                    >
                      안내표 내려받기
                    </button>
                  </>
                ) : (
                  <button
                    className="button button-primary"
                    disabled={busy}
                    onClick={() =>
                      start(async () => {
                        const r = await accountOperation(reset.input);
                        setMessage(r.message);
                        if (r.ok) setReset({ ...reset, done: true });
                        router.refresh();
                      })
                    }
                  >
                    재발급 실행
                  </button>
                )}
                <button
                  className="button button-outline"
                  disabled={busy}
                  onClick={() => setReset(null)}
                >
                  닫기
                </button>
              </div>
            )}
          </section>
          <section className="ops-card">
            <h2>보호자 동의 확인 요청</h2>
            <p>
              학교에서 확인한 동의 근거의 관리번호만 적어 주세요. 보호자 연락처,
              동의서 원문, 학생의 글은 입력하지 마세요. 운영자가 근거를 확인해
              승인합니다.
            </p>
            <form
              className="ops-form"
              action={(fd) =>
                command("consent_request", {
                  classroomId: classId,
                  studentId: String(fd.get("studentId")),
                  method: String(fd.get("method")),
                  reference: String(fd.get("reference")),
                  confirmedOn: String(fd.get("confirmedOn")),
                })
              }
            >
              <label>학생{chooseStudent}</label>
              <label>
                확인 방법
                <select name="method">
                  <option value="paper">서면 동의서</option>
                  <option value="school_system">학교 동의 관리 시스템</option>
                </select>
              </label>
              <label>
                근거 관리번호
                <input
                  name="reference"
                  maxLength={100}
                  required
                  placeholder="예: 2026-독서활동-01"
                />
              </label>
              <label>
                동의 확인일
                <input
                  type="date"
                  name="confirmedOn"
                  required
                  max={formatOperationsDate(asOf).slice(0, 10)}
                />
              </label>
              <button className="button button-primary" disabled={busy}>
                운영자 확인 요청
              </button>
            </form>
          </section>
          <section className="ops-card">
            <h2>기록 보관 기간</h2>
            <p>
              현재 설정:{" "}
              {cls.retention_days
                ? `마지막 활동 이후 ${cls.retention_days}일`
                : "기간 미설정"}
              . 학교에서 정한 기간을 입력해 주세요. 기간이 지나도 자동 삭제하지
              않고, 대상 확인과 운영자 승인을 거칩니다.
            </p>
            <form
              className="ops-form"
              key={classId + String(cls.retention_days)}
              action={(fd) =>
                command("retention_set", {
                  classroomId: classId,
                  days: fd.get("days") ? Number(fd.get("days")) : null,
                })
              }
            >
              <label>
                보관 일수(30~3650일, 비우면 미설정)
                <input
                  type="number"
                  name="days"
                  min={30}
                  max={3650}
                  defaultValue={cls.retention_days ?? ""}
                />
              </label>
              <button className="button button-outline" disabled={busy}>
                보관 기간 저장
              </button>
            </form>
            {cls.retention_days &&
              students
                .filter(
                  (s) =>
                    s.last_activity &&
                    Date.parse(s.last_activity) <
                      Date.parse(asOf) - cls.retention_days! * 86400000,
                )
                .map((s) => (
                  <p key={s.id}>
                    {s.display_name} · 기간 경과{" "}
                    <button
                      className="button button-outline"
                      disabled={busy}
                      onClick={() =>
                        command("deletion_request", {
                          studentId: s.id,
                          classroomId: classId,
                          retention: true,
                        })
                      }
                    >
                      보관 만료 삭제 요청
                    </button>
                  </p>
                ))}
          </section>
        </>
      )}
      <section className="ops-card">
        <h2>동의 확인 진행</h2>
        {state.consents
          .filter((r) => state.operator || r.classroom_id === classId)
          .map((r) => (
            <div className="ops-record" key={r.id}>
              <p>
                {name(r.student_id)} ·{" "}
                {r.method === "paper" ? "서면" : "학교 시스템"} · {r.reference}{" "}
                · {r.confirmed_on} · {statusLabels[r.status]}
              </p>
              {state.operator && r.status === "pending" && (
                <div className="ops-actions">
                  <button
                    className="button button-primary"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "학교의 동의 근거를 직접 확인했나요? 확인한 경우에만 승인해 주세요.",
                        )
                      )
                        command("consent_decide", {
                          id: r.id,
                          approve: true,
                          evidenceChecked: true,
                        });
                    }}
                  >
                    근거 확인 후 승인
                  </button>
                  <button
                    className="button button-outline"
                    disabled={busy}
                    onClick={() =>
                      command("consent_decide", { id: r.id, approve: false })
                    }
                  >
                    반려
                  </button>
                </div>
              )}
            </div>
          ))}
        {!state.consents.length && <p>확인 요청이 없습니다.</p>}
      </section>
      <section className="ops-card">
        <h2>기록 삭제 요청과 범위 확인</h2>
        <p>
          승인·실행된 삭제는 복구할 수 없습니다. 독서 기록, 제출 글·피드백·출품
          사본, 광장 글, 경험치와 경제 기록을 함께 정리합니다. 내려받거나 외부에
          내보낸 파일은 해당 저장 위치에서 별도로 관리해 주세요.
        </p>
        {state.deletions
          .filter((r) => state.operator || r.classroom_id === classId)
          .map((r) => (
            <div className="ops-record" key={r.id}>
              <p>
                {name(r.student_id)} ·{" "}
                {r.scope === "account"
                  ? "계정·전체 학급 기록"
                  : "해당 학급 기록"}{" "}
                · {r.reason === "retention" ? "보관 기간 경과" : "삭제 요청"} ·{" "}
                {statusLabels[r.status]}
              </p>
              <div className="ops-actions">
                <button
                  className="button button-outline"
                  disabled={busy}
                  onClick={() =>
                    start(async () => {
                      const result = await deletionPreview(r.id);
                      if (result.ok && result.data)
                        setPreview({ id: r.id, data: result.data });
                      else setMessage(result.message);
                    })
                  }
                >
                  삭제 범위 확인
                </button>
                {state.operator &&
                  r.status === "pending" &&
                  preview?.id === r.id && (
                    <>
                      <button
                        className="button button-primary"
                        disabled={busy || !preview.data.retention_eligible}
                        onClick={() => {
                          if (
                            window.confirm(
                              "표시된 범위의 영구 삭제를 승인할까요?",
                            )
                          )
                            command("deletion_decide", {
                              id: r.id,
                              approve: true,
                              confirmed: true,
                            });
                        }}
                      >
                        삭제 승인
                      </button>
                      <button
                        className="button button-outline"
                        disabled={busy}
                        onClick={() =>
                          command("deletion_decide", {
                            id: r.id,
                            approve: false,
                          })
                        }
                      >
                        반려
                      </button>
                    </>
                  )}
                {state.operator &&
                  ["approved", "purged"].includes(r.status) && (
                    <button
                      className="button button-primary"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            "승인한 기록을 지금 영구 삭제할까요? 계정 삭제 요청은 로그인 계정도 함께 삭제합니다.",
                          )
                        )
                          start(async () => {
                            const result = await accountOperation({
                              kind: "delete_account",
                              requestId: crypto.randomUUID(),
                              id: r.id,
                            });
                            setMessage(result.message);
                            setPreview(null);
                            router.refresh();
                          });
                      }}
                    >
                      승인한 삭제 실행·재시도
                    </button>
                  )}
                {state.operator && r.status === "approved" && (
                  <button
                    className="button button-outline"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "아직 실행하지 않은 삭제 승인을 취소할까요?",
                        )
                      )
                        command("deletion_cancel", { id: r.id });
                    }}
                  >
                    삭제 승인 취소
                  </button>
                )}
              </div>
              {preview?.id === r.id && (
                <p role="status">
                  독서 기록 {preview.data.reading_logs}건 · 제출 글{" "}
                  {preview.data.submissions}건 · 광장 글{" "}
                  {preview.data.plaza_posts}건 · 경제 원장 {preview.data.ledger}
                  건
                  {preview.data.auth_account ? " · 로그인 계정 삭제 포함" : ""}
                  {!preview.data.retention_eligible
                    ? " · 새 활동이 있어 보관 만료 삭제 불가"
                    : ""}
                </p>
              )}
            </div>
          ))}
        {!state.deletions.length && <p>삭제 요청이 없습니다.</p>}
      </section>
      {state.operator && (
        <section className="ops-card">
          <h2>교사 권한과 인계</h2>
          <p>
            학교에서 교사 신원을 확인한 뒤 승인해 주세요. 담당 학급·학년 모임을
            먼저 인계해야 교사 계정을 정지할 수 있습니다. 기존 피드백 작성자는
            바뀌지 않습니다.
          </p>
          {state.teacher_requests.map((r) => (
            <div className="ops-record" key={r.user_id}>
              <p>
                {r.display_name} · {r.user_id}
              </p>
              <button
                className="button button-outline"
                disabled={busy}
                onClick={() => {
                  if (window.confirm("학교에서 교사 신원을 확인했나요?"))
                    command("teacher_decide", {
                      studentId: r.user_id,
                      approve: true,
                    });
                }}
              >
                교사 승인
              </button>
              <button
                className="button button-outline"
                disabled={busy}
                onClick={() =>
                  command("teacher_decide", {
                    studentId: r.user_id,
                    approve: false,
                  })
                }
              >
                반려
              </button>
            </div>
          ))}
          <form
            className="ops-form"
            action={(fd) => {
              if (window.confirm("선택한 학급의 관리 권한을 인계할까요?"))
                command("class_handover", {
                  classroomId: String(fd.get("classroomId")),
                  teacherId: String(fd.get("teacherId")),
                });
            }}
          >
            <label>
              인계할 학급
              <select name="classroomId" required>
                {state.classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>새 담당 선생님{teachers}</label>
            <button
              className="button button-outline"
              disabled={busy || !state.classes.length}
            >
              학급 인계
            </button>
          </form>
          {state.groups?.map((g) => (
            <form
              className="ops-form"
              key={g.id}
              action={(fd) =>
                command("group_handover", {
                  id: g.id,
                  teacherId: String(fd.get("teacherId")),
                })
              }
            >
              <p>{g.name} 학년 모임</p>
              <label>새 관리자{teachers}</label>
              <button className="button button-outline" disabled={busy}>
                모임 인계
              </button>
            </form>
          ))}
          {state.teachers.map((t) => (
            <p key={t.id}>
              {t.display_name} · {t.account_active ? "이용 가능" : "정지"}{" "}
              <button
                className="button button-outline"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "계정 상태를 변경할까요? 기존 로그인은 무효화됩니다.",
                    )
                  )
                    command("account_status", {
                      studentId: t.id,
                      active: !t.account_active,
                    });
                }}
              >
                {t.account_active ? "교사 계정 정지" : "교사 계정 활성화"}
              </button>
            </p>
          ))}
        </section>
      )}
      <section className="ops-card">
        <h2>운영 처리 이력</h2>
        <p className="muted">
          최근 100건을 표시합니다. 학생 글과 비밀번호는 이력에 저장하지
          않습니다.
        </p>
        {state.audit.map((a) => (
          <p key={a.id}>
            {formatOperationsDate(a.created_at)} ·{" "}
            {operationLabels[a.event] ?? "운영 처리"}
            {a.subject_id ? ` · ${name(a.subject_id)}` : ""}
          </p>
        ))}
      </section>
    </div>
  );
}
