"use client";
import { useRef, useState } from "react";
import { shareHash, type ClassroomToolState } from "@/lib/classroom-tools";
import { formatOperationsDate } from "@/lib/operations";
import { useToolAction } from "./use-tool-action";
import { WorkshopListControls } from "./list-controls";
export function FamilyShare({
  owner,
  state,
  params = {},
}: {
  owner: string;
  state: ClassroomToolState;
  params?: Record<string, string | undefined>;
}) {
  const action = useToolAction(owner, state.classroom.id),
    [report, setReport] = useState(state.reports[0]?.id ?? ""),
    [days, setDays] = useState(7),
    [confirmed, setConfirmed] = useState(false),
    [url, setUrl] = useState(""),
    [copyMessage, setCopyMessage] = useState(""),
    [bulkStudent, setBulkStudent] = useState(""),
    [bulkConfirmed, setBulkConfirmed] = useState(false),
    tokens = useRef<Record<string, string>>({});
  return (
    <section className="panel" id="family">
      <h2>보호자에게 성장 기록 공유</h2>
      <p>
        교사가 검토·공개한 보고서 한 판만 읽기 전용으로 공유합니다. 다른 학생
        기록·학급 명단·경제 원장은 포함하지 않습니다. 링크를 가진 사람은
        만료·해제 전까지 읽을 수 있으므로 해당 보호자에게만 직접 전달해 주세요.
      </p>
      {state.lists?.reports && (
        <WorkshopListControls
          classroom={state.classroom.id}
          section="family"
          prefix="report"
          label="공유할 보고서"
          list={state.lists.reports}
          params={params}
          students={state.today}
        />
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const key = report + ":" + days;
          tokens.current[key] ??= Array.from(
            crypto.getRandomValues(new Uint8Array(32)),
          )
            .map((n) => n.toString(16).padStart(2, "0"))
            .join("");
          const token = tokens.current[key],
            r = await action.run("share_create", {
              report,
              days,
              tokenHash: await shareHash(token),
              confirmed,
            });
          if (r) setUrl(location.origin + "/family#" + token);
        }}
      >
        <fieldset
          className="hub-fieldset"
          disabled={action.busy || action.blocked || state.classroom.archived}
        >
          <label className="field">
            공유할 공개 보고서
            <select
              aria-label="공유할 공개 보고서"
              required
              value={report}
              onChange={(e) => {
                setReport(e.target.value);
                setConfirmed(false);
                setUrl("");
              }}
            >
              <option value="">보고서를 선택하세요</option>
              {state.reports.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.student_name} · {r.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            링크 유효 기간
            <select
              aria-label="링크 유효 기간"
              value={days}
              onChange={(e) => {
                setDays(Number(e.target.value));
                setConfirmed(false);
                setUrl("");
              }}
            >
              {[1, 7, 14, 30].map((n) => (
                <option key={n} value={n}>
                  {n}일
                </option>
              ))}
            </select>
          </label>
          <label className="tool-choice">
            <input
              required
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            해당 학생·보호자의 공유 의사와 보고서 내용을 확인했으며 선택한
            보고서만 전달합니다.
          </label>
          <button
            className="button button-primary"
            disabled={!report || !confirmed}
          >
            확인한 보고서 공유 링크 만들기
          </button>
        </fieldset>
      </form>
      {url && !action.blocked && (
        <div className="notice">
          <label className="field">
            이번 보호자 공유 링크
            <input readOnly value={url} autoComplete="off" />
          </label>
          <button
            className="button button-outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                setCopyMessage(
                  "링크를 복사했어요. 해당 보호자에게만 전달하세요.",
                );
              } catch {
                setCopyMessage("위 입력칸에서 직접 복사해 주세요.");
              }
            }}
          >
            보호자 링크 복사
          </button>
          <button
            className="button button-outline"
            onClick={() => {
              setUrl("");
              setCopyMessage("");
            }}
          >
            링크 화면에서 지우기
          </button>
          <p role="status">{copyMessage}</p>
        </div>
      )}
      {!state.reports.length && (
        <p>먼저 성장 보고서를 검토한 뒤 학생에게 공개해 주세요.</p>
      )}
      <h3>모든 보호자 공유 링크 관리</h3>
      {state.lists?.shares && (
        <WorkshopListControls
          classroom={state.classroom.id}
          section="family"
          prefix="share"
          label="보호자 공유"
          list={state.lists.shares}
          params={params}
          students={state.today}
          statuses={[
            ["active", "공유 중"],
            ["expired", "기간 만료"],
            ["revoked", "공유 해제"],
          ]}
        />
      )}
      <details>
        <summary>학생의 유효한 링크 모두 해제</summary>
        <p>
          선택한 학생의 이 학급 보고서 공유를 모두 해제합니다. 화면에 없는 이전
          링크도 포함합니다.
        </p>
        <label className="field">
          공유를 모두 해제할 학생
          <select
            aria-label="공유를 모두 해제할 학생"
            value={bulkStudent}
            onChange={(e) => {
              setBulkStudent(e.target.value);
              setBulkConfirmed(false);
            }}
          >
            <option value="">학생 선택</option>
            {state.today.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="tool-choice">
          <input
            type="checkbox"
            checked={bulkConfirmed}
            onChange={(e) => setBulkConfirmed(e.target.checked)}
          />
          선택한 학생의 이 학급 유효 공유 링크를 모두 해제합니다.
        </label>
        <button
          className="button button-outline"
          disabled={
            !bulkStudent || !bulkConfirmed || action.busy || action.blocked
          }
          onClick={async () => {
            const r = await action.run("share_revoke_student", {
              student: bulkStudent,
              confirmed: true,
            });
            if (r) {
              setBulkConfirmed(false);
              setUrl("");
              tokens.current = {};
              action.setMessage(
                String(r.revoked) + "개의 유효한 공유 링크를 해제했어요.",
              );
            }
          }}
        >
          확인한 학생의 공유 모두 해제
        </button>
      </details>
      {state.shares.map((s) => (
        <article className="tool-card" key={s.id}>
          <strong>
            {s.student_name ? s.student_name + " · " : ""}
            {s.title} {s.version ? "· " + s.version + "판" : ""}
          </strong>
          <p>
            {s.revoked_at
              ? "공유 해제"
              : Date.parse(s.expires_at) <= Date.now()
                ? "기간 만료"
                : "공유 중"}{" "}
            · 만료 {formatOperationsDate(s.expires_at)}
          </p>
          <button
            className="button button-outline"
            disabled={!!s.revoked_at || action.busy || action.blocked}
            onClick={async () => {
              if (await action.run("share_revoke", { id: s.id })) {
                setUrl("");
                tokens.current = {};
              }
            }}
          >
            이 보호자 공유 즉시 해제
          </button>
        </article>
      ))}
      <p role="status">{action.message}</p>
    </section>
  );
}
