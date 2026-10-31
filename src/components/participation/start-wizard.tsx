"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { useRouter } from "next/navigation";
import { accountOperation } from "@/app/operations/actions";
import type { AccountInput } from "../../../supabase/functions/_shared/account-worker";
import type { DashboardData } from "@/lib/data";
import type { OperationsState } from "@/lib/operations";
import { missions } from "@/lib/missions";
import { responseChoices } from "@/lib/participation";
import { ParticipationForm, value } from "./form";
function downloadAccounts(rows: NonNullable<AccountInput["students"]>) {
  const cell = (text: string) =>
    `"${(/^[\s]*[=+\-@]/.test(text) ? "'" : "") + text.replaceAll('"', '""')}"`;
  const text =
    "\uFEFF" +
    [
      ["아이디", "별칭", "초기 비밀번호"],
      ...rows.map((r) => [r.loginId, r.name, r.password]),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n");
  const href = URL.createObjectURL(
    new Blob([text], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = href;
  a.download = "책숲-학생계정-안내표.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 10000);
}
export function StartWizard({
  data,
  state,
  origin,
}: {
  data: DashboardData;
  state: OperationsState;
  origin: string;
}) {
  const router = useRouter(),
    [step, setStep] = useState(1),
    [classId, setClassId] = useState(data.classes[0]?.id ?? "");
  const [created, setCreated] = useState<{ id: string; name: string }[]>([]),
    [className, setClassName] = useState("");
  const classes = [
    ...created,
    ...data.classes.filter((c) => !created.some((n) => n.id === c.id)),
  ];
  const [batch, setBatch] = useState<AccountInput | null>(null),
    [completed, setCompleted] = useState(0),
    [message, setMessage] = useState("");
  const [busy, start] = useTransition(),
    [downloaded, setDownloaded] = useState(false),
    [qr, setQr] = useState("");
  const batchRef = useRef(batch);
  batchRef.current = batch;
  const url = classId
    ? `${origin}/login?class=${encodeURIComponent(classId)}`
    : "";
  useEffect(() => {
    let current = true;
    setQr("");
    if (url)
      QRCode.toDataURL(url, {
        width: 260,
        margin: 2,
        errorCorrectionLevel: "M",
      })
        .then((src) => {
          if (current) setQr(src);
        })
        .catch(() => {
          if (current)
            setMessage(
              "QR 그림을 준비하지 못했어요. 아래 접속 주소를 사용해 주세요.",
            );
        });
    return () => {
      current = false;
    };
  }, [url]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (batchRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    const protect = (e: MouseEvent) => {
      if (
        !batchRef.current ||
        e.defaultPrevented ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      const a = e.target instanceof Element ? e.target.closest("a") : null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const dest = new URL(a.href, location.href);
      if (
        dest.origin === location.origin &&
        dest.pathname !== location.pathname &&
        !window.confirm(
          "계정 안내표를 저장했나요? 이 화면을 떠나면 준비한 초기 비밀번호를 다시 볼 수 없어요. 이동할까요?",
        )
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    document.addEventListener("click", protect, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", protect, true);
    };
  }, []);
  const enrolled = state.students.filter((s) => s.classroom_id === classId);
  return (
    <div className="participation-page">
      <span className="eyebrow">FIRST DAY IN BOOKFOREST</span>
      <h1>우리 반 시작하기</h1>
      <p>
        학급 준비부터 첫 활동까지, 한 단계씩 함께해요. 도중에 멈춰도 만든 학급과
        발급한 계정은 보존됩니다.
      </p>
      <nav className="setup-steps" aria-label="학급 준비 단계">
        {["학급 만들기", "학생 계정", "첫 미션", "접속 안내"].map((name, i) => (
          <button
            key={name}
            aria-current={step === i + 1 ? "step" : undefined}
            className={step === i + 1 ? "selected" : ""}
            disabled={busy || (i > 0 && !classId)}
            onClick={() => setStep(i + 1)}
          >
            {i + 1}. {name}
          </button>
        ))}
      </nav>
      {step === 1 && (
        <section className="panel">
          <h2>1. 학급을 선택하거나 새로 만들어요</h2>
          {classes.length > 0 && (
            <label className="field">
              준비할 학급
              <select
                value={classId}
                disabled={batch !== null}
                onChange={(e) => setClassId(e.target.value)}
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!batch && (
            <ParticipationForm
              command="class_start"
              payload={() => ({ name: className })}
              label="학급 생성"
              onSuccess={(r) => {
                const id = String(r.id);
                setCreated((old) => [{ id, name: className }, ...old]);
                setClassId(id);
                setStep(2);
              }}
            >
              <label className="field">
                새 학급 이름
                <input
                  name="name"
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  required
                  minLength={2}
                  maxLength={80}
                  placeholder="예: 4학년 2반"
                />
              </label>
            </ParticipationForm>
          )}
          {classId && (
            <button
              className="button button-outline"
              onClick={() => setStep(2)}
            >
              이 학급으로 계속
            </button>
          )}
        </section>
      )}
      {step === 2 && (
        <section className="panel">
          <h2>2. 학생 별칭으로 계정을 준비해요</h2>
          <p>
            이 학급에 이미 발급된 학생 {enrolled.length}명입니다. 아래에는
            추가할 학생만 입력하세요. 한 줄에 한 명, 최대 30명입니다.
          </p>
          {!batch ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const raw = new FormData(e.currentTarget);
                const names = value(raw, "names")
                  .split(/\r?\n/)
                  .map((n) => n.trim())
                  .filter(Boolean);
                if (
                  !names.length ||
                  names.length > 30 ||
                  names.some((n) => n.length > 40)
                ) {
                  setMessage("별칭 1~40자, 학생 1~30명인지 확인해 주세요.");
                  return;
                }
                const prefix =
                  "bf" + crypto.randomUUID().replaceAll("-", "").slice(0, 12);
                const students = names.map((name, i) => ({
                  name,
                  loginId: prefix + String(i + 1).padStart(2, "0"),
                  password:
                    "Aa7!" +
                    Array.from(
                      crypto.getRandomValues(new Uint8Array(16)),
                      (n) => n.toString(16).padStart(2, "0"),
                    ).join(""),
                }));
                setBatch({
                  kind: "create_students",
                  requestId: crypto.randomUUID(),
                  classroomId: classId,
                  students,
                });
                setCompleted(0);
                setDownloaded(false);
                setMessage("");
              }}
            >
              <label className="field">
                학생 별칭 목록
                <textarea
                  name="names"
                  rows={6}
                  maxLength={1300}
                  placeholder={"새싹\n다람쥐\n책나무"}
                  required
                />
              </label>
              <button className="button button-primary">발급 명단 준비</button>
            </form>
          ) : (
            <>
              <p>
                {batch.students?.length}명 준비 · {completed}명 발급 완료
              </p>
              <p>
                비밀번호는 이 화면에 머무는 동안만 보관합니다. 안내표를 저장한
                뒤 학생에게 개별 전달하세요. 발급된 학생은 이 학급에 자동
                연결됩니다.
              </p>
              <ul>
                {batch.students?.map((s, i) => (
                  <li key={s.loginId}>
                    {s.name} · {s.loginId} ·{" "}
                    {i < completed ? "발급 완료" : "대기"}
                  </li>
                ))}
              </ul>
              <div className="button-row">
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
                    ? "발급 중…"
                    : completed
                      ? "미완료 계정 다시 처리"
                      : "학생 계정 발급"}
                </button>
                <button
                  className="button button-outline"
                  disabled={!completed || busy}
                  onClick={() => {
                    downloadAccounts(batch.students!.slice(0, completed));
                    setDownloaded(true);
                  }}
                >
                  완료 계정 안내표 저장
                </button>
                <button
                  className="button button-outline"
                  disabled={
                    busy || completed !== batch.students?.length || !downloaded
                  }
                  onClick={() => {
                    setBatch(null);
                    setStep(3);
                  }}
                >
                  안내표 저장 완료 · 다음 단계
                </button>
              </div>
            </>
          )}
          <p role="status">{message}</p>
          <p>
            첫 로그인에서 비밀번호를 바꾸고, 필요한 동의 확인이 완료되면 활동할
            수 있어요.
          </p>
          {!batch && (
            <>
              <Link
                href={`/operations?classroom=${classId}`}
                className="paper-text-link"
              >
                동의 확인·학생 관리
              </Link>
              <button
                className="button button-outline"
                onClick={() => setStep(3)}
              >
                학생 발급은 나중에 · 다음 단계
              </button>
            </>
          )}
        </section>
      )}
      {step === 3 && (
        <section className="panel">
          <h2>3. 학생이 표현 방법을 고르는 첫 미션</h2>
          <p>
            하나의 미션에서 편지·새 결말·질문 중 원하는 방법을 고릅니다. 학생이
            고른 뒤 쓰기 시작하면 선택이 보존돼요.
          </p>
          <ParticipationForm
            command="assign_choices"
            label="선택형 첫 미션 배부"
            payload={(fd) => ({
              classroomId: classId,
              missionId: value(fd, "missionId"),
              choices: responseChoices,
              criteria:
                "책 속 장면을 근거로 나의 생각을 표현했나요? 상대의 생각을 존중했나요?",
            })}
            onSuccess={() => setStep(4)}
          >
            <label className="field">
              기본 독서미션
              <select name="missionId" required>
                {missions
                  .filter((m) => m.kind === "writing")
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.grade_band}학년 · {m.title}
                    </option>
                  ))}
              </select>
            </label>
          </ParticipationForm>
          <button className="button button-outline" onClick={() => setStep(4)}>
            미션은 나중에 · 접속 안내 보기
          </button>
        </section>
      )}
      {step === 4 && (
        <section className="panel setup-guide">
          <h2>4. {classes.find((c) => c.id === classId)?.name} 접속 안내</h2>
          {qr && (
            <img
              src={qr}
              width={260}
              height={260}
              alt="선택한 학급의 책숲 로그인 QR"
            />
          )}
          <p className="setup-url">{url}</p>
          <ol>
            <li>QR을 찍거나 위 주소로 접속해요.</li>
            <li>선생님이 준 아이디와 초기 비밀번호를 입력해요.</li>
            <li>비밀번호 변경·동의 확인 후 ‘오늘 할 일’에서 시작해요.</li>
            <li>함께 쓰는 기기에서는 수업이 끝나면 로그아웃해요.</li>
          </ol>
          <p>
            QR은 접속을 돕는 주소입니다. 계정이나 학급 참여 권한을 대신하지
            않습니다.
          </p>
          <div className="button-row">
            {qr && (
              <a
                className="button button-outline"
                href={qr}
                download="책숲-학급접속-QR.png"
              >
                학급 QR 저장
              </a>
            )}
            <button
              className="button button-outline"
              onClick={() => window.print()}
            >
              접속 안내 인쇄
            </button>
            <Link className="button button-primary" href="/hub?tab=today">
              교실 준비 마치기
            </Link>
          </div>
        </section>
      )}
      <p>
        새 교사 계정은 기존 교사 승인 절차를 거칩니다.{" "}
        <Link href="/account">계정·참여 관리</Link>
      </p>
    </div>
  );
}
