"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  openArchive,
  sealArchive,
  type LearningArchive,
} from "@/lib/learning-archive";
import { recordLabels } from "@/lib/classroom-insights";
import { formatOperationsDate } from "@/lib/operations";
import type { ServiceHealth } from "@/lib/service-health";
import {
  monitorLabel,
  monitorCheckStale,
  type MonitorState,
} from "@/lib/monitoring";
type Availability = {
  monitor?: MonitorState | null;
  available: boolean;
  status?: string;
  conclusion?: string;
  updatedAt?: string;
  stale?: boolean;
  url?: string;
};
export function ReliabilityPanel({
  classes,
  teacher,
}: {
  classes: { id: string; name: string }[];
  teacher: boolean;
}) {
  const [health, setHealth] = useState<ServiceHealth | null>(null),
    [availability, setAvailability] = useState<Availability | null>(null),
    [checking, setChecking] = useState(false),
    [healthError, setHealthError] = useState("");
  const [now, setNow] = useState(Date.now);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [archive, setArchive] = useState<LearningArchive | null>(null),
    [page, setPage] = useState(1),
    [q, setQ] = useState("");
  async function check() {
    setChecking(true);
    setHealthError("");
    const availabilityRequest = fetch("/api/availability", {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then(setAvailability)
      .catch(() => setAvailability({ available: false }));
    try {
      const r = await fetch("/api/health?deep=1", {
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      });
      const d = await r.json();
      if (!d.checks) throw Error();
      setHealth(d);
    } catch {
      setHealth(null);
      setHealthError(
        "점검 서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.",
      );
    } finally {
      await availabilityRequest;
      setChecking(false);
      setNow(Date.now());
    }
  }
  useEffect(() => {
    void check();
    const tick = setInterval(() => setNow(Date.now()), 30000);
    const resume = () => {
      if (document.visibilityState === "visible") void check();
    };
    window.addEventListener("online", resume);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      clearInterval(tick);
      window.removeEventListener("online", resume);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);
  async function createBackup(form: HTMLFormElement) {
    const fd = new FormData(form),
      password = String(fd.get("password") ?? "");
    setMessage("");
    setBusy(true);
    try {
      if (password !== fd.get("confirm"))
        throw Error("보관 암호 확인이 같지 않아요.");
      if (password.length < 12)
        throw Error("보관 암호를 12자 이상 입력해 주세요.");
      const r = await fetch("/api/learning-archive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ classroom: String(fd.get("classroom")) }),
        }),
        data = await r.json();
      if (!r.ok) throw Error(data.error);
      const encrypted = await sealArchive(data, password),
        url = URL.createObjectURL(
          new Blob([encrypted], { type: "application/json" }),
        ),
        a = document.createElement("a");
      a.href = url;
      a.download = "책숲-학급기록-암호화.bfbackup";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      form.reset();
      setMessage(
        "암호화한 학급 학습기록 파일을 저장했어요. 아래에서 파일을 다시 열어 내용을 확인해 주세요.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "기록 보관에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }
  async function inspectBackup(form: HTMLFormElement) {
    setBusy(true);
    setMessage("");
    setArchive(null);
    try {
      const fd = new FormData(form),
        file = fd.get("file");
      if (!(file instanceof File) || !file.size || file.size > 11000000)
        throw Error("11MB 이하의 책숲 보관 파일을 골라 주세요.");
      const value = await openArchive(
        await file.text(),
        String(fd.get("password") ?? ""),
      );
      setArchive(value);
      setPage(1);
      setQ("");
      form.reset();
      setMessage(
        "파일 복호화·학급 일치·중복 검사를 통과했어요. 보관된 기록을 펼쳐 확인할 수 있습니다.",
      );
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "파일 검사를 마치지 못했어요.",
      );
    } finally {
      setBusy(false);
    }
  }
  const records =
    archive?.records.filter((r) =>
      (r.title + " " + r.body + " " + r.student_name).includes(q),
    ) ?? [];
  return (
    <div className="participation-page insights-page">
      <span className="eyebrow">KEEP YOUR STORY SAFE</span>
      <h1>연결 점검·기록 보관</h1>
      <p>연결이 불안정하면 글을 파일로 보관하고 저장 결과를 확인해 주세요.</p>
      <section className="panel">
        <h2>지금 서비스 상태</h2>
        <button
          className="button button-primary"
          disabled={checking}
          onClick={() => void check()}
        >
          {checking ? "연결을 확인하고 있어요…" : "연결 다시 점검"}
        </button>
        {healthError && (
          <p role="alert" className="notice">
            {healthError}
          </p>
        )}
        {health && (
          <div role="status">
            <h3>
              {health.status === "ok"
                ? "현재 연결이 정상이에요"
                : "일부 서비스 연결을 확인해야 해요"}
            </h3>
            <p>
              데이터베이스: {health.checks.database ? "정상" : "확인 필요"} ·
              로그인 서비스:{" "}
              {health.checks.authentication ? "정상" : "확인 필요"}
            </p>
            <p className="form-help">
              점검 시각 {formatOperationsDate(health.checkedAt)} · 이 점검은
              학생 글을 읽거나 저장하지 않습니다.
            </p>
          </div>
        )}
        <h3>자동 가용성 점검</h3>
        <p className="notice" role="status">
          {monitorLabel(availability?.monitor ?? null, now)}
        </p>
        {availability?.monitor?.checks.map((c) => (
          <p key={c.source}>
            {c.source === "supabase-cron" ? "서버 정기 점검" : "운영자 PC 점검"}{" "}
            · {formatOperationsDate(c.checked_at)} ·{" "}
            {monitorCheckStale(c, now)
              ? "점검 신호 확인 필요"
              : c.healthy
                ? "정상"
                : "문제 감지"}
          </p>
        ))}
        {!!availability?.monitor?.incidents.length && (
          <details>
            <summary>장애·복구 알림 이력</summary>
            {availability.monitor.incidents.map((i, n) => (
              <p key={n}>
                {formatOperationsDate(i.opened_at)} ·{" "}
                {i.closed_at
                  ? `복구 확인 ${formatOperationsDate(i.closed_at)}`
                  : "문제 감지 · 현재 연결을 다시 확인해 주세요."}{" "}
                · {i.code}
              </p>
            ))}
          </details>
        )}
        <p>
          서버에서 5분마다 연결을 점검하고 장애·복구를 기록합니다. 점검 신호가
          12분 이상 없으면 오래된 상태로 표시해요. GitHub에서도 20분 간격으로
          독립 점검을 요청하며, 실제 실행은 지연될 수 있습니다.
        </p>
        {availability?.available ? (
          <p>
            최근 실행:{" "}
            {availability.stale
              ? "오래된 결과 · 최근 상태 확인 필요"
              : availability.status !== "completed"
                ? "진행 중"
                : availability.conclusion === "success"
                  ? "성공"
                  : "실패·확인 필요"}{" "}
            ·{" "}
            {availability.updatedAt &&
              formatOperationsDate(availability.updatedAt)}
          </p>
        ) : (
          <p>
            자동 점검 결과를 아직 읽지 못했어요. 위의 현재 연결 점검을 이용해
            주세요.
          </p>
        )}
        <Link
          className="text-link"
          href="https://github.com/gmlduqzhd123-lab/Ys-Reading-/actions/workflows/availability.yml"
          target="_blank"
          rel="noreferrer"
        >
          자동 점검 이력 보기 →
        </Link>
      </section>
      <section className="panel">
        <h2>저장 문제를 만났다면</h2>
        <ol>
          <li>글쓰기 화면을 유지하고 ‘지금 쓴 글 파일로 보관’을 눌러요.</li>
          <li>
            인터넷이 돌아오면 ‘다시 저장’을 누르고 저장 완료 표시를 확인해요.
          </li>
          <li>
            같은 탭을 다시 열었다면 선택해 둔 ‘임시 글 불러오기’로 복구해요.
            서버 버전이 달라지면 파일로 비교해요.
          </li>
          <li>
            제출 결과가 불확실하면 제출 내역을 먼저 확인하고 같은 요청으로
            재시도해요.
          </li>
        </ol>
        <Link href="/hub?tab=today" className="button button-outline">
          나의 책숲으로
        </Link>
      </section>
      {teacher && (
        <section className="panel">
          <h2>담당 학급의 학습기록 보관 파일 만들기</h2>
          <p>
            담당 학급의 독서 기록·제출 버전을 암호화해 내려받습니다. 학생 이름과
            글이 포함됩니다. 승인된 보관 장소에 파일을 두고 암호는 별도로 관리해
            주세요.
          </p>
          <p className="form-help">
            학생 개인 초안·계정 암호·로그인 토큰·거래 원장·Google 파일은
            포함하지 않습니다. DB 전체 장애 복구는 운영자의 별도 데이터베이스
            백업으로 진행합니다.
          </p>
          {!classes.length ? (
            <p>담당 학급이 없거나 연결 확인이 필요해요.</p>
          ) : (
            <form
              className="record-filters"
              onSubmit={(e) => {
                e.preventDefault();
                void createBackup(e.currentTarget);
              }}
            >
              <label className="field">
                보관할 학급
                <select name="classroom" required>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                보관 암호 · 12자 이상
                <input
                  name="password"
                  type="password"
                  minLength={12}
                  maxLength={200}
                  autoComplete="off"
                  required
                />
              </label>
              <label className="field">
                보관 암호 확인
                <input
                  name="confirm"
                  type="password"
                  minLength={12}
                  maxLength={200}
                  autoComplete="off"
                  required
                />
              </label>
              <button disabled={busy} className="button button-primary">
                암호화 보관 파일 저장
              </button>
            </form>
          )}
        </section>
      )}
      <section className="panel">
        <h2>보관 파일 다시 열어 검사하기</h2>
        <p>
          파일과 암호는 이 화면에서만 사용합니다. 서버에 업로드하지 않으며, 현재
          학생 글이나 제출본을 덮어쓰지 않습니다.
        </p>
        <form
          className="record-filters"
          onSubmit={(e) => {
            e.preventDefault();
            void inspectBackup(e.currentTarget);
          }}
        >
          <label className="field">
            책숲 보관 파일
            <input
              name="file"
              type="file"
              accept=".bfbackup,application/json"
              required
            />
          </label>
          <label className="field">
            보관할 때 정한 암호
            <input
              name="password"
              type="password"
              autoComplete="off"
              required
              minLength={12}
              maxLength={200}
            />
          </label>
          <button disabled={busy} className="button button-primary">
            보관 파일 열기·검사
          </button>
        </form>
      </section>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {archive && (
        <section className="panel">
          <div className="hub-row">
            <h2>{archive.classroom.name} · 보관된 학습기록</h2>
            <button
              className="button button-outline"
              onClick={() => {
                setArchive(null);
                setQ("");
              }}
            >
              검사 화면 닫기·내용 지우기
            </button>
          </div>
          <p>
            {formatOperationsDate(archive.createdAt)}의 사본 · 전체{" "}
            {archive.records.length}건
          </p>
          <label className="field">
            파일 안에서 찾기
            <input
              value={q}
              maxLength={100}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </label>
          {records.slice((page - 1) * 25, page * 25).map((r) => (
            <details key={r.kind + r.id} className="search-record">
              <summary>
                {recordLabels[r.kind]} · {r.title || "제목 없는 초안"} ·{" "}
                {r.student_name}
              </summary>
              <p className="submission-body">{r.body}</p>
              {r.question && <p>{r.question}</p>}
            </details>
          ))}
          <nav className="hub-row" aria-label="보관 파일 기록 페이지">
            <button
              className="button button-outline"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              이전 보관 기록
            </button>
            <span>
              {records.length}건 · {page}페이지
            </span>
            <button
              className="button button-outline"
              disabled={page * 25 >= records.length}
              onClick={() => setPage(page + 1)}
            >
              다음 보관 기록
            </button>
          </nav>
        </section>
      )}
    </div>
  );
}
