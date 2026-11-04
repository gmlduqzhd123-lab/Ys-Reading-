"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CollaborationState } from "@/lib/collaboration";
import { collaborationCommand } from "@/app/collaboration/actions";
import { accountOperation } from "@/app/operations/actions";
import { RosterImporter } from "@/components/participation/roster-importer";
export function CollaborationPanel({
  state,
  classroom,
}: {
  state: CollaborationState;
  classroom: string | null;
}) {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [code, setCode] = useState(""),
    [school, setSchool] = useState("");
  const keys = useRef<Record<string, string>>({});
  const [interactive, setInteractive] = useState(false);
  useEffect(() => setInteractive(true), []);
  const cls = state.classes.find((c) => c.id === classroom);
  async function run(command: string, payload: Record<string, unknown>) {
    if (busy) return;
    const key = command + JSON.stringify(payload);
    keys.current[key] ??= crypto.randomUUID();
    setBusy(true);
    setMessage("");
    setCode("");
    try {
      const r = await collaborationCommand({
        command,
        payload,
        requestId: keys.current[key],
      });
      setMessage(r.message);
      if (r.ok) {
        if (command === "invite") delete keys.current[key];
        if (r.data?.code) setCode(r.data.code);
        if (r.data?.school) setSchool(r.data.school);
        router.refresh();
      }
    } catch {
      setMessage("연결이 끊겼어요. 같은 입력으로 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset
      disabled={!interactive || busy}
      aria-label="교사 협업 작업"
      style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
    >
      <section className="panel">
        <h2>교사 초대 받기</h2>
        <p>
          받는 계정이 지정된 24시간 초대입니다. 권한은 180일간 유효하며 담임이
          취소할 수 있습니다.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run("accept", {
              code: String(new FormData(e.currentTarget).get("code")).trim(),
            });
          }}
        >
          <label className="field">
            초대 코드
            <input
              name="code"
              required
              pattern="[a-f0-9]{64}"
              maxLength={64}
              autoComplete="off"
            />
          </label>
          <button className="button button-primary" disabled={busy}>
            이 계정으로 초대 수락
          </button>
        </form>
        <Link href="/account/security">인증앱 등록·최근 2단계 인증 확인 →</Link>
      </section>
      {cls?.owner && (
        <section className="panel">
          <h2>{cls.name} 공동교사 초대·권한 관리</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run("invite", {
                kind: "classroom",
                classroom: cls.id,
                email: String(f.get("email")),
                permissions: f.getAll("permissions"),
              });
            }}
          >
            <label className="field">
              초대할 승인 교사의 이메일
              <input name="email" type="email" required autoComplete="off" />
            </label>
            <label className="hub-check">
              <input
                name="permissions"
                type="checkbox"
                value="read"
                defaultChecked
              />
              독서 기록·제출 글·성장 보고서 읽기
            </label>
            <label className="hub-check">
              <input name="permissions" type="checkbox" value="review" />
              피드백·완료 처리·성장 보고서 검토·공개
            </label>
            <label className="hub-check">
              <input name="permissions" type="checkbox" value="students" />
              학생 계정 발급·비밀번호 초기화
            </label>
            <p>
              경제 원장 수정·학기 종료·자료 삭제·다른 교사 초대 권한은 담임에게
              있습니다.
            </p>
            <button className="button button-primary" disabled={busy}>
              선택한 권한으로 교사 초대
            </button>
          </form>
          {state.staff.map((s) => (
            <div key={s.id} className="hub-record">
              <p>
                {s.name} ·{" "}
                {s.permissions
                  .map(
                    (x) =>
                      ({
                        read: "기록 읽기",
                        review: "검토·공개",
                        students: "학생 계정",
                      })[x],
                  )
                  .join(", ")}{" "}
                · {s.active ? "활성" : "취소됨"} ·{" "}
                {new Date(s.expiresAt).toLocaleDateString("ko-KR")}
              </p>
              <button
                className="button button-outline"
                disabled={busy || !s.active}
                onClick={() =>
                  void run("revoke_staff", {
                    classroom: cls.id,
                    target: s.id,
                    revision: s.revision,
                  })
                }
              >
                공동교사 권한 취소
              </button>
              {s.active && (
                <button
                  className="button button-outline"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "이 교사에게 담임 인계를 제안할까요? 상대가 수락하면 현재 담임의 권한은 해제됩니다.",
                      )
                    )
                      void run("handover_propose", {
                        classroom: cls.id,
                        target: s.id,
                      });
                  }}
                >
                  이 교사에게 담임 인계 제안
                </button>
              )}
            </div>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run("school_link_request", {
                classroom: cls.id,
                school: String(new FormData(e.currentTarget).get("school")),
              });
            }}
          >
            <label className="field">
              학교 연결 요청 · 학교 관리자에게 받은 학교 ID
              <input name="school" required />
            </label>
            <button className="button button-outline" disabled={busy}>
              학교에 학급 연결 요청
            </button>
          </form>
        </section>
      )}
      {code && (
        <section className="panel">
          <h2>교사에게 전달할 초대 코드</h2>
          <p>지정한 교사에게만 전달하세요. 이 코드를 공개 게시하지 마세요.</p>
          <label className="field">
            이번 초대 코드
            <input readOnly value={code} autoComplete="off" />
          </label>
          <button className="button button-outline" onClick={() => setCode("")}>
            코드 화면에서 지우기
          </button>
        </section>
      )}
      {!!state.invitations.length && (
        <section className="panel">
          <h2>대기 중인 초대</h2>
          {state.invitations.map((i) => (
            <p key={i.id}>
              {i.target} ·{" "}
              {
                {
                  classroom: "공동교사",
                  school: "학교 관리자",
                  operator: "보조 운영자",
                }[i.kind]
              }{" "}
              · {new Date(i.expiresAt).toLocaleString("ko-KR")}{" "}
              <button
                disabled={busy}
                onClick={() => void run("revoke_invitation", { id: i.id })}
              >
                내가 보낸 초대 취소
              </button>
            </p>
          ))}
        </section>
      )}
      {!!state.handovers.length && (
        <section className="panel">
          <h2>담임 인계 확인</h2>
          {state.handovers.map((h) => (
            <div key={h.classroom}>
              <p>
                {h.name} · 수락하면 새 담임으로 운영하며 기존 담임의 접근 권한은
                해제됩니다.
              </p>
              {h.recipient === state.actor && (
                <button
                  disabled={busy}
                  className="button button-primary"
                  onClick={() => {
                    if (
                      window.confirm(
                        "담임 인계와 기존 담임의 접근 해제를 확인했나요?",
                      )
                    )
                      void run("handover_accept", { classroom: h.classroom });
                  }}
                >
                  확인하고 담임 인계 수락
                </button>
              )}
            </div>
          ))}
        </section>
      )}
      {state.operator && (
        <section className="panel">
          <h2>학교·보조 운영자 준비</h2>
          <p>
            학교 관리자는 연결 승인된 자기 학교의 학생 계정만 관리합니다. 보조
            운영자는 전체 운영 권한을 가지며 본인의 인증앱 등록과 최근 인증 후
            초대를 수락해야 합니다.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run("school_create", {
                name: String(new FormData(e.currentTarget).get("name")),
              });
            }}
          >
            <label className="field">
              학교 이름
              <input name="name" maxLength={80} required />
            </label>
            <button className="button button-outline" disabled={busy}>
              학교 등록
            </button>
          </form>
          {school && <p>등록한 학교 ID: {school}</p>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run("invite", {
                kind: String(f.get("kind")),
                email: String(f.get("email")),
                school: String(f.get("school") || ""),
              });
            }}
          >
            <label className="field">
              운영 역할
              <select name="kind">
                <option value="school">학교 관리자</option>
                <option value="operator">보조 전체 운영자</option>
              </select>
            </label>
            <label className="field">
              초대할 승인 교사의 이메일
              <input type="email" name="email" required />
            </label>
            <label className="field">
              학교 ID · 학교 관리자 초대일 때 입력
              <input name="school" />
            </label>
            <button className="button button-outline" disabled={busy}>
              최근 2단계 인증 후 운영 역할 초대
            </button>
          </form>
        </section>
      )}
      {!!state.schools.length && (
        <section className="panel">
          <h2>나의 학교</h2>
          {state.schools.map((s) => (
            <p key={s.id}>
              {s.name} · {s.id} · {s.admin ? "학교 관리자" : "연결된 학교"}
            </p>
          ))}
          {state.schoolRequests.map((r) => (
            <p key={r.classroom}>
              {r.name} 연결 요청{" "}
              <button
                disabled={busy}
                onClick={() =>
                  void run("school_link_accept", {
                    classroom: r.classroom,
                    school: r.school,
                  })
                }
              >
                학교 관리자로 연결 승인
              </button>
            </p>
          ))}
        </section>
      )}
      {cls && (
        <section className="panel">
          <h2>{cls.name} 학생 명단</h2>
          {state.students.map((s) => (
            <div key={s.id} className="hub-record">
              <p>
                {s.display_name} · {s.login_id ?? "개인 계정"} ·{" "}
                {s.consent_status === "verified"
                  ? "동의 확인"
                  : "동의 확인 대기"}
              </p>
              {cls.students && s.can_reset && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const password = String(
                      new FormData(e.currentTarget).get("password"),
                    );
                    setBusy(true);
                    try {
                      const r = await accountOperation({
                        kind: "reset_password",
                        classroomId: cls.id,
                        studentId: s.id,
                        password,
                        requestId: crypto.randomUUID(),
                      });
                      setMessage(r.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <label className="field">
                    {s.display_name} 임시 비밀번호
                    <input
                      name="password"
                      type="password"
                      required
                      minLength={12}
                      autoComplete="new-password"
                    />
                  </label>
                  <button disabled={busy} className="button button-outline">
                    학생 비밀번호 초기화
                  </button>
                </form>
              )}
            </div>
          ))}
          <p>
            명단 전체 {state.total}명 · 현재 최대 30명. 페이지를 바꾸어
            확인하세요.
          </p>
        </section>
      )}
      {cls?.students && (
        <RosterImporter
          classId={cls.id}
          existing={state.students.flatMap((s) =>
            s.login_id ? [s.login_id] : [],
          )}
        />
      )}
      {state.operator && (
        <section className="panel">
          <h2>운영 역할 회수</h2>
          {state.schoolAdmins
            .filter((s) => s.active)
            .map((s) => (
              <p key={s.school + s.id}>
                {s.name} · 학교 {s.school}{" "}
                <button
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm("이 학교 관리자의 운영 권한을 회수할까요?")
                    )
                      void run("revoke_school_admin", {
                        school: s.school,
                        target: s.id,
                        revision: s.revision,
                      });
                  }}
                >
                  학교 관리자 권한 회수
                </button>
              </p>
            ))}
          {state.operators
            .filter((o) => o.id !== state.actor)
            .map((o) => (
              <p key={o.id}>
                {o.name}{" "}
                <button
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm("이 운영자의 전체 운영 권한을 회수할까요?")
                    )
                      void run("revoke_operator", { target: o.id });
                  }}
                >
                  보조 운영자 권한 회수
                </button>
              </p>
            ))}
        </section>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
    </fieldset>
  );
}
