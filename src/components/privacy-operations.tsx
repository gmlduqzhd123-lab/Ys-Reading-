"use client";
import { useState, useTransition } from "react";
import { savePrivacyReview, saveReceipt } from "@/app/account/records/actions";
import { formatOperationsDate } from "@/lib/operations";
type Receipt = {
  id: string;
  title: string;
  format: string;
  state: string;
  external_url: string | null;
  created_at: string;
  revision: number;
  note: string;
  due_on: string | null;
};
type Policy = {
  id: string;
  name: string;
  retention_days: number | null;
  note: string | null;
  reviewed_at: string | null;
  current_review: boolean | null;
};
export function PrivacyOperations({
  receipts,
  policies,
}: {
  receipts: Receipt[];
  policies: Policy[];
}) {
  const [message, setMessage] = useState(""),
    [busy, start] = useTransition();
  return (
    <>
      <p className="notice" role="status">
        {message ||
          "사본 목록은 본인이 이 앱에서 생성 요청한 기록만 표시합니다. 다운로드 완료 여부와 별도로 만든 복사본은 저장 위치에서 확인해 주세요."}
      </p>
      {!!policies.length && (
        <section className="panel">
          <h2>학교별 동의·보관 기준 확인</h2>
          <p>
            동의서 원문·보호자 연락처 대신 학교에서 정한 관리 기준의 번호만
            기록하세요. 아래 확인은 법적 적합성의 자동 판정이나 학생의 동의
            승인을 대신하지 않습니다.
          </p>
          {policies.map((p) => (
            <details key={p.id}>
              <summary>
                {p.name} ·{" "}
                {p.current_review
                  ? "현재 보관 기준 확인됨"
                  : "보관 기준 확인 필요"}
              </summary>
              <p>
                현재 보관 일수: {p.retention_days ?? "미설정"} · 마지막 확인:{" "}
                {p.reviewed_at ? formatOperationsDate(p.reviewed_at) : "없음"}
              </p>
              <form
                className="ops-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  start(async () => {
                    const r = await savePrivacyReview({
                      classroom: p.id,
                      days: Number(f.get("days")),
                      note: String(f.get("note")),
                      confirmed: f.get("confirmed") === "on",
                      requestId: crypto.randomUUID(),
                    });
                    setMessage(r.message);
                  });
                }}
              >
                <label>
                  학교에서 정한 보관 일수
                  <input
                    type="number"
                    name="days"
                    min={30}
                    max={3650}
                    required
                    defaultValue={p.retention_days ?? 365}
                  />
                </label>
                <label>
                  동의·보관 운영 기준 관리번호
                  <input
                    name="note"
                    maxLength={200}
                    required
                    defaultValue={p.note ?? ""}
                  />
                </label>
                <label>
                  <input type="checkbox" name="confirmed" required />
                  학교에서 정한 동의 확인 방식과 보관 기준을 직접 확인했습니다.
                </label>
                <button className="button button-outline" disabled={busy}>
                  기준 확인 기록
                </button>
              </form>
            </details>
          ))}
        </section>
      )}
      <section className="panel">
        <h2>내보낸 사본의 보관·삭제 확인</h2>
        <p>
          원본을 지워도 Word·CSV·Google 사본과 운영자 백업은 별도로 남을 수
          있습니다. 계정 철회·학기 종료 때 보관 근거와 만료일을 확인하고, 필요한
          사본을 저장 위치에서 정리한 뒤 처리 상태를 남기세요.
        </p>
        {!receipts.length && (
          <p>
            새로 기록된 내보내기 사본이 없어요. 이전에 생성한 파일은 PC·Google
            Drive에서 직접 확인해 주세요.
          </p>
        )}
        {receipts.map((r) => (
          <article className="hub-record" key={r.id}>
            <h3>{r.title}</h3>
            <p>
              {formatOperationsDate(r.created_at)} · {r.format} ·{" "}
              {r.state === "removed"
                ? "저장 위치에서 정리했다고 확인함"
                : r.state === "retained"
                  ? "보관 근거 확인함"
                  : r.external_url
                    ? "Google 사본 생성 확인됨"
                    : "파일 생성 요청 · 다운로드 결과 확인 필요"}
            </p>
            {r.external_url && (
              <a
                className="text-link"
                href={r.external_url}
                target="_blank"
                rel="noreferrer"
              >
                해당 Google 사본 열기 →
              </a>
            )}
            <form
              className="ops-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                start(async () => {
                  const result = await saveReceipt({
                    id: r.id,
                    revision: r.revision,
                    state: String(f.get("state")),
                    due: String(f.get("due")) || null,
                    note: String(f.get("note")),
                  });
                  setMessage(result.message);
                });
              }}
            >
              <label>
                처리 상태
                <select
                  name="state"
                  defaultValue={r.state === "removed" ? "removed" : "retained"}
                >
                  <option value="retained">보관 근거 확인</option>
                  <option value="removed">저장 위치에서 정리 확인</option>
                </select>
              </label>
              <label>
                다음 확인일·보관 만료일
                <input type="date" name="due" defaultValue={r.due_on ?? ""} />
              </label>
              <label>
                관리번호·처리 메모
                <input name="note" maxLength={200} defaultValue={r.note} />
              </label>
              <label>
                <input type="checkbox" required />
                실제 저장 위치와 처리 결과를 직접 확인했습니다.
              </label>
              <button className="button button-outline" disabled={busy}>
                사본 관리 기록
              </button>
            </form>
          </article>
        ))}
      </section>
    </>
  );
}
